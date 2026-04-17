-- Unify all "ردم" (backfill) library items to a single price of 40 SAR
UPDATE public.rate_library
SET base_rate = 40,
    target_rate = 40,
    min_rate = 40,
    max_rate = 40,
    last_reviewed_at = now(),
    notes = concat_ws(E'\n', notes, '[' || to_char(now(), 'YYYY-MM-DD') || '] توحيد سعر الردم بأنواعه إلى 40 ريال — حوكمة')
WHERE category = 'earthworks'
  AND (
    standard_name_ar ILIKE '%ردم%'
    OR item_description ILIKE '%ردم%'
  );

-- Reset all BoQ items currently linked to those library items so they get re-priced from 40
UPDATE public.boq_items
SET unit_rate = NULL,
    total_price = NULL,
    materials = NULL, labor = NULL, equipment = NULL, logistics = NULL,
    risk = NULL, profit = NULL,
    confidence = NULL,
    source = NULL,
    status = 'pending',
    linked_rate_id = NULL,
    override_type = NULL,
    override_at = NULL,
    override_by = NULL,
    override_reason = NULL,
    manual_overrides = '{}'::jsonb
WHERE description ILIKE '%ردم%';

-- Recalculate all project totals to reflect the cleared items
UPDATE public.projects p
SET total_value = COALESCE((
  SELECT SUM(bi.total_price)
  FROM public.boq_items bi
  INNER JOIN public.boq_files bf ON bf.id = bi.boq_file_id
  WHERE bf.project_id = p.id
), 0);