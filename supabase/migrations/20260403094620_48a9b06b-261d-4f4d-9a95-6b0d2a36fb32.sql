
-- Rate Sources table for multi-source pricing intelligence
CREATE TABLE public.rate_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rate_library_id UUID NOT NULL REFERENCES public.rate_library(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL DEFAULT 'Supplier' CHECK (source_type IN ('Supplier', 'Historical', 'Approved')),
  source_name TEXT NOT NULL DEFAULT '',
  project_name TEXT,
  city TEXT NOT NULL DEFAULT 'Riyadh',
  rate NUMERIC NOT NULL,
  date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.rate_sources ENABLE ROW LEVEL SECURITY;

-- Admins can manage all sources
CREATE POLICY "Admins can manage rate_sources"
  ON public.rate_sources FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Authenticated users can read sources
CREATE POLICY "Anyone can read rate_sources"
  ON public.rate_sources FOR SELECT
  TO authenticated
  USING (true);
