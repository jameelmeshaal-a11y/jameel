-- Clear the single orphan priced row (no linked_rate_id, not manual) discovered by verify_pricing_governance
UPDATE public.boq_items
SET unit_rate=NULL, total_price=NULL, materials=NULL, labor=NULL, equipment=NULL,
    logistics=NULL, risk=NULL, profit=NULL, confidence=NULL, source=NULL,
    status='pending', linked_rate_id=NULL
WHERE id='c6abb32b-3a04-43c1-8ef9-caf6a8a71bb8';

-- Recalculate the project total
SELECT public.recalculate_project_total('29dae45a-708e-4954-887d-28b3c45a3163');