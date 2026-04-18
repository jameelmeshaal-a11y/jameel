-- ============================================
-- Force Resync Tool: Merges duplicates + syncs all linked BoQ items
-- ============================================

-- 1. Function to find all duplicate library items (same normalized name + unit)
CREATE OR REPLACE FUNCTION public.find_duplicate_library_items()
RETURNS TABLE (
  normalized_name text,
  unit text,
  dup_count bigint,
  variants jsonb
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    lower(btrim(standard_name_ar)) AS normalized_name,
    unit,
    COUNT(*) AS dup_count,
    jsonb_agg(jsonb_build_object(
      'id', id,
      'name_ar', standard_name_ar,
      'base_rate', base_rate,
      'target_rate', target_rate,
      'updated_at', updated_at,
      'is_locked', is_locked,
      'approved_at', approved_at
    ) ORDER BY updated_at DESC) AS variants
  FROM public.rate_library
  GROUP BY 1, 2
  HAVING COUNT(*) > 1
  ORDER BY dup_count DESC, normalized_name;
$$;

-- 2. Function to find drift (boq_items with stale prices vs their linked rate)
CREATE OR REPLACE FUNCTION public.find_price_drift()
RETURNS TABLE (
  item_id uuid,
  item_no text,
  description text,
  boq_file_id uuid,
  boq_file_name text,
  current_unit_rate numeric,
  library_target_rate numeric,
  variance numeric,
  linked_rate_id uuid,
  library_name text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    bi.id, bi.item_no, left(bi.description, 100), bi.boq_file_id, bf.name,
    bi.unit_rate, rl.target_rate,
    round((bi.unit_rate - rl.target_rate)::numeric, 2),
    bi.linked_rate_id, rl.standard_name_ar
  FROM public.boq_items bi
  JOIN public.rate_library rl ON rl.id = bi.linked_rate_id
  JOIN public.boq_files bf ON bf.id = bi.boq_file_id
  WHERE bi.unit_rate IS NOT NULL
    AND bi.unit_rate <> rl.target_rate
    AND (bi.override_type IS NULL OR bi.override_type <> 'manual')
  ORDER BY abs(bi.unit_rate - rl.target_rate) DESC
  LIMIT 500;
$$;

-- 3. Force resync: updates a single rate item, merges duplicates, propagates to all boq_items
CREATE OR REPLACE FUNCTION public.force_resync_rate(
  p_rate_id uuid,
  p_new_price numeric,
  p_user_id uuid DEFAULT NULL,
  p_merge_duplicates boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_master record;
  v_merged_count int := 0;
  v_relinked_count int := 0;
  v_synced_items int := 0;
  v_old_price numeric;
  v_dup_ids uuid[];
  v_affected_files uuid[];
BEGIN
  -- 1. Load the master record
  SELECT * INTO v_master FROM public.rate_library WHERE id = p_rate_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rate library item not found: %', p_rate_id;
  END IF;
  v_old_price := v_master.target_rate;

  -- 2. Update master with new price
  UPDATE public.rate_library
  SET base_rate = p_new_price,
      target_rate = p_new_price,
      min_rate = round(p_new_price * 0.9, 2),
      max_rate = round(p_new_price * 1.1, 2),
      updated_at = now(),
      last_reviewed_at = now()
  WHERE id = p_rate_id;

  -- 3. Find duplicates (same normalized name + unit)
  IF p_merge_duplicates THEN
    SELECT array_agg(id) INTO v_dup_ids
    FROM public.rate_library
    WHERE id <> p_rate_id
      AND lower(btrim(standard_name_ar)) = lower(btrim(v_master.standard_name_ar))
      AND unit = v_master.unit;

    IF v_dup_ids IS NOT NULL AND array_length(v_dup_ids, 1) > 0 THEN
      -- Re-link any boq_items pointing to the duplicates → master
      UPDATE public.boq_items
      SET linked_rate_id = p_rate_id
      WHERE linked_rate_id = ANY(v_dup_ids);
      GET DIAGNOSTICS v_relinked_count = ROW_COUNT;

      -- Delete the duplicate library rows
      DELETE FROM public.rate_library WHERE id = ANY(v_dup_ids);
      GET DIAGNOSTICS v_merged_count = ROW_COUNT;
    END IF;
  END IF;

  -- 4. Sync ALL boq_items linked to master (skip manual overrides)
  WITH updated AS (
    UPDATE public.boq_items
    SET unit_rate = p_new_price,
        total_price = round(p_new_price * quantity, 2),
        status = CASE WHEN status = 'pending' THEN 'priced' ELSE status END,
        source = COALESCE(source, 'library_resync')
    WHERE linked_rate_id = p_rate_id
      AND (override_type IS NULL OR override_type <> 'manual')
    RETURNING boq_file_id
  )
  SELECT count(*), array_agg(DISTINCT boq_file_id) INTO v_synced_items, v_affected_files FROM updated;

  -- 5. Recalculate project totals for affected files
  IF v_affected_files IS NOT NULL THEN
    PERFORM public.recalculate_project_total(bf.project_id)
    FROM public.boq_files bf
    WHERE bf.id = ANY(v_affected_files);
  END IF;

  -- 6. Audit log
  INSERT INTO public.price_change_log (rate_library_id, old_price, new_price, changed_by, change_reason)
  VALUES (p_rate_id, v_old_price, p_new_price, COALESCE(p_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
          format('Force resync — merged %s duplicates, relinked %s items, synced %s BoQ rows',
                 v_merged_count, v_relinked_count, v_synced_items));

  RETURN jsonb_build_object(
    'success', true,
    'rate_id', p_rate_id,
    'old_price', v_old_price,
    'new_price', p_new_price,
    'merged_duplicates', v_merged_count,
    'relinked_items', v_relinked_count,
    'synced_boq_items', v_synced_items,
    'affected_boq_files', COALESCE(array_length(v_affected_files, 1), 0)
  );
END;
$$;

-- 4. Bulk merge: merges ALL duplicate groups (keeps newest by updated_at)
CREATE OR REPLACE FUNCTION public.bulk_merge_duplicates(p_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group record;
  v_master_id uuid;
  v_dup_ids uuid[];
  v_total_merged int := 0;
  v_total_relinked int := 0;
  v_groups_processed int := 0;
BEGIN
  FOR v_group IN
    SELECT lower(btrim(standard_name_ar)) AS norm_name, unit
    FROM public.rate_library
    GROUP BY 1, 2
    HAVING COUNT(*) > 1
  LOOP
    -- Pick the newest as master
    SELECT id INTO v_master_id
    FROM public.rate_library
    WHERE lower(btrim(standard_name_ar)) = v_group.norm_name AND unit = v_group.unit
    ORDER BY updated_at DESC, approved_at DESC NULLS LAST
    LIMIT 1;

    SELECT array_agg(id) INTO v_dup_ids
    FROM public.rate_library
    WHERE lower(btrim(standard_name_ar)) = v_group.norm_name AND unit = v_group.unit AND id <> v_master_id;

    IF v_dup_ids IS NOT NULL AND array_length(v_dup_ids, 1) > 0 THEN
      WITH r AS (
        UPDATE public.boq_items SET linked_rate_id = v_master_id
        WHERE linked_rate_id = ANY(v_dup_ids)
        RETURNING 1
      )
      SELECT count(*) INTO v_total_relinked FROM (SELECT v_total_relinked + count(*) AS c FROM r) x;

      DELETE FROM public.rate_library WHERE id = ANY(v_dup_ids);
      v_total_merged := v_total_merged + array_length(v_dup_ids, 1);
    END IF;
    v_groups_processed := v_groups_processed + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'groups_processed', v_groups_processed,
    'duplicates_deleted', v_total_merged,
    'items_relinked', v_total_relinked
  );
END;
$$;