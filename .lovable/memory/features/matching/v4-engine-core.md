---
name: Matching V4.1 Engine Core (Strict Governance)
description: Strict 4-stage matching with category+unit-gated Stage 1, ≥80 threshold, target_rate as sole price source, no rate_sources
type: feature
---

The Matching V4.1 engine enforces a STRICT 4-stage sequential pipeline + 10 governance layers. No loose fallback below 80.

### Pipeline (strict order)

1. **Stage 1 — item_no Hard Override (≥95% similarity → confidence 99)**
   - SCOPED to same `boq_file_id` (via `sameFileLibraryIds: Set<string>`).
   - **GATED by Category compatibility AND Unit equality** — prevents the first wrong link from locking the file on a wrong category.
2. **Stage 2 — Category + Unit Gate** — hard filter (no scoring).
3. **Stage 3 — Description match (≥85)** — normalized Arabic + synonyms + Jaccard + n-gram + concept conflict.
4. **Stage 4 — Bundled strict (composite ≥80)** — text + category + keywords + codes + dimensions + synonym + containment + library kw + parent context + correction notes.

Below 80 → null (item stays `pending`).

### Governance protections (10 layers)

1. Full pricing reset migration: all `boq_items` → `pending`, `unit_rate=NULL`, `linked_rate_id=NULL`.
2. `categories_compatible` tightened — `general` no longer wildcards specific roots.
3. `rate_sources` table wiped + `fetchAllSources/resolveFromSources` removed from `pricingEngine.ts`.
4. `effectiveRate := matchedItem.target_rate` ALWAYS — no source weighting, no city multiplier.
5. Stage 1 requires Category + Unit match before firing.
6. Threshold raised 75 → 80 in both `matchingV3.ts` and edge function.
7. `flag_stale_boq_items` trigger + function dropped.
8. `location_factor` no longer multiplies (display-only via `priceFromApprovedRate`).
9. DB CHECK constraint `chk_unit_rate_matches_library` — no priced row without library link or manual override.
10. `verify_pricing_governance()` DB function + Admin Dashboard button.

### Files

- `src/lib/pricing/matchingV3.ts` — Stage 1 category gate, threshold 80
- `src/lib/pricingEngine.ts` — sourceResolver removed, effectiveRate=target_rate at 3 sites
- `supabase/functions/match-price-item/index.ts` — threshold 80, Stage 1 already gated
- `src/pages/AdminDashboard.tsx` — Governance check button
- Migration: purge + categories_compatible + drop trigger + CHECK + verify_pricing_governance()

### Removed

- ❌ Path C / loose fallback / rate_sources weighted average
- ❌ general↔specific category compatibility
- ❌ stale_price status (collapsed to pending)
