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
  v_detected_category text;
  v_library_id uuid;
  v_is_new boolean := false;
  v_result jsonb;
  v_keywords text[] := '{}'::text[];
  v_aliases text[] := '{}'::text[];
  v_note_suffix text;
BEGIN
  SELECT * INTO v_item FROM public.boq_items WHERE id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found: %', p_item_id;
  END IF;

  SELECT * INTO v_boq_file FROM public.boq_files WHERE id = p_boq_file_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BoQ file not found: %', p_boq_file_id;
  END IF;

  v_detected_category := CASE
    WHEN coalesce(v_item.description, '') ~* '(فتحة\s*وصول|access\s*hatch|roof\s*hatch)' THEN 'steel_misc'
    WHEN coalesce(v_item.description, '') ~* '(باب|أبواب|door)' THEN 'doors'
    WHEN coalesce(v_item.description, '') ~* '(نافذة|شباك|نوافذ|window)' THEN 'windows'
    WHEN coalesce(v_item.description, '') ~* '(سقف|أسقف|بلاطة|بلاطات|slab)' THEN 'slab_concrete'
    WHEN coalesce(v_item.description, '') ~* '(حديد|steel|معدن|metal|سلم\s*حديد)' THEN 'steel_misc'
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
            regexp_replace(coalesce(v_item.description, ''), '[ً-ٰٟ]', '', 'g'),
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

  v_aliases := ARRAY[
    coalesce(nullif(trim(v_item.description), ''), null),
    coalesce(nullif(trim(v_item.description_en), ''), null)
  ]::text[];

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

  SELECT rl.id
  INTO v_library_id
  FROM public.rate_library rl
  WHERE rl.unit = v_item.unit
    AND rl.is_locked = false
    AND (
      lower(coalesce(rl.standard_name_ar, '')) = lower(coalesce(v_item.description, ''))
      OR lower(coalesce(rl.item_description, '')) = lower(coalesce(v_item.description, ''))
      OR lower(coalesce(v_item.description, '')) = ANY(
        COALESCE(
          ARRAY(
            SELECT lower(alias)
            FROM unnest(coalesce(rl.item_name_aliases, '{}'::text[])) alias
          ),
          '{}'::text[]
        )
      )
      OR EXISTS (
        SELECT 1
        FROM unnest(coalesce(rl.item_name_aliases, '{}'::text[])) alias
        WHERE lower(coalesce(v_item.description, '')) LIKE '%' || lower(alias) || '%'
           OR lower(alias) LIKE '%' || lower(coalesce(v_item.description, '')) || '%'
      )
    )
  ORDER BY
    CASE WHEN rl.category = v_detected_category THEN 0 ELSE 1 END,
    CASE WHEN lower(coalesce(rl.standard_name_ar, '')) = lower(coalesce(v_item.description, '')) THEN 0 ELSE 1 END,
    rl.updated_at DESC
  LIMIT 1;

  IF v_library_id IS NULL THEN
    INSERT INTO public.rate_library (
      standard_name_ar,
      standard_name_en,
      item_description,
      category,
      unit,
      base_rate,
      target_rate,
      min_rate,
      max_rate,
      materials_pct,
      labor_pct,
      equipment_pct,
      logistics_pct,
      risk_pct,
      profit_pct,
      source_type,
      base_city,
      last_reviewed_at,
      approved_at,
      approved_by,
      created_by,
      keywords,
      item_name_aliases,
      notes
    )
    VALUES (
      coalesce(v_item.description, ''),
      coalesce(v_item.description_en, ''),
      coalesce(v_item.description, ''),
      v_detected_category,
      v_item.unit,
      p_unit_rate,
      p_unit_rate,
      round(p_unit_rate * 0.9, 2),
      round(p_unit_rate * 1.1, 2),
      CASE WHEN p_unit_rate > 0 THEN round((p_materials / p_unit_rate) * 100, 1) ELSE 0 END,
      CASE WHEN p_unit_rate > 0 THEN round((p_labor / p_unit_rate) * 100, 1) ELSE 0 END,
      CASE WHEN p_unit_rate > 0 THEN round((p_equipment / p_unit_rate) * 100, 1) ELSE 0 END,
      CASE WHEN p_unit_rate > 0 THEN round((p_logistics / p_unit_rate) * 100, 1) ELSE 0 END,
      CASE WHEN p_unit_rate > 0 THEN round((p_risk / p_unit_rate) * 100, 1) ELSE 0 END,
      CASE WHEN p_unit_rate > 0 THEN round((p_profit / p_unit_rate) * 100, 1) ELSE 0 END,
      'Approved',
      coalesce(v_boq_file.city, ''),
      now(),
      now(),
      p_user_id,
      p_user_id,
      v_keywords,
      array_remove(v_aliases, NULL),
      CASE
        WHEN p_correction_note IS NOT NULL AND btrim(p_correction_note) <> ''
          THEN '[تصحيح ' || to_char(now(), 'YYYY-MM-DD') || ']: ' || p_correction_note
        ELSE NULL
      END
    )
    RETURNING id INTO v_library_id;
    v_is_new := true;
  ELSE
    v_note_suffix := CASE
      WHEN p_correction_note IS NOT NULL AND btrim(p_correction_note) <> ''
        THEN '[تصحيح ' || to_char(now(), 'YYYY-MM-DD') || ']: ' || p_correction_note
      ELSE NULL
    END;

    UPDATE public.rate_library
    SET
      standard_name_ar = coalesce(nullif(trim(v_item.description), ''), standard_name_ar),
      standard_name_en = coalesce(nullif(trim(v_item.description_en), ''), standard_name_en),
      item_description = coalesce(nullif(trim(v_item.description), ''), item_description),
      category = CASE
        WHEN category IN ('windows', 'doors', 'slab_concrete') AND category <> v_detected_category AND v_detected_category = 'steel_misc'
          THEN v_detected_category
        WHEN category = 'general' THEN v_detected_category
        ELSE category
      END,
      unit = v_item.unit,
      base_rate = p_unit_rate,
      target_rate = p_unit_rate,
      min_rate = round(p_unit_rate * 0.9, 2),
      max_rate = round(p_unit_rate * 1.1, 2),
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
      keywords = CASE
        WHEN coalesce(array_length(keywords, 1), 0) = 0 THEN v_keywords
        ELSE ARRAY(
          SELECT DISTINCT kw FROM unnest(coalesce(keywords, '{}'::text[]) || v_keywords) kw WHERE kw IS NOT NULL AND kw <> ''
        )
      END,
      item_name_aliases = ARRAY(
        SELECT DISTINCT alias
        FROM unnest(coalesce(item_name_aliases, '{}'::text[]) || array_remove(v_aliases, NULL)) alias
        WHERE alias IS NOT NULL AND btrim(alias) <> ''
      ),
      notes = CASE
        WHEN v_note_suffix IS NOT NULL THEN concat_ws(E'\n', notes, v_note_suffix)
        ELSE notes
      END
    WHERE id = v_library_id;
  END IF;

  INSERT INTO public.rate_sources (rate_library_id, source_type, rate, is_verified, city, source_name, notes)
  VALUES (
    v_library_id,
    'Approved',
    p_unit_rate,
    true,
    coalesce(v_boq_file.city, ''),
    v_boq_file.name,
    'Synced from manual edit on item ' || coalesce(v_item.item_no, p_item_id::text)
  );

  UPDATE public.boq_items
  SET linked_rate_id = v_library_id
  WHERE id = p_item_id;

  UPDATE public.boq_items bi
  SET
    linked_rate_id = v_library_id,
    status = CASE WHEN bi.override_type = 'manual' THEN bi.status ELSE 'stale_price' END,
    notes = concat_ws(' | ', bi.notes, '🔁 تم ربط البند بآخر سعر يدوي معتمد في المكتبة')
  WHERE bi.unit = v_item.unit
    AND bi.id <> p_item_id
    AND (
      lower(coalesce(bi.description, '')) = lower(coalesce(v_item.description, ''))
      OR lower(coalesce(bi.description, '')) LIKE '%' || lower(coalesce(v_item.description, '')) || '%'
      OR lower(coalesce(v_item.description, '')) LIKE '%' || lower(coalesce(bi.description, '')) || '%'
    );

  PERFORM public.recalculate_project_total(v_boq_file.project_id);

  v_result := jsonb_build_object(
    'success', true,
    'library_id', v_library_id,
    'is_new', v_is_new,
    'detected_category', v_detected_category,
    'boq_file_name', v_boq_file.name
  );

  RETURN v_result;
