
ALTER TABLE public.boq_files
  ADD COLUMN IF NOT EXISTS facility_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS facility_type text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS city text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS remoteness_level text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS location_factor numeric NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS pricing_mode text NOT NULL DEFAULT 'review',
  ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS package_code text NULL,
  ADD COLUMN IF NOT EXISTS discipline text NULL,
  ADD COLUMN IF NOT EXISTS special_remarks text NULL;
