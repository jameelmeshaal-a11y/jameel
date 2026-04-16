---
name: item_no Hard Override (Hardened)
description: item_no match uses strictJaccard only (no overlap), minTokens>=3 both sides, prevents single-word false positives
type: feature
---

## Rule
item_no ≥95% Jaccard (strict, no overlap coefficient) + unit match + minTokens >= 3 for both sides = Hard Override (confidence 99).

## Why strictJaccard
`textSimilarity()` uses overlap coefficient which returns 1.0 when a single token ("كمرات") exists in a longer description. This caused "حفر وخنادق للأساسات والكمرات" to match "كمرات" at 100%.

`strictJaccard()` uses intersection/union only, so "كمرات" vs "حفر وخنادق للأساسات والكمرات" = 1/4 = 25% → no override.

## minTokens >= 3
Both the item_no and the candidate text must have ≥3 tokens after Arabic normalization. Prevents short aliases from triggering overrides.

## INCOMPATIBLE_CATEGORY_GROUPS
Added earthwork ↔ concrete/slab_concrete bidirectional blocking.

## Files
- `src/lib/pricing/similarItemMatcher.ts` — `strictJaccard()` function
- `src/lib/pricing/matchingV3.ts` — Pre-scan + Loop use strictJaccard + minTokens check