END;
$$;

UPDATE public.rate_library
SET category = 'steel_misc',
    item_description = CASE
      WHEN coalesce(item_description, '') = '' THEN standard_name_ar
      ELSE item_description
    END,
    item_name_aliases = ARRAY(
      SELECT DISTINCT alias
      FROM unnest(coalesce(item_name_aliases, '{}'::text[]) || ARRAY['فتحة وصول للسطح','فتحة وصول للسطح السقف','Roof Access Hatch','Access Hatch']) alias
      WHERE alias IS NOT NULL AND btrim(alias) <> ''
    ),
    keywords = ARRAY(
      SELECT DISTINCT kw
      FROM unnest(coalesce(keywords, '{}'::text[]) || ARRAY['فتحه','وصول','سطح','roof','access','hatch']) kw
      WHERE kw IS NOT NULL AND btrim(kw) <> ''
    )
WHERE id = 'ca33cd50-79bb-4094-a3f3-248dc0170b9e';

UPDATE public.boq_items
SET linked_rate_id = 'ca33cd50-79bb-4094-a3f3-248dc0170b9e'
WHERE unit = 'عدد'
  AND (
    description ILIKE '%فتحة وصول للسطح%'
    OR description_en ILIKE '%access hatch%'
    OR description_en ILIKE '%roof hatch%'
  );