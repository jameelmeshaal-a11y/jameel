
-- 1. Add user_id columns
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.boq_files ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.project_documents ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Backfill existing rows: assign to first admin, or first user
DO $$
DECLARE
  _owner_id uuid;
BEGIN
  SELECT ur.user_id INTO _owner_id FROM public.user_roles ur WHERE ur.role = 'admin' LIMIT 1;
  IF _owner_id IS NULL THEN
    SELECT id INTO _owner_id FROM auth.users LIMIT 1;
  END IF;
  IF _owner_id IS NOT NULL THEN
    UPDATE public.projects SET user_id = _owner_id WHERE user_id IS NULL;
    UPDATE public.boq_files SET user_id = _owner_id WHERE user_id IS NULL;
    UPDATE public.project_documents SET user_id = _owner_id WHERE user_id IS NULL;
  END IF;
END $$;

-- 3. Make user_id NOT NULL after backfill
ALTER TABLE public.projects ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.boq_files ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.project_documents ALTER COLUMN user_id SET NOT NULL;

-- ============ DROP OLD PERMISSIVE POLICIES ============

-- projects
DROP POLICY IF EXISTS "Allow all access to projects" ON public.projects;

-- boq_files
DROP POLICY IF EXISTS "Allow all access to boq_files" ON public.boq_files;

-- boq_items
DROP POLICY IF EXISTS "Allow all access to boq_items" ON public.boq_items;

-- project_documents
DROP POLICY IF EXISTS "Allow all access to project_documents" ON public.project_documents;

-- ============ CREATE SECURE RLS POLICIES ============

-- projects: owner access
CREATE POLICY "Users can view own projects" ON public.projects
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can create own projects" ON public.projects
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own projects" ON public.projects
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can delete own projects" ON public.projects
  FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can view all projects" ON public.projects
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- boq_files: owner access via user_id
CREATE POLICY "Users can view own boq_files" ON public.boq_files
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can create own boq_files" ON public.boq_files
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own boq_files" ON public.boq_files
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can delete own boq_files" ON public.boq_files
  FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can manage all boq_files" ON public.boq_files
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- boq_items: access via parent boq_file ownership
CREATE POLICY "Users can view own boq_items" ON public.boq_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.boq_files bf WHERE bf.id = boq_file_id AND bf.user_id = auth.uid()));
CREATE POLICY "Users can create own boq_items" ON public.boq_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.boq_files bf WHERE bf.id = boq_file_id AND bf.user_id = auth.uid()));
CREATE POLICY "Users can update own boq_items" ON public.boq_items
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.boq_files bf WHERE bf.id = boq_file_id AND bf.user_id = auth.uid()));
CREATE POLICY "Users can delete own boq_items" ON public.boq_items
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.boq_files bf WHERE bf.id = boq_file_id AND bf.user_id = auth.uid()));
CREATE POLICY "Admins can manage all boq_items" ON public.boq_items
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- project_documents: owner access
CREATE POLICY "Users can view own project_documents" ON public.project_documents
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can create own project_documents" ON public.project_documents
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own project_documents" ON public.project_documents
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can delete own project_documents" ON public.project_documents
  FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can manage all project_documents" ON public.project_documents
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ SECURE STORAGE BUCKETS ============

-- Remove old anonymous policies on storage.objects
DROP POLICY IF EXISTS "Anyone can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete documents" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload boq-files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete boq-files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view documents" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view boq-files" ON storage.objects;

-- Secure storage: authenticated users only, scoped to their project files
CREATE POLICY "Auth users can view documents" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'documents');
CREATE POLICY "Auth users can upload documents" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'documents');
CREATE POLICY "Auth users can delete own documents" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'documents' AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.projects WHERE user_id = auth.uid()
  ));

CREATE POLICY "Auth users can view boq-files" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'boq-files');
CREATE POLICY "Auth users can upload boq-files" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'boq-files');
CREATE POLICY "Auth users can delete own boq-files" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'boq-files' AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.projects WHERE user_id = auth.uid()
  ));

-- ============ SECURE USER ROLES ============
-- user_roles already has proper admin-only policies, but ensure no public insert
DROP POLICY IF EXISTS "Anyone can insert roles" ON public.user_roles;
