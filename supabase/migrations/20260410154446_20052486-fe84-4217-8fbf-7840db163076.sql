ALTER TABLE public.boq_items DROP CONSTRAINT IF EXISTS boq_items_source_check;
ALTER TABLE public.boq_items ADD CONSTRAINT boq_items_source_check 
  CHECK (source IN ('library', 'library-high', 'library-medium', 'ai', 'manual', 'project_override', 'master_update', 'bms-points-engine'));