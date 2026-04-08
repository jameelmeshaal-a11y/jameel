

# Fix: Matching Engine Improvements for Unpriced BoQ Items

## Problem Analysis

The current `findRateLibraryMatch()` in `pricingEngine.ts` uses **Jaccard similarity** (`intersection / union`) which severely penalizes cases where:
- BoQ description is **shorter** than library item (e.g., 3 tokens vs 10 tokens → max Jaccard = 0.3 even with perfect overlap)
- BoQ uses a **model/reference code** (TSD-2, HOK-2) that isn't matched as a strong key
- BoQ text is a **subset** of the library description (e.g., "قواعد خرسانية للماكينات" is contained in the full library entry)

The `textSimilarity()` function returns `intersection / union` — this is the root cause of missed matches.

## Changes

### 1. `src/lib/pricing/similarItemMatcher.ts` — Add overlap coefficient + code extractor

**Add `overlapCoefficient()`**: Returns `intersection / min(|A|, |B|)` — scores 1.0 when all tokens of the shorter text exist in the longer text. This directly fixes the "short BoQ vs long library" problem.

**Add `extractModelCodes()`**: Regex to extract alphanumeric reference codes (e.g., `TSD-2`, `HOK-2`, `REF-1`, `CA-1`, `WT01`, `نموذج -1`) from text. Returns array of normalized codes.

**Update `textSimilarity()`**: Return the **max** of Jaccard and overlap coefficient, so short-but-correct descriptions still score high.

### 2. `src/lib/pricingEngine.ts` — Enhance `findRateLibraryMatch()` with 3 new matching paths

Add to the scoring loop (before final score calculation):

**a) Model/code match (+40 pts)**:
Extract codes from BoQ description. If any code matches a code in the library item's `item_code`, `item_name_aliases`, `standard_name_ar`, or `item_description`, add 40 points. This ensures items like "TSD-2" or "نموذج -1" get strong matches.

**b) Containment bonus (+20 pts)**:
If `overlapCoefficient >= 0.8` (meaning ≥80% of the shorter text's tokens exist in the longer text), add 20 bonus points. This handles "قواعد خرسانية للماكينات" matching a longer library entry.

**c) Library keywords field matching (+15 pts)**:
Currently `candidate.keywords` from `rate_library` is never checked. Add: extract BoQ tokens, check overlap with `candidate.keywords` array, award up to 15 points.

**Scoring summary after changes**:
- Text similarity (Jaccard OR overlap coeff) × 60 = max 60 pts
- Character n-gram × 30 = max 30 pts (existing)
- Category match = +15 pts (existing)
- Token overlap × 5 = max 25 pts (existing)
- Model/code match = +40 pts (new)
- Containment bonus = +20 pts (new)
- Keywords match = +15 pts (new)
- Cap at 99

### 3. `src/lib/pricing/similarItemMatcher.ts` — Update `textSimilarity()`

Change return from pure Jaccard to `Math.max(jaccard, overlapCoefficient)`.

### 4. Data Reset — Delete BoQ data for re-upload

```sql
DELETE FROM boq_items;
DELETE FROM boq_files;
DELETE FROM price_change_log;
DELETE FROM pricing_audit_log;
UPDATE projects SET boq_count = 0, total_value = 0;
```

## Technical Detail: Model Code Regex

```typescript
function extractModelCodes(text: string): string[] {
  // Matches patterns like TSD-2, HOK-2, REF-1, CA-1, WT01, نموذج -1, نموذج-21
  const codes: string[] = [];
  // Latin codes: 2+ letters followed by optional separator and digits
  const latinPattern = /\b([A-Za-z]{2,}\s*-?\s*\d+)\b/g;
  // Arabic model pattern: نموذج followed by separator and number
  const modelPattern = /نموذج\s*[-.‐]\s*(\d+)/g;
  // ... extract, normalize (strip spaces, lowercase), return unique codes
  return codes;
}
```

## Files Changed

| File | Change |
|---|---|
| `src/lib/pricing/similarItemMatcher.ts` | Add `overlapCoefficient()`, `extractModelCodes()`, update `textSimilarity()` |
| `src/lib/pricingEngine.ts` | Add model-code, containment, and keywords scoring paths in `findRateLibraryMatch()` |
| Data operation | Clear BoQ data for re-upload |

## What Is NOT Changed

- Rate library data — preserved
- Schema/tables — no changes
- `priceFromApprovedRate()` — already fixed
- Auth, RLS, edge functions — untouched

