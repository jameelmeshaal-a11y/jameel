-- Fix audit log SELECT to include changed_by fallback
DROP POLICY IF EXISTS "Users can read own audit log" ON public.pricing_audit_log;
CREATE POLICY "Users can read own audit log" ON public.pricing_audit_log
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
    OR changed_by = auth.uid()
  );