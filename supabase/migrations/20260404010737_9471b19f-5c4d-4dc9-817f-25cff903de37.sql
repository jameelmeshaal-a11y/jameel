
-- 1. Make buckets private
UPDATE storage.buckets SET public = false WHERE id IN ('documents', 'boq-files');

-- 2. Drop old public SELECT policies on storage
DROP POLICY IF EXISTS "Public read documents" ON storage.objects;
DROP POLICY IF EXISTS "Public read boq-files" ON storage.objects;

-- 3. Fix pricing_audit_log INSERT policy (currently WITH CHECK true)
DROP POLICY IF EXISTS "Authenticated can insert audit log" ON public.pricing_audit_log;
CREATE POLICY "Authenticated can insert audit log" ON public.pricing_audit_log
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
