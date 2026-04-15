---
name: Hardened Governance Rules
description: 5 locked governance rules for pricing engine integrity
type: feature
---

## 5 Locked Governance Rules

1. **item_no ≥95% + unit match = Hard Override (confidence 99)** — All paths (pre-scan + loop in matchingV3). Bypasses description scoring entirely.

2. **confidence < 70 = Pending with no price** — `pricingEngine.ts` writes NULL_PRICING_FIELDS + status="pending" and uses `continue` to skip general write path. DRY-RUN log active.

3. **Category conflicts = absolute block** — `INCOMPATIBLE_CATEGORY_GROUPS` enforced in matchingV3 (both pre-scan and loop) AND in `findHistoricalMatch` via `areCategoriesCompatible()`.

4. **Historical matches provide PRICES ONLY** — `findHistoricalMatch` no longer returns `overrideType`. `isInheritedManual` removed from pricingEngine. Historical matches NEVER grant manual protection.

5. **Global reset bypasses manual protection** — SQL trigger `guard_manual_override` allows reset when `NEW.status = 'pending' AND NEW.override_type IS NULL`.

## Files Modified
- `guard_manual_override` trigger (SQL migration)
- `src/lib/pricing/matchingV3.ts` — removed `!== description`, hard override return, exported `areCategoriesCompatible`
- `src/lib/pricing/priceMatchService.ts` — passes `itemNo` to Edge Function
- `src/hooks/usePriceLibrary.ts` — passes `itemNo` to Edge Function
- `src/lib/pricingEngine.ts` — category gate in historical, removed isInheritedManual, pending for <70
