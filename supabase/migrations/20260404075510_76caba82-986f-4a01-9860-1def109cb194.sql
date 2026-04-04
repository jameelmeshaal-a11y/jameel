
CREATE OR REPLACE FUNCTION public.recalculate_project_total(p_project_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_total numeric;
BEGIN
  SELECT COALESCE(SUM(bi.total_price), 0)
  INTO new_total
  FROM boq_items bi
  INNER JOIN boq_files bf ON bf.id = bi.boq_file_id
  WHERE bf.project_id = p_project_id;

  UPDATE projects
  SET total_value = new_total, updated_at = now()
  WHERE id = p_project_id;

  RETURN new_total;
END;
$$;
