
-- Layer 1: Enable pg_trgm for similarity()
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA public;

-- Layer 1: Data cleanup — unlink mismatched items from library record 8db5d710
UPDATE public.boq_items
SET
  linked_rate_id = NULL,
  override_type = NULL,
  source = NULL,
  confidence = NULL,
  status = 'pending',
  override_reason = NULL,
  override_at = NULL,
  override_by = NULL
WHERE linked_rate_id = '8db5d710-80a9-4815-8e3b-671cd79577ac'
  AND id NOT IN (
    SELECT id FROM public.boq_items
    WHERE linked_rate_id = '8db5d710-80a9-4815-8e3b-671cd79577ac'
      AND item_no ILIKE '%Ws03%'
    LIMIT 1
  );

-- Layer 2: Update save_manual_price with similarity gate on Propagation 2
CREATE OR REPLACE FUNCTION public.save_manual_price(
  p_item_id uuid, p_boq_file_id uuid,
  p_materials numeric, p_labor numeric, p_equipment numeric,
  p_logistics numeric, p_risk numeric, p_profit numeric,
  p_unit_rate numeric, p_total_price numeric,
  p_manual_overrides jsonb DEFAULT '{}'::jsonb,
  p_correction_note text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_boq_file record;
  v_item record;
  v_detected_category text;
  v_library_id uuid;
  v_is_new boolean := false;
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

  v_detected_category := CASE
    WHEN v_primary_name_ar ~* '(فتحة\s*وصول|access\s*hatch|roof\s*hatch)' THEN 'steel_misc'
    WHEN v_primary_name_ar ~* '(باب|أبواب|door)' THEN 'doors'
    WHEN v_primary_name_ar ~* '(نافذة|شباك|نوافذ|window)' THEN 'windows'
    WHEN v_primary_name_ar ~* '(سقف|أسقف|بلاطة|بلاطات|slab)' THEN 'slab_concrete'
    WHEN v_primary_name_ar ~* '(حديد|steel|معدن|metal|سلم\s*حديد)' THEN 'steel_misc'
    ELSE 'general'
  END;

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
  SELECT rl.id
  INTO v_library_id
  FROM public.rate_library rl
  WHERE rl.unit = v_item.unit
    AND rl.is_locked = false
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

  IF v_library_id IS NULL THEN
    INSERT INTO public.rate_library (
      standard_name_ar, standard_name_en, item_description, category, unit,
      base_rate, target_rate, min_rate, max_rate,
      materials_pct, labor_pct, equipment_pct, logistics_pct, risk_pct, profit_pct,
      source_type, base_city, last_reviewed_at, approved_at, approved_by, created_by,
      keywords, item_name_aliases, notes
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
        THEN '[تصحيح ' || to_char(now(), 'YYYY-MM-DD') || ']: ' || p_correction_note ELSE NULL END
    )
    RETURNING id INTO v_library_id;
    v_is_new := true;
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
      keywords = ARRAY(SELECT DISTINCT kw FROM unnest(coalesce(keywords, '{}'::text[]) || v_keywords) kw WHERE kw IS NOT NULL AND kw <> ''),
      item_name_aliases = ARRAY(SELECT DISTINCT alias FROM unnest(coalesce(item_name_aliases, '{}'::text[]) || v_aliases) alias WHERE alias IS NOT NULL AND btrim(alias) <> ''),
      notes = CASE WHEN v_note_suffix IS NOT NULL THEN concat_ws(E'\n', notes, v_note_suffix) ELSE notes END
    WHERE id = v_library_id;
  END IF;

  -- Audit trail
  INSERT INTO public.rate_sources (rate_library_id, source_type, rate, is_verified, city, source_name, notes)
  VALUES (v_library_id, 'Approved', p_unit_rate, true, coalesce(v_boq_file.city, ''), v_boq_file.name,
    'Synced from manual edit on item ' || coalesce(v_item.item_no, p_item_id::text));

  -- Link the edited item itself
  UPDATE public.boq_items SET linked_rate_id = v_library_id WHERE id = p_item_id;

  -- *** Propagation 1: Same sub-item name ***
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
    AND (bi.override_type IS NULL OR bi.override_type != 'manual')
    AND public.extract_sub_item(bi.description) = v_sub_item_name
    AND char_length(v_sub_item_name) >= 5;

  GET DIAGNOSTICS v_linked_count = ROW_COUNT;

  -- *** Propagation 2: Same library item, same BoQ file + DESCRIPTION SIMILARITY GATE ***
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
    AND (bi.override_type IS NULL OR bi.override_type != 'manual')
    AND public.similarity(public.extract_sub_item(bi.description), v_sub_item_name) > 0.25;

  GET DIAGNOSTICS v_linked_count_2 = ROW_COUNT;
  v_linked_count := v_linked_count + v_linked_count_2;

  PERFORM public.recalculate_project_total(v_boq_file.project_id);

  v_result := jsonb_build_object(
    'success', true,
    'library_id', v_library_id,
    'is_new', v_is_new,
    'detected_category', v_detected_category,
    'primary_name_ar', v_primary_name_ar,
    'boq_file_name', v_boq_file.name,
    'linked_items_count', v_linked_count
  );

  RETURN v_result;
END;
$function$;
