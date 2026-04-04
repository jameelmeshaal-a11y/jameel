-- 1. Fix pricing_audit_log: scope SELECT to project owner or admin
DROP POLICY IF EXISTS "Anyone can read audit log" ON public.pricing_audit_log;
CREATE POLICY "Users can read own audit log" ON public.pricing_audit_log
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );

-- 2. Fix pricing_audit_log: scope INSERT to project owner or admin
DROP POLICY IF EXISTS "Authenticated can insert audit log" ON public.pricing_audit_log;
CREATE POLICY "Users can insert own audit log" ON public.pricing_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );

-- 3. Fix storage SELECT: scope to file owner via project ownership
DROP POLICY IF EXISTS "Authenticated can read documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can read boq-files" ON storage.objects;
DROP POLICY IF EXISTS "Auth read documents" ON storage.objects;
DROP POLICY IF EXISTS "Auth read boq-files" ON storage.objects;

CREATE POLICY "Owner can read documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.projects WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Owner can read boq-files" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'boq-files'
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.projects WHERE user_id = auth.uid()
      )
    )
  );

-- 4. Fix storage INSERT: scope to project owner
DROP POLICY IF EXISTS "Authenticated can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload boq-files" ON storage.objects;
DROP POLICY IF EXISTS "Auth upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Auth upload boq-files" ON storage.objects;

CREATE POLICY "Owner can upload documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.projects WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Owner can upload boq-files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'boq-files'
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.projects WHERE user_id = auth.uid()
      )
    )
  );