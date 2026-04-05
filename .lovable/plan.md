

# Enforce Price Library as Deterministic Single Source of Truth

## Problem (Two Layers)

**Layer 1 — Approved rates are inflated:** `priceFromLibrary()` applies complexity (x1.08), quantity (x1.06), and location multipliers on top of already-approved rates. A 31 SAR approved rate becomes ~35+ SAR.

**Layer 2 — Matching is probabilistic:** Jaccard similarity with threshold 40 misses items with slight Arabic wording differences, causing fallback to AI which produces wildly different rates (852 vs 31 SAR). No deterministic historical mapping exists.

## Changes

### File 1: `src/lib/pricing/similarItemMatcher.ts`

**Add `normalizeArabicText()` export** — aggressive Arabic normalization:
- Strip tashkeel (diacritics: ًٌٍَُِّْ)
- Normalize alef variants (أ إ آ → ا), taa marbuta (ة → ه), alef maqsura (ى → ي)
- Strip common prefixes (ال، و، لل، بال)
- Sort tokens alphabetically for order-independent matching

**Update `tokenize()`** — apply Arabic normalization, lower min token length from 3 to 2.

**Add `charNgramSimilarity()` export** — character-level trigram Jaccard similarity (~15 lines). Catches reformulated Arabic text with different word boundaries.

### File 2: `src/lib/pricingEngine.ts`

**Add `priceFromApprovedRate()` function** (after line 204, ~25 lines):
- Uses approved rate directly — NO complexity, quantity, or overhead multipliers
- Only applies location factor if project city differs from library `base_city`
- Splits rate into breakdown components using library percentage splits

**Add `buildHistoricalMap()` function** (~20 lines):
- Fetches all `boq_items` where `linked_rate_id IS NOT NULL` and `source IN ('library-high', 'manual', 'project_override', 'master_update')`
- Deduplicates by `linked_rate_id`, keeps first occurrence
- Returns array of `{ normalizedDesc, tokens, linkedRateId, unit }`

**Add `findHistoricalMatch()` function** (~25 lines):
- Checks new item description against historical mappings
- First pass: exact normalized text match → confidence 93
- Second pass: Jaccard ≥ 0.85 → confidence 90
- Unit must match. Returns the linked library item if found.

**Update `runPricingEngine()`** (line 237):
- Add `buildHistoricalMap()` to the parallel fetch
- After `findRateLibraryMatch` returns null (line 323), call `findHistoricalMatch` as Path A.5 before AI fallback

**Update pricing branch** (lines 329-363):
- If `sourceResolution.method === "approved"` → call `priceFromApprovedRate()` instead of `priceFromLibrary()`
- Show clear source label: `"✅ Approved Rate: X SAR (used directly)"`

**Lower thresholds:**
- Path B: 40 → 30
- Path C: 20 → 15

**AI deviation cap** (lines 386-401):
- When AI rate deviates >300% from closest library entry, cap rate to 150% of library reference

### File 3: `src/lib/pricing/sourceResolver.ts`

**Add `baseCity: string` to `SourceResolution` interface.** Populate from the sources' city field (use approved source's city if available).

### File 4: `src/lib/boqRowClassification.test.ts` (or new test file)

Add tests covering:
- Historical mapping reuse: item with same normalized description resolves to same `linked_rate_id`
- Approved rate bypass: `priceFromApprovedRate` returns rate directly without multipliers
- Arabic normalization: slight wording differences still produce identical normalized text

## Resolution Flow (After Changes)

```text
Path A:   linked_rate_id on THIS item           → deterministic
Path A.5: historical mapping (past approvals)    → deterministic (NEW)
Path B:   similarity scoring ≥30                 → probabilistic (improved)
Path C:   approved-rate fallback ≥15             → probabilistic (improved)
AI:       only if ALL paths fail                 → capped against library
```

## What Stays the Same

- `syncToRateLibrary` — already persists approved prices and sets `linked_rate_id`
- `priceFromLibrary` for non-approved rates — keeps complexity/qty factors (correct for estimates)
- Classification system (warning-only policy)
- Export logic
- No database schema changes needed

## Validation Guarantee

| Scenario | Before | After |
|---|---|---|
| Approved library rate 31 SAR | 35+ SAR (inflated) | **31 SAR** (direct) |
| Same item, different wording | Falls to AI → 852 SAR | **Matches via historical map → 31 SAR** |
| Same item across projects | Different rates | **Same rate guaranteed** |
| AI deviates >300% | Low confidence only | **Capped to 150% of library ref** |

