-- LAYER 1: Full pricing reset
UPDATE public.boq_items SET
  unit_rate = NULL, total_price = NULL,
  materials = NULL, labor = NULL, equipment = NULL, logistics = NULL,
  risk = NULL, profit = NULL, confidence = NULL, source = NULL,
  status = 'pending', linked_rate_id = NULL,
  override_type = NULL, override_at = NULL, override_by = NULL,
  override_reason = NULL, manual_overrides = '{}'::jsonb;

-- LAYER 1b: Wipe rate_sources entirely
DELETE FROM public.rate_sources;

-- LAYER 2: Tighten categories_compatible — general no longer matches specific
CREATE OR REPLACE FUNCTION public.categories_compatible(cat_a text, cat_b text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN cat_a IS NULL OR cat_b IS NULL THEN false
    WHEN lower(split_part(cat_a, '_', 1)) = lower(split_part(cat_b, '_', 1)) THEN true
    -- general no longer wildcards — must match exact root
    WHEN lower(split_part(cat_a, '_', 1)) = 'general' OR lower(split_part(cat_b, '_', 1)) = 'general' THEN false
    WHEN lower(split_part(cat_a, '_', 1)) IN ('doors','windows','plumbing','hvac','electrical','concrete','earthworks','steel')
     AND lower(split_part(cat_b, '_', 1)) IN ('doors','windows','plumbing','hvac','electrical','concrete','earthworks','steel')
     AND lower(split_part(cat_a, '_', 1)) <> lower(split_part(cat_b, '_', 1)) THEN false
    ELSE false
  END;
$function$;

-- LAYER 7: Remove stale_price trigger + function
DROP TRIGGER IF EXISTS trg_flag_stale_boq_items ON public.rate_library;
DROP TRIGGER IF EXISTS flag_stale_boq_items_trigger ON public.rate_library;
DROP FUNCTION IF EXISTS public.flag_stale_boq_items() CASCADE;

-- Normalize any leftover stale_price status
UPDATE public.boq_items SET status = 'pending' WHERE status = 'stale_price';

-- LAYER 9: CHECK constraint — no priced row without library link or manual override
ALTER TABLE public.boq_items DROP CONSTRAINT IF EXISTS chk_unit_rate_matches_library;
ALTER TABLE public.boq_items ADD CONSTRAINT chk_unit_rate_matches_library
  CHECK (
    unit_rate IS NULL
    OR override_type = 'manual'
    OR linked_rate_id IS NOT NULL
  );

-- LAYER 10: Governance verification function
CREATE OR REPLACE FUNCTION public.verify_pricing_governance()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total_priced int := 0;
  v_drift_count int := 0;
  v_orphan_count int := 0;
  v_drift_samples jsonb;
BEGIN
  SELECT COUNT(*) INTO v_total_priced
  FROM public.boq_items WHERE unit_rate IS NOT NULL;

  SELECT COUNT(*) INTO v_drift_count
  FROM public.boq_items bi
  JOIN public.rate_library rl ON rl.id = bi.linked_rate_id
  WHERE bi.unit_rate IS NOT NULL
    AND bi.unit_rate <> rl.target_rate
    AND (bi.override_type IS NULL OR bi.override_type <> 'manual');

  SELECT COUNT(*) INTO v_orphan_count
  FROM public.boq_items bi
  WHERE bi.unit_rate IS NOT NULL
    AND bi.linked_rate_id IS NULL
    AND (bi.override_type IS NULL OR bi.override_type <> 'manual');

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'item_id', bi.id, 'item_no', bi.item_no, 'description', left(bi.description, 80),
    'unit_rate', bi.unit_rate, 'library_target', rl.target_rate,
    'library_name', rl.standard_name_ar
  )), '[]'::jsonb) INTO v_drift_samples
  FROM public.boq_items bi
  JOIN public.rate_library rl ON rl.id = bi.linked_rate_id
  WHERE bi.unit_rate IS NOT NULL
    AND bi.unit_rate <> rl.target_rate
    AND (bi.override_type IS NULL OR bi.override_type <> 'manual')
  LIMIT 20;

  RETURN jsonb_build_object(
    'total_priced', v_total_priced,
    'drift_count', v_drift_count,
    'orphan_count', v_orphan_count,
    'drift_samples', v_drift_samples,
    'healthy', (v_drift_count = 0 AND v_orphan_count = 0),
    'checked_at', now()
  );
END;
$function$;

-- Recalculate all project totals to zero
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.projects LOOP
    PERFORM public.recalculate_project_total(r.id);
  END LOOP;
END$$;