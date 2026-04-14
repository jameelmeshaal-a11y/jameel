-- Ensure the trigger function exists (already created, but safe to re-create)
CREATE OR REPLACE FUNCTION public.flag_stale_boq_items()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- Drop existing trigger if any, then recreate
DROP TRIGGER IF EXISTS trg_flag_stale_items ON public.rate_library;

CREATE TRIGGER trg_flag_stale_items
  AFTER UPDATE ON public.rate_library
  FOR EACH ROW
  EXECUTE FUNCTION public.flag_stale_boq_items();