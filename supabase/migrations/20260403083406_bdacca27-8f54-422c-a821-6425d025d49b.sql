
-- Create location_factors table
CREATE TABLE public.location_factors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region TEXT NOT NULL UNIQUE,
  region_ar TEXT NOT NULL,
  zone_class TEXT NOT NULL DEFAULT 'A',
  location_factor NUMERIC NOT NULL DEFAULT 1.00,
  logistics_adder NUMERIC NOT NULL DEFAULT 0.00,
  labor_adder NUMERIC NOT NULL DEFAULT 0.00,
  accommodation_adder NUMERIC NOT NULL DEFAULT 0.00,
  risk_adder NUMERIC NOT NULL DEFAULT 0.00,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.location_factors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read location_factors" ON public.location_factors FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage location_factors" ON public.location_factors FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Add new columns to rate_library
ALTER TABLE public.rate_library
  ADD COLUMN IF NOT EXISTS includes_supply BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS includes_install BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS includes_testing BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS includes_transport_to_site BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS warranty_period_months INTEGER NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS vat_applicable BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS vat_rate NUMERIC NOT NULL DEFAULT 0.15,
  ADD COLUMN IF NOT EXISTS location_factor_required BOOLEAN NOT NULL DEFAULT true;

-- Seed 14 regions
INSERT INTO public.location_factors (region, region_ar, zone_class, location_factor, logistics_adder, labor_adder, accommodation_adder, risk_adder, notes) VALUES
('Riyadh', 'الرياض', 'A', 1.00, 0.00, 0.00, 0.00, 0.00, 'Base city — all rates defined here'),
('Jeddah', 'جدة', 'A', 1.04, 0.02, 0.02, 0.00, 0.00, 'Coastal city, similar market to Riyadh'),
('Dammam / Eastern Province', 'الدمام / المنطقة الشرقية', 'A', 1.05, 0.03, 0.02, 0.00, 0.00, 'Industrial hub, good supply chain'),
('Madinah', 'المدينة المنورة', 'B', 1.08, 0.05, 0.02, 0.01, 0.00, 'Some logistics premium'),
('Makkah', 'مكة المكرمة', 'B', 1.10, 0.05, 0.03, 0.02, 0.00, 'Access restrictions add cost'),
('Taif', 'الطائف', 'B', 1.12, 0.06, 0.03, 0.02, 0.01, 'Mountain roads, limited local supply'),
('Tabuk', 'تبوك', 'C', 1.22, 0.10, 0.05, 0.04, 0.03, 'Remote northwest, long haul from Riyadh'),
('Hail', 'حائل', 'C', 1.18, 0.08, 0.04, 0.04, 0.02, 'Central-north, moderate remoteness'),
('Asir (Abha / Khamis)', 'عسير (أبها / خميس مشيط)', 'C', 1.28, 0.12, 0.06, 0.06, 0.04, 'Southwest mountains. Humidity, steep roads, long supply chain.'),
('Jizan', 'جازان', 'C', 1.30, 0.13, 0.07, 0.06, 0.04, 'Coastal southwest, high humidity, limited supply chain'),
('Najran', 'نجران', 'D', 1.38, 0.16, 0.08, 0.08, 0.06, 'Border region, security considerations, very long supply chain'),
('Northern Borders (Arar / Rafha)', 'الحدود الشمالية (عرعر / رفحاء)', 'D', 1.42, 0.18, 0.09, 0.09, 0.06, 'Extreme remoteness, harsh climate, border zone premiums'),
('Al-Qurayyat / Turaif', 'القريات / طريف', 'D', 1.45, 0.20, 0.09, 0.09, 0.07, 'Northernmost cities, maximum logistics distance'),
('Remote Military / NEOM / Mega-Project Site', 'موقع عسكري أو ميجا بروجكت نائي', 'E', 1.55, 0.24, 0.12, 0.10, 0.09, 'No public infrastructure at site. Full camp setup required.');
