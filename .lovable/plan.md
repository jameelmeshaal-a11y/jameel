

# Smart Similarity Matching — Implementation

## Single file: `src/lib/pricingEngine.ts`

### Changes

1. **Line 13**: Add import of `textSimilarity`, `normalizeUnit`, `tokenize` from `./pricing/similarItemMatcher`

2. **Lines 75–114**: Replace `findRateLibraryMatch` with new dual-path version:
   - **Direct path**: `linkedRateId` found → return `{ item, confidence: 95 }` (trusted, no scoring)
   - **Similarity path**: mandatory `normalizeUnit` match, then score 0–100 from text similarity (×60), category (+15), keyword overlap via `tokenize` (+5/word, max 25). Threshold ≥40, cap 99. Empty descriptions default to `""` safely.

3. **Lines 255–260**: Pass `descriptionEn` and `unit` to updated function, destructure result into `matchedItem` and `matchConfidence`

4. **Lines 264–297**: Replace `libraryMatch` references with `matchedItem`, append match confidence to explanation

5. **Lines 322–329**: Confidence-based status:
   - Library match ≥70 → `approved`
   - Library match 40–69 → `needs_review`
   - No match → existing AI logic unchanged

6. **Line 356**: Source field: `library-high` / `library-medium` / `ai`

7. **Lines 343–360**: Add `linked_rate_id: matchedItem?.id ?? null` to DB write

No other files changed. No database migration.

