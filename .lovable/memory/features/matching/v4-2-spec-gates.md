---
name: V4.2 Spec Gates (thickness + fire-rating)
description: Hard gates in matchingV3 to prevent wall 100/200/fire-60/fire-120 collapsing to one rate
type: feature
---

After category + unit gates, two new spec-aware gates run in `scoreCandidate`:

1. **Fire-rating HARD BLOCK** — `extractFireRating()` returns minutes (60/90/120/...) or 1 (generic) or 0. If presence-of-fire differs between BoQ and candidate → score=0. If both have specific minutes that differ → score=0.
2. **Thickness HARD PENALTY (-40)** — `extractThickness()` returns mm (20-2000). If both sides have thickness and they differ → score -=40, which drops most matches below the 80 threshold.

### Files
- `src/lib/pricing/matchingV3.ts` — `extractThickness`, `extractFireRating` exports + STAGE B.1 in `scoreCandidate` + penalty applied before Cap-99
- `src/lib/pricing/specGates.test.ts` — 14 regression tests proving 4 walls → 4 distinct rates

### Approval Exporter description-fallback (V4.2)
`approvalExporter.ts buildRowItemMap` now matches in 3 passes:
1. item_no exact (normalized: NBSP, Arabic digits stripped, whitespace removed)
2. description exact (normalized: diacritics + alif/ya/ta-marbuta + non-letter→space)
3. description containment (cand inside row text, ≥80% of shorter)

Fixes the case where DB `item_no` actually stores the description text (file "المطبخ والمغسلة عسير" had 0/378 matches → now matches via desc).
