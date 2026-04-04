
-- 1. Drop old restrictive check constraint
ALTER TABLE public.boq_items DROP CONSTRAINT IF EXISTS boq_items_status_check;

-- 2. Add new constraint with all canonical status values
ALTER TABLE public.boq_items ADD CONSTRAINT boq_items_status_check 
  CHECK (status = ANY (ARRAY['pending', 'approved', 'review', 'conflict', 'descriptive', 'invalid', 'needs_review', 'manual_override', 'project_override', 'priced']));

-- 3. Fix existing broken rows: zero quantity → descriptive
UPDATE public.boq_items 
SET status = 'descriptive', notes = 'Auto-classified: zero/empty quantity row'
WHERE (quantity IS NULL OR quantity <= 0) AND status NOT IN ('descriptive');

-- 4. Fix rows that may have had 'description' (old typo value) written
UPDATE public.boq_items 
SET status = 'descriptive'
WHERE status = 'description';
