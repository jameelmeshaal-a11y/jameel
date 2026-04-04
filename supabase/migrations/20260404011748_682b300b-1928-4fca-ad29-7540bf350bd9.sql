-- Drop old broad SELECT policies that override owner-scoped ones
DROP POLICY IF EXISTS "Auth users can view boq-files" ON storage.objects;
DROP POLICY IF EXISTS "Auth users can view documents" ON storage.objects;

-- Drop old broad INSERT policies that override owner-scoped ones
DROP POLICY IF EXISTS "Auth users can upload boq-files" ON storage.objects;
DROP POLICY IF EXISTS "Auth users can upload documents" ON storage.objects;

-- Also drop any other legacy broad policies
DROP POLICY IF EXISTS "Authenticated users can view boq-files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload boq-files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;