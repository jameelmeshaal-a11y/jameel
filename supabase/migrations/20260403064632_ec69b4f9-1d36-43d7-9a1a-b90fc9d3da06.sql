
-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Projects table
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  cities TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('active', 'draft', 'archived')),
  boq_count INTEGER NOT NULL DEFAULT 0,
  total_value NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to projects" ON public.projects FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Project documents table
CREATE TABLE public.project_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT '',
  size TEXT NOT NULL DEFAULT '0',
  doc_category TEXT NOT NULL DEFAULT 'other' CHECK (doc_category IN ('core', 'technical', 'other')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to project_documents" ON public.project_documents FOR ALL USING (true) WITH CHECK (true);

-- BoQ files table
CREATE TABLE public.boq_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'parsed', 'priced', 'error')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.boq_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to boq_files" ON public.boq_files FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_boq_files_updated_at BEFORE UPDATE ON public.boq_files
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- BoQ items table
CREATE TABLE public.boq_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  boq_file_id UUID NOT NULL REFERENCES public.boq_files(id) ON DELETE CASCADE,
  item_no TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  description_en TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT '',
  quantity NUMERIC NOT NULL DEFAULT 0,
  unit_rate NUMERIC,
  total_price NUMERIC,
  materials NUMERIC,
  labor NUMERIC,
  equipment NUMERIC,
  logistics NUMERIC,
  risk NUMERIC,
  profit NUMERIC,
  confidence INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'review', 'conflict')),
  source TEXT CHECK (source IN ('library', 'ai', 'manual')),
  location_factor NUMERIC DEFAULT 1.0,
  notes TEXT,
  row_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.boq_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to boq_items" ON public.boq_items FOR ALL USING (true) WITH CHECK (true);

-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('boq-files', 'boq-files', true);

-- Storage policies
CREATE POLICY "Public read documents" ON storage.objects FOR SELECT USING (bucket_id = 'documents');
CREATE POLICY "Anyone can upload documents" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'documents');
CREATE POLICY "Anyone can delete documents" ON storage.objects FOR DELETE USING (bucket_id = 'documents');

CREATE POLICY "Public read boq-files" ON storage.objects FOR SELECT USING (bucket_id = 'boq-files');
CREATE POLICY "Anyone can upload boq-files" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'boq-files');
CREATE POLICY "Anyone can delete boq-files" ON storage.objects FOR DELETE USING (bucket_id = 'boq-files');
