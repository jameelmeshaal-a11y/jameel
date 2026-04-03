
-- Pricing audit log for tracking all rate changes
CREATE TABLE public.pricing_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid REFERENCES public.boq_items(id) ON DELETE SET NULL,
  rate_library_id uuid REFERENCES public.rate_library(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  action_type text NOT NULL DEFAULT 'update',
  change_scope text NOT NULL DEFAULT 'item_only',
  edit_type text NOT NULL DEFAULT 'project_override',
  changed_fields jsonb NOT NULL DEFAULT '{}',
  old_values jsonb NOT NULL DEFAULT '{}',
  new_values jsonb NOT NULL DEFAULT '{}',
  reason text,
  affected_items_count integer NOT NULL DEFAULT 1,
  master_rate_updated boolean NOT NULL DEFAULT false,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pricing_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read audit log" ON public.pricing_audit_log
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert audit log" ON public.pricing_audit_log
  FOR INSERT TO authenticated WITH CHECK (true);

-- Add override tracking fields to boq_items
ALTER TABLE public.boq_items
  ADD COLUMN IF NOT EXISTS override_type text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS override_reason text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS override_by uuid DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS override_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS manual_overrides jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS linked_rate_id uuid REFERENCES public.rate_library(id) ON DELETE SET NULL DEFAULT NULL;
