-- Add UPDATE policies scoped to project owner for both storage buckets
CREATE POLICY "Owner can update documents" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'documents'
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.projects WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Owner can update boq-files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'boq-files'
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.projects WHERE user_id = auth.uid()
      )
    )
  );