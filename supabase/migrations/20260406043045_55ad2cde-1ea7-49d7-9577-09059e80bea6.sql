
-- 1. New table: project_budget_distribution
CREATE TABLE public.project_budget_distribution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  total_amount numeric NOT NULL DEFAULT 0,
  materials_percentage numeric NOT NULL DEFAULT 45,
  labor_percentage numeric NOT NULL DEFAULT 30,
  equipment_percentage numeric NOT NULL DEFAULT 15,
  other_percentage numeric NOT NULL DEFAULT 10,
  materials_amount numeric NOT NULL DEFAULT 0,
  labor_amount numeric NOT NULL DEFAULT 0,
  equipment_amount numeric NOT NULL DEFAULT 0,
  other_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_budget_distribution ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own budget distributions"
  ON public.project_budget_distribution FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage all budget distributions"
  ON public.project_budget_distribution FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 2. New table: price_change_log
CREATE TABLE public.price_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid REFERENCES public.boq_items(id) ON DELETE SET NULL,
  rate_library_id uuid REFERENCES public.rate_library(id) ON DELETE SET NULL,
  old_price numeric,
  new_price numeric,
  changed_by uuid NOT NULL,
  change_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.price_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own price changes"
  ON public.price_change_log FOR INSERT
  TO authenticated
  WITH CHECK (changed_by = auth.uid());

CREATE POLICY "Users can view own price changes"
  ON public.price_change_log FOR SELECT
  TO authenticated
  USING (changed_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- 3. Extend rate_library with price_library columns
ALTER TABLE public.rate_library
  ADD COLUMN IF NOT EXISTS item_code text DEFAULT '',
  ADD COLUMN IF NOT EXISTS item_name_aliases text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;
