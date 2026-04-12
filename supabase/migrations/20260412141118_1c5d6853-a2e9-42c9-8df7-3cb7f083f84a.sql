
ALTER TABLE public.boq_items DROP CONSTRAINT boq_items_status_check;
ALTER TABLE public.boq_items ADD CONSTRAINT boq_items_status_check
  CHECK (status = ANY (ARRAY[
    'pending', 'approved', 'review', 'conflict', 'descriptive',
    'invalid', 'needs_review', 'manual_override', 'project_override',
    'priced', 'unmatched', 'stale_price'
  ]));
