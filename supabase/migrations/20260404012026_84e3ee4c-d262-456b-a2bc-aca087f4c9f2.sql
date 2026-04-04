-- Fix audit log INSERT to enforce changed_by = auth.uid()
DROP POLICY IF EXISTS "Users can insert own audit log" ON public.pricing_audit_log;
CREATE POLICY "Users can insert own audit log" ON public.pricing_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    changed_by = auth.uid()
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
    )
  );