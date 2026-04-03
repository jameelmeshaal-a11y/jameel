
-- Add new columns to rate_library
ALTER TABLE public.rate_library
  ADD COLUMN IF NOT EXISTS base_city TEXT NOT NULL DEFAULT 'Riyadh',
  ADD COLUMN IF NOT EXISTS target_rate NUMERIC,
  ADD COLUMN IF NOT EXISTS weight_class TEXT NOT NULL DEFAULT 'Medium',
  ADD COLUMN IF NOT EXISTS complexity TEXT NOT NULL DEFAULT 'Medium',
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'Manual',
  ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Rename item_name columns to standard_name
ALTER TABLE public.rate_library RENAME COLUMN item_name_ar TO standard_name_ar;
ALTER TABLE public.rate_library RENAME COLUMN item_name_en TO standard_name_en;

-- Set target_rate = base_rate for existing rows
UPDATE public.rate_library SET target_rate = base_rate WHERE target_rate IS NULL;

-- Make target_rate NOT NULL going forward
ALTER TABLE public.rate_library ALTER COLUMN target_rate SET NOT NULL;
ALTER TABLE public.rate_library ALTER COLUMN target_rate SET DEFAULT 0;
