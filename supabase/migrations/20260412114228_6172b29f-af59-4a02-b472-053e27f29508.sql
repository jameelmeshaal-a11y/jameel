
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
      AND status != 'stale_price';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_flag_stale_items
AFTER UPDATE ON rate_library
FOR EACH ROW
EXECUTE FUNCTION flag_stale_boq_items();
