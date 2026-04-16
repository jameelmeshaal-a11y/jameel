
-- 1. Create categories_compatible function
CREATE OR REPLACE FUNCTION public.categories_compatible(cat_a text, cat_b text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN lower(split_part(cat_a, '_', 1)) = lower(split_part(cat_b, '_', 1)) THEN true
    WHEN lower(split_part(cat_a, '_', 1)) = 'general' OR lower(split_part(cat_b, '_', 1)) = 'general' THEN true
    WHEN lower(split_part(cat_a, '_', 1)) IN ('doors','windows','plumbing','hvac','electrical','concrete','earthworks')
     AND lower(split_part(cat_b, '_', 1)) IN ('doors','windows','plumbing','hvac','electrical','concrete','earthworks')
     AND lower(split_part(cat_a, '_', 1)) <> lower(split_part(cat_b, '_', 1)) THEN false
    ELSE true
  END;
$$;

-- 2. Create detect_category_from_description function
CREATE OR REPLACE FUNCTION public.detect_category_from_description(desc_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN desc_text ~* '(فتحة\s*وصول|access\s*hatch|roof\s*hatch)' THEN 'steel_misc'
    WHEN desc_text ~* '(باب|أبواب|door)' THEN 'doors'
    WHEN desc_text ~* '(نافذة|شباك|نوافذ|window)' THEN 'windows'
    WHEN desc_text ~* '(سقف|أسقف|بلاطة|بلاطات|slab)' THEN 'slab_concrete'
    WHEN desc_text ~* '(حديد|steel|معدن|metal|سلم\s*حديد)' THEN 'steel_misc'
    WHEN desc_text ~* '(صمام|أنابيب|مواسير|صرف|plumbing|pipe)' THEN 'plumbing'
    WHEN desc_text ~* '(تكييف|مجاري هواء|hvac|duct)' THEN 'hvac'
    WHEN desc_text ~* '(كابل|كهرب|لوحة توزيع|electrical)' THEN 'electrical'
    WHEN desc_text ~* '(خرسانة|concrete)' THEN 'concrete'
    WHEN desc_text ~* '(حفر|ردم|earthwork)' THEN 'earthworks'
    ELSE 'general'
  END;
$$;

-- 3. Replace save_manual_price with enhanced version
CREATE OR REPLACE FUNCTION public.save_manual_price(
  p_item_id uuid,
  p_boq_file_id uuid,
  p_materials numeric,
  p_labor numeric,
  p_equipment numeric,
  p_logistics numeric,
  p_risk numeric,
  p_profit numeric,
  p_unit_rate numeric,
  p_total_price numeric,
  p_manual_overrides jsonb DEFAULT '{}'::jsonb,
  p_correction_note text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_boq_file record;
  v_item record;
  v_detected_category text;
  v_library_id uuid;
  v_is_new boolean := false;
  v_is_existing_locked boolean := false;
  v_result jsonb;
  v_keywords text[] := '{}'::text[];
  v_aliases text[] := '{}'::text[];
  v_note_suffix text;
  v_primary_name_ar text;
  v_primary_name_en text;
  v_full_description_ar text;
  v_sub_item_name text;
  v_linked_count integer := 0;
  v_linked_count_2 integer := 0;
  v_existing_cat text;
  v_existing_unit text;
BEGIN
  SELECT * INTO v_item FROM public.boq_items WHERE id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found: %', p_item_id;
  END IF;

  SELECT * INTO v_boq_file FROM public.boq_files WHERE id = p_boq_file_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BoQ file not found: %', p_boq_file_id;
  END IF;

  v_full_description_ar := coalesce(trim(v_item.description), '');
  v_primary_name_ar := btrim(regexp_replace(v_full_description_ar, '^.*[—-]\s*', ''));
  IF v_primary_name_ar = '' OR char_length(v_primary_name_ar) > 160 OR char_length(v_primary_name_ar) < 3 THEN
    v_primary_name_ar := v_full_description_ar;
  END IF;

  v_sub_item_name := public.extract_sub_item(v_full_description_ar);

  v_primary_name_en := coalesce(nullif(trim(v_item.description_en), ''), '');
  IF position('—' in v_primary_name_en) > 0 THEN
    v_primary_name_en := btrim(regexp_replace(v_primary_name_en, '^.*[—-]\s*', ''));
  END IF;

  v_detected_category := public.detect_category_from_description(v_primary_name_ar);

  -- Build keywords
  SELECT coalesce(array_agg(DISTINCT token), '{}'::text[])
  INTO v_keywords
  FROM (
    SELECT nullif(
      regexp_replace(
        regexp_replace(part, '^(ال|وال|بال|لل|و|ب|ل|ف|ك)', ''),
        '[^ء-يA-Za-z0-9]+', '', 'g'
      ),
      ''
    ) AS token
    FROM regexp_split_to_table(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(v_primary_name_ar, '[ً-ٰٟ]', '', 'g'),
            '[إأآٱ]', 'ا', 'g'
          ),
          'ة', 'ه', 'g'
        ),
        'ى', 'ي', 'g'
      ),
      E'[\\s,،.؛;/\\()\\-–—]+'
    ) AS part
  ) tokens
  WHERE token IS NOT NULL AND char_length(token) >= 2;

  v_aliases := array_remove(ARRAY[
    nullif(v_primary_name_ar, ''),
    nullif(v_full_description_ar, ''),
    nullif(v_primary_name_en, ''),
    nullif(trim(v_item.description_en), '')
  ]::text[], NULL);

  -- Update the BoQ item itself
  UPDATE public.boq_items
  SET
    materials = p_materials,
    labor = p_labor,
    equipment = p_equipment,
    logistics = p_logistics,
    risk = p_risk,
    profit = p_profit,
    unit_rate = p_unit_rate,
    total_price = p_total_price,
    status = 'approved',
    override_type = 'manual',
    override_at = now(),
    override_by = p_user_id,
    override_reason = p_correction_note,
    manual_overrides = p_manual_overrides,
    source = 'manual',
    confidence = 100
  WHERE id = p_item_id;

  -- Find matching library record using EXACT matching only
  SELECT rl.id, rl.is_locked, rl.category, rl.unit
  INTO v_library_id, v_is_existing_locked, v_existing_cat, v_existing_unit
  FROM public.rate_library rl
  WHERE rl.unit = v_item.unit
    AND (
      lower(coalesce(rl.standard_name_ar, '')) = lower(v_primary_name_ar)
      OR lower(coalesce(rl.item_description, '')) = lower(v_full_description_ar)
      OR lower(v_primary_name_ar) = ANY(
        COALESCE(
          ARRAY(
            SELECT lower(btrim(alias))
            FROM unnest(coalesce(rl.item_name_aliases, '{}'::text[])) alias
          ),
          '{}'::text[]
        )
      )
      OR lower(v_full_description_ar) = ANY(
        COALESCE(
          ARRAY(
            SELECT lower(btrim(alias))
            FROM unnest(coalesce(rl.item_name_aliases, '{}'::text[])) alias
          ),
          '{}'::text[]
        )
      )
    )
  ORDER BY
    CASE WHEN rl.category = v_detected_category THEN 0 ELSE 1 END,
    CASE WHEN lower(coalesce(rl.standard_name_ar, '')) = lower(v_primary_name_ar) THEN 0 ELSE 1 END,
    rl.updated_at DESC
  LIMIT 1;

  -- Category/unit compatibility check on found library record
  IF v_library_id IS NOT NULL THEN
    IF NOT public.categories_compatible(v_existing_cat, v_detected_category) OR v_existing_unit <> v_item.unit THEN
      -- Incompatible: search for a compatible alternative
      SELECT rl.id, rl.is_locked INTO v_library_id, v_is_existing_locked
      FROM public.rate_library rl
      WHERE rl.unit = v_item.unit
        AND rl.category = v_detected_category
        AND (
          lower(rl.standard_name_ar) = lower(v_primary_name_ar)
          OR public.similarity(rl.standard_name_ar, v_primary_name_ar) > 0.4
        )
      ORDER BY public.similarity(rl.standard_name_ar, v_primary_name_ar) DESC
      LIMIT 1;
      -- If still null, will create new below
    END IF;
  END IF;

  IF v_library_id IS NULL THEN
    -- Create new library record (always is_locked = true for manual entries)
    INSERT INTO public.rate_library (
      standard_name_ar, standard_name_en, item_description, category, unit,
      base_rate, target_rate, min_rate, max_rate,
      materials_pct, labor_pct, equipment_pct, logistics_pct, risk_pct, profit_pct,
      source_type, base_city, last_reviewed_at, approved_at, approved_by, created_by,
      keywords, item_name_aliases, notes, is_locked
    )
    VALUES (
      coalesce(v_primary_name_ar, ''), coalesce(v_primary_name_en, ''),
      nullif(v_full_description_ar, ''), v_detected_category, v_item.unit,
      p_unit_rate, p_unit_rate, round(p_unit_rate * 0.9, 2), round(p_unit_rate * 1.1, 2),
      CASE WHEN p_unit_rate > 0 THEN round((p_materials / p_unit_rate) * 100, 1) ELSE 0 END,
      CASE WHEN p_unit_rate > 0 THEN round((p_labor / p_unit_rate) * 100, 1) ELSE 0 END,
      CASE WHEN p_unit_rate > 0 THEN round((p_equipment / p_unit_rate) * 100, 1) ELSE 0 END,
      CASE WHEN p_unit_rate > 0 THEN round((p_logistics / p_unit_rate) * 100, 1) ELSE 0 END,
      CASE WHEN p_unit_rate > 0 THEN round((p_risk / p_unit_rate) * 100, 1) ELSE 0 END,
      CASE WHEN p_unit_rate > 0 THEN round((p_profit / p_unit_rate) * 100, 1) ELSE 0 END,
      'Approved', coalesce(v_boq_file.city, ''), now(), now(), p_user_id, p_user_id,
      v_keywords, v_aliases,
      CASE WHEN p_correction_note IS NOT NULL AND btrim(p_correction_note) <> ''
        THEN '[تصحيح ' || to_char(now(), 'YYYY-MM-DD') || ']: ' || p_correction_note ELSE NULL END,
      true  -- is_locked = true for manual entries
    )
    RETURNING id INTO v_library_id;
    v_is_new := true;
    v_is_existing_locked := true;
  ELSE
    -- is_locked guard: if the record is locked, do NOT update it — just link
    IF v_is_existing_locked THEN
      NULL; -- Skip library update, just link the item
    ELSE
      v_note_suffix := CASE
        WHEN p_correction_note IS NOT NULL AND btrim(p_correction_note) <> ''
          THEN '[تصحيح ' || to_char(now(), 'YYYY-MM-DD') || ']: ' || p_correction_note ELSE NULL END;

      UPDATE public.rate_library
      SET
        standard_name_ar = coalesce(nullif(v_primary_name_ar, ''), standard_name_ar),
        standard_name_en = CASE WHEN nullif(v_primary_name_en, '') IS NOT NULL THEN v_primary_name_en ELSE standard_name_en END,
        item_description = CASE WHEN nullif(v_full_description_ar, '') IS NOT NULL THEN v_full_description_ar ELSE item_description END,
        category = CASE
          WHEN category IN ('windows', 'doors', 'slab_concrete') AND category <> v_detected_category AND v_detected_category = 'steel_misc' THEN v_detected_category
          WHEN category = 'general' THEN v_detected_category
          ELSE category END,
        unit = v_item.unit,
        base_rate = p_unit_rate, target_rate = p_unit_rate,
        min_rate = round(p_unit_rate * 0.9, 2), max_rate = round(p_unit_rate * 1.1, 2),
        materials_pct = CASE WHEN p_unit_rate > 0 THEN round((p_materials / p_unit_rate) * 100, 1) ELSE 0 END,
        labor_pct = CASE WHEN p_unit_rate > 0 THEN round((p_labor / p_unit_rate) * 100, 1) ELSE 0 END,
        equipment_pct = CASE WHEN p_unit_rate > 0 THEN round((p_equipment / p_unit_rate) * 100, 1) ELSE 0 END,
        logistics_pct = CASE WHEN p_unit_rate > 0 THEN round((p_logistics / p_unit_rate) * 100, 1) ELSE 0 END,
        risk_pct = CASE WHEN p_unit_rate > 0 THEN round((p_risk / p_unit_rate) * 100, 1) ELSE 0 END,
        profit_pct = CASE WHEN p_unit_rate > 0 THEN round((p_profit / p_unit_rate) * 100, 1) ELSE 0 END,
        source_type = 'Approved', last_reviewed_at = now(), approved_at = now(), approved_by = p_user_id,
        is_locked = true,  -- Lock on manual update
        keywords = ARRAY(SELECT DISTINCT kw FROM unnest(coalesce(keywords, '{}'::text[]) || v_keywords) kw WHERE kw IS NOT NULL AND kw <> ''),
        item_name_aliases = ARRAY(SELECT DISTINCT alias FROM unnest(coalesce(item_name_aliases, '{}'::text[]) || v_aliases) alias WHERE alias IS NOT NULL AND btrim(alias) <> ''),
        notes = CASE WHEN v_note_suffix IS NOT NULL THEN concat_ws(E'\n', notes, v_note_suffix) ELSE notes END
      WHERE id = v_library_id;
    END IF;
  END IF;

  -- Audit trail in rate_sources
  INSERT INTO public.rate_sources (rate_library_id, source_type, rate, is_verified, city, source_name, notes)
  VALUES (v_library_id, 'Approved', p_unit_rate, true, coalesce(v_boq_file.city, ''), v_boq_file.name,
    'Synced from manual edit on item ' || coalesce(v_item.item_no, p_item_id::text));

  -- Link the edited item itself
  UPDATE public.boq_items SET linked_rate_id = v_library_id WHERE id = p_item_id;

  -- *** Propagation 1: Same sub-item name + category check ***
  WITH p1_updated AS (
    UPDATE public.boq_items bi
    SET
      linked_rate_id = v_library_id,
      unit_rate = p_unit_rate,
      total_price = round(p_unit_rate * bi.quantity, 2),
      materials = p_materials,
      labor = p_labor,
      equipment = p_equipment,
      logistics = p_logistics,
      risk = p_risk,
      profit = p_profit,
      status = 'approved',
      override_type = 'manual',
      source = 'manual',
      confidence = 100,
      override_at = now(),
      override_by = p_user_id,
      override_reason = 'موروث من تسعير يدوي — ' || v_primary_name_ar,
      notes = concat_ws(' | ', bi.notes, '🔒 محمي يدوياً — موروث من بند ' || coalesce(v_item.item_no, p_item_id::text))
    WHERE bi.unit = v_item.unit
      AND bi.id <> p_item_id
      AND bi.boq_file_id = v_item.boq_file_id
      AND (bi.override_type IS NULL OR bi.override_type != 'manual')
      AND public.extract_sub_item(bi.description) = v_sub_item_name
      AND char_length(v_sub_item_name) >= 5
      AND public.detect_category_from_description(bi.description) = v_detected_category
    RETURNING bi.id
  )
  SELECT count(*) INTO v_linked_count FROM p1_updated;

  -- *** Propagation 2: Same library item + word_similarity + category check ***
  -- Uses CTE result to prevent double-updating rows from Propagation 1
  WITH p1_ids AS (
    SELECT bi2.id FROM public.boq_items bi2
    WHERE bi2.unit = v_item.unit
      AND bi2.id <> p_item_id
      AND bi2.boq_file_id = v_item.boq_file_id
      AND (bi2.override_type IS NULL OR bi2.override_type != 'manual')
      AND public.extract_sub_item(bi2.description) = v_sub_item_name
      AND char_length(v_sub_item_name) >= 5
      AND public.detect_category_from_description(bi2.description) = v_detected_category
  )
  UPDATE public.boq_items bi
  SET
    unit_rate = p_unit_rate,
    total_price = round(p_unit_rate * bi.quantity, 2),
    materials = p_materials,
    labor = p_labor,
    equipment = p_equipment,
    logistics = p_logistics,
    risk = p_risk,
    profit = p_profit,
    status = 'approved',
    override_type = 'manual',
    source = 'manual',
    confidence = 100,
    override_at = now(),
    override_by = p_user_id,
    override_reason = 'موروث من تسعير يدوي — مرتبط بنفس بند المكتبة',
    notes = concat_ws(' | ', bi.notes, '🔒 محمي يدوياً — موروث من بند ' || coalesce(v_item.item_no, p_item_id::text))
  WHERE bi.linked_rate_id = v_library_id
    AND bi.id <> p_item_id
    AND bi.boq_file_id = v_item.boq_file_id
    AND bi.unit = v_item.unit
    AND (bi.override_type IS NULL OR bi.override_type != 'manual')
    AND public.word_similarity(v_sub_item_name, public.extract_sub_item(bi.description)) > 0.65
    AND bi.id NOT IN (SELECT id FROM p1_ids)
    AND public.detect_category_from_description(bi.description) = v_detected_category;

  GET DIAGNOSTICS v_linked_count_2 = ROW_COUNT;
  v_linked_count := v_linked_count + v_linked_count_2;

  -- Audit log entry
  INSERT INTO public.pricing_audit_log (
    item_id, rate_library_id, project_id, action_type, change_scope,
    edit_type, old_values, new_values, reason, affected_items_count,
    master_rate_updated, changed_by
  ) VALUES (
    p_item_id, v_library_id, v_boq_file.project_id, 'manual_approval', 'item_and_library',
    'manual', jsonb_build_object('unit_rate', v_item.unit_rate),
    jsonb_build_object('unit_rate', p_unit_rate), p_correction_note,
    v_linked_count + 1, NOT v_is_existing_locked, p_user_id
  );

  PERFORM public.recalculate_project_total(v_boq_file.project_id);

  v_result := jsonb_build_object(
    'success', true,
    'library_id', v_library_id,
    'is_new', v_is_new,
    'detected_category', v_detected_category,
    'primary_name_ar', v_primary_name_ar,
    'boq_file_name', v_boq_file.name,
    'linked_items_count', v_linked_count,
    'protected_count', v_linked_count
  );

  RETURN v_result;
END;
$function$;
