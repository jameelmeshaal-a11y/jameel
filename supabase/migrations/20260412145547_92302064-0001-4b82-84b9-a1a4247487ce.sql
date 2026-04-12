CREATE OR REPLACE FUNCTION public.flag_stale_boq_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.target_rate IS DISTINCT FROM NEW.target_rate THEN
    UPDATE boq_items
    SET status = 'stale_price'
    WHERE linked_rate_id = NEW.id
      AND unit_rate IS DISTINCT FROM NEW.target_rate
      AND status != 'stale_price'
      AND (override_type IS NULL OR override_type != 'manual');
  END IF;
  RETURN NEW;
END;
$$;