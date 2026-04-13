
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
AS $$
DECLARE
  v_boq_file record;
  v_item record;
  v_category text;
  v_library_id uuid;
  v_is_new boolean := false;
  v_result jsonb;
BEGIN
  -- 1. Fetch item and boq_file
  SELECT * INTO v_item FROM boq_items WHERE id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found: %', p_item_id;
  END IF;

  SELECT * INTO v_boq_file FROM boq_files WHERE id = p_boq_file_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BoQ file not found: %', p_boq_file_id;
  END IF;

  -- 2. Update boq_items (this always succeeds for the owner due to RLS bypass via SECURITY DEFINER)
  UPDATE boq_items SET
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
    source = 'manual'
  WHERE id = p_item_id;

  -- 3. Try to find existing linked rate or matching rate in library
  v_library_id := v_item.linked_rate_id;

  -- If no linked rate, try to find by exact name + unit match
  IF v_library_id IS NULL THEN
    SELECT id INTO v_library_id
    FROM rate_library
    WHERE standard_name_ar = v_item.description
      AND unit = v_item.unit
      AND is_locked = false
    LIMIT 1;
  END IF;

  -- 4. Update or insert rate_library
  IF v_library_id IS NOT NULL THEN
    -- Check if locked
    IF EXISTS (SELECT 1 FROM rate_library WHERE id = v_library_id AND is_locked = true) THEN
      -- Locked — skip library update but still link
      NULL;
    ELSE
      UPDATE rate_library SET
        base_rate = p_unit_rate,
        target_rate = p_unit_rate,
        materials_pct = CASE WHEN p_unit_rate > 0 THEN round((p_materials / p_unit_rate) * 100, 1) ELSE 0 END,
        labor_pct = CASE WHEN p_unit_rate > 0 THEN round((p_labor / p_unit_rate) * 100, 1) ELSE 0 END,
        equipment_pct = CASE WHEN p_unit_rate > 0 THEN round((p_equipment / p_unit_rate) * 100, 1) ELSE 0 END,
        logistics_pct = CASE WHEN p_unit_rate > 0 THEN round((p_logistics / p_unit_rate) * 100, 1) ELSE 0 END,
        risk_pct = CASE WHEN p_unit_rate > 0 THEN round((p_risk / p_unit_rate) * 100, 1) ELSE 0 END,
        profit_pct = CASE WHEN p_unit_rate > 0 THEN round((p_profit / p_unit_rate) * 100, 1) ELSE 0 END,
        source_type = 'Approved',
        last_reviewed_at = now(),
        approved_at = now(),
        approved_by = p_user_id,
        notes = CASE 
          WHEN p_correction_note IS NOT NULL THEN
            COALESCE(notes || E'\n', '') || '[تصحيح ' || to_char(now(), 'YYYY-MM-DD') || ']: ' || p_correction_note
          ELSE notes
        END
      WHERE id = v_library_id;
    END IF;
    v_is_new := false;
  ELSE
    -- Insert new library entry
    INSERT INTO rate_library (
      standard_name_ar, standard_name_en, category, unit,
      base_rate, target_rate, min_rate, max_rate,
      materials_pct, labor_pct, equipment_pct, logistics_pct, risk_pct, profit_pct,
      source_type, base_city, last_reviewed_at, approved_at, approved_by, created_by,
      notes
    ) VALUES (
      v_item.description,
      COALESCE(v_item.description_en, ''),
      COALESCE((SELECT category FROM rate_library WHERE id = v_item.linked_rate_id LIMIT 1), 'أعمال عامة'),
      v_item.unit,
      p_unit_rate, p_unit_rate,
      round(p_unit_rate * 0.9, 2), round(p_unit_rate * 1.1, 2),
      CASE WHEN p_unit_rate > 0 THEN round((p_materials / p_unit_rate) * 100, 1) ELSE 0 END,
      CASE WHEN p_unit_rate > 0 THEN round((p_labor / p_unit_rate) * 100, 1) ELSE 0 END,
      CASE WHEN p_unit_rate > 0 THEN round((p_equipment / p_unit_rate) * 100, 1) ELSE 0 END,
      CASE WHEN p_unit_rate > 0 THEN round((p_logistics / p_unit_rate) * 100, 1) ELSE 0 END,
      CASE WHEN p_unit_rate > 0 THEN round((p_risk / p_unit_rate) * 100, 1) ELSE 0 END,
      CASE WHEN p_unit_rate > 0 THEN round((p_profit / p_unit_rate) * 100, 1) ELSE 0 END,
      'Approved',
      COALESCE(v_boq_file.city, ''),
      now(), now(), p_user_id, p_user_id,
      CASE WHEN p_correction_note IS NOT NULL 
        THEN '[تصحيح ' || to_char(now(), 'YYYY-MM-DD') || ']: ' || p_correction_note
        ELSE NULL
      END
    )
    RETURNING id INTO v_library_id;
    v_is_new := true;
  END IF;

  -- 5. Insert rate_source
  INSERT INTO rate_sources (rate_library_id, source_type, rate, is_verified, city, source_name, notes)
  VALUES (
    v_library_id,
    'Approved',
    p_unit_rate,
    true,
    COALESCE(v_boq_file.city, ''),
    v_boq_file.name,
    'Synced from manual edit on item ' || COALESCE(v_item.item_no, p_item_id::text)
  );

  -- 6. Link boq_item to library
  UPDATE boq_items SET linked_rate_id = v_library_id WHERE id = p_item_id;

  -- 7. Recalculate project total
  PERFORM recalculate_project_total(v_boq_file.project_id);

  -- 8. Return result
  v_result := jsonb_build_object(
    'success', true,
    'library_id', v_library_id,
    'is_new', v_is_new,
    'boq_file_name', v_boq_file.name
  );

  RETURN v_result;
END;
$$;
