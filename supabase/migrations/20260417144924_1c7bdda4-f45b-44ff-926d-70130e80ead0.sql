-- Step 1: Delete ALL rate_sources (legacy approved/historical/supplier records)
DELETE FROM public.rate_sources;

-- Step 2: Reset ALL boq_items including manual overrides
-- guard_manual_override trigger allows: status='pending' + override_type=NULL
UPDATE public.boq_items
SET linked_rate_id = NULL,
    unit_rate = NULL,
    total_price = NULL,
    materials = NULL,
    labor = NULL,
    equipment = NULL,
    logistics = NULL,
    risk = NULL,
    profit = NULL,
    confidence = NULL,
    source = NULL,
    override_type = NULL,
    override_at = NULL,
    override_by = NULL,
    override_reason = NULL,
    manual_overrides = '{}'::jsonb,
    notes = NULL,
    status = 'pending';

-- Step 3: Reset all project totals to 0 (will be recalculated on next reprice)
UPDATE public.projects SET total_value = 0;