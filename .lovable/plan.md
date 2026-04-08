

# Fix: 0.08 Pricing Multiplier Bug + BoQ Data Reset

## Root Cause

In `priceFromApprovedRate()` (pricingEngine.ts, line 236-245):

```text
totalPct = materials_pct + labor_pct + equipment_pct + logistics_pct
safePct = totalPct > 0 ? totalPct : 100

materials = rate × (materials_pct / safePct)   ← 0/100 = 0
labor     = rate × (labor_pct / safePct)       ← 0/100 = 0
equipment = rate × (equipment_pct / safePct)   ← 0/100 = 0
logistics = rate × (logistics_pct / safePct)   ← 0/100 = 0
risk      = rate × (risk_pct / 100)            ← 3/100 = 0.03
profit    = rate × (profit_pct / 100)          ← 5/100 = 0.05

unitRate = 0 + 0 + 0 + 0 + 0.03×rate + 0.05×rate = 0.08 × rate
```

When library items have default percentage breakdowns (all zeros), the approved rate gets reduced to 8%.

## Fix Strategy

Replace `priceFromApprovedRate()` with correct logic:

1. **If breakdown percentages are all zero**: use the approved rate directly as `unitRate`. Set `materials = approvedRate` (the full cost), all others = 0. Risk and profit are already included in the approved rate per the system policy.
2. **If breakdown percentages exist (sum > 0)**: distribute the approved rate proportionally across components. Risk/profit are treated as part of the distribution, not as additional multipliers on top.

The key principle: **the approved rate IS the unit rate**. Breakdown is for display only — it must never reduce the total.

## Changes

### 1. `src/lib/pricingEngine.ts` — Fix `priceFromApprovedRate()`

Replace lines 222-254 with corrected logic:

```typescript
function priceFromApprovedRate(
  approvedRate: number,
  libraryItem: RateLibraryItem,
  quantity: number,
  locationFactor: number,
  baseCity: string,
  projectCity: string,
): Omit<PricedResult, "category" | "explanation" | "priceFlag"> {
  // Only apply location factor if cities differ
  const needsLocationAdj = baseCity && projectCity &&
    baseCity.toLowerCase().trim() !== projectCity.toLowerCase().trim();
  const adjustedRate = needsLocationAdj 
    ? +(approvedRate * locationFactor).toFixed(2) 
    : approvedRate;

  // Breakdown is DISPLAY ONLY — adjustedRate IS the unit rate
  const totalPct = libraryItem.materials_pct + libraryItem.labor_pct +
    libraryItem.equipment_pct + libraryItem.logistics_pct +
    libraryItem.risk_pct + libraryItem.profit_pct;

  let materials, labor, equipment, logistics, risk, profit;

  if (totalPct > 0) {
    // Distribute the rate proportionally (all components sum to adjustedRate)
    materials  = +(adjustedRate * libraryItem.materials_pct / totalPct).toFixed(2);
    labor      = +(adjustedRate * libraryItem.labor_pct / totalPct).toFixed(2);
    equipment  = +(adjustedRate * libraryItem.equipment_pct / totalPct).toFixed(2);
    logistics  = +(adjustedRate * libraryItem.logistics_pct / totalPct).toFixed(2);
    risk       = +(adjustedRate * libraryItem.risk_pct / totalPct).toFixed(2);
    profit     = +(adjustedRate * libraryItem.profit_pct / totalPct).toFixed(2);
  } else {
    // No breakdown info — full rate goes to materials (display convention)
    materials = adjustedRate;
    labor = 0; equipment = 0; logistics = 0; risk = 0; profit = 0;
  }

  const unitRate = adjustedRate;  // ALWAYS equals the approved rate
  const totalPrice = +(unitRate * quantity).toFixed(2);

  return {
    materials, labor, equipment, logistics, risk, profit,
    unitRate, totalPrice,
    confidence: 95,
    locationFactor: needsLocationAdj ? +locationFactor.toFixed(4) : 1.0,
  };
}
```

### 2. `src/lib/pricingEngine.ts` — Improve matching for unmatched items

In `findRateLibraryMatch()`, add `item_description` field matching with higher weight so items with full descriptions in the library get matched even when primary names differ slightly. Already partially implemented but the `item_description` path caps at `descSim * 40` — raise to `descSim * 60` to match alias weight.

### 3. Data Reset — Delete BoQ data

Clear `boq_items`, `boq_files`, `price_change_log`, `pricing_audit_log` so the user can re-upload and re-price with the fixed engine.

```sql
DELETE FROM boq_items;
DELETE FROM boq_files;
DELETE FROM price_change_log;
DELETE FROM pricing_audit_log;
UPDATE projects SET boq_count = 0, total_value = 0;
```

## What Is NOT Changed

- Rate library data — preserved
- Schema/tables — no changes
- Authentication — untouched
- AI policy — still zero AI pricing
- Edge functions — untouched

## Files Changed

| File | Change |
|---|---|
| `src/lib/pricingEngine.ts` | Fix `priceFromApprovedRate()` to use approved rate directly; improve `item_description` matching weight |
| Data operation | Clear BoQ data tables for re-upload |

