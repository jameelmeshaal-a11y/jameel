
-- Drop the constraint that was just added (it failed to apply but columns were added)
-- Re-add with 'priced' included
DO $$
BEGIN
  BEGIN
    ALTER TABLE public.boq_files DROP CONSTRAINT IF EXISTS boq_files_status_check;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$;

ALTER TABLE public.boq_files
  ADD CONSTRAINT boq_files_status_check
  CHECK (status IN ('uploaded', 'parsed', 'error', 'priced', 'draft', 'uploading', 'processing', 'ready', 'failed'));
