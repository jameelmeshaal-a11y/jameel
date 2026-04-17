-- 1.A — Unlink BoQ items not manually overridden, preserve approved prices as stale_price
UPDATE public.boq_items
SET linked_rate_id = NULL,
    status = CASE WHEN status = 'approved' THEN 'stale_price' ELSE 'pending' END
WHERE (override_type IS NULL OR override_type <> 'manual');

-- 1.B — Delete legacy rate_sources for non-approved, non-locked library entries
DELETE FROM public.rate_sources
WHERE rate_library_id IN (
  SELECT id FROM public.rate_library
  WHERE is_locked = false
    AND source_type <> 'Approved'
);

-- 1.B — Delete legacy rate_library entries (keep locked, approved, or still-referenced)
DELETE FROM public.rate_library
WHERE is_locked = false
  AND source_type <> 'Approved'
  AND id NOT IN (SELECT DISTINCT linked_rate_id FROM public.boq_items WHERE linked_rate_id IS NOT NULL);