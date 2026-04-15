CREATE OR REPLACE FUNCTION public.guard_manual_override()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- GOVERNANCE: Allow full reset (status=pending + clear override)
  -- This permits bulk re-pricing to clear manually protected items
  IF NEW.status = 'pending' AND NEW.override_type IS NULL THEN
    RETURN NEW;
  END IF;

  -- Allow if: item wasn't manual before, OR new update is also manual
  IF OLD.override_type = 'manual'
     AND (NEW.override_type IS NULL OR NEW.override_type != 'manual')
     AND (NEW.source IS NULL OR NEW.source != 'manual') THEN
    -- Block: revert pricing fields to protect manual override
    NEW.override_type := OLD.override_type;
    NEW.override_at := OLD.override_at;
    NEW.override_by := OLD.override_by;
    NEW.override_reason := OLD.override_reason;
    NEW.source := OLD.source;
    NEW.unit_rate := OLD.unit_rate;
    NEW.total_price := OLD.total_price;
    NEW.materials := OLD.materials;
    NEW.labor := OLD.labor;
    NEW.equipment := OLD.equipment;
    NEW.logistics := OLD.logistics;
    NEW.risk := OLD.risk;
    NEW.profit := OLD.profit;
    NEW.confidence := OLD.confidence;
    NEW.status := OLD.status;
  END IF;
  RETURN NEW;
END;
$function$;