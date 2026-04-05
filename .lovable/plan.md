

# Implementation: Approved Rate Priority + Deviation Protection

## Overview
Three changes across two files to prevent critical pricing failures. No database migration needed.

---

## File 1: `src/lib/pricing/categoryDetector.ts`

### Position-aware category boost (lines 132–149)

Replace the bestMatch tracking to use an `effectiveCount` that adds +1 when a keyword appears in the first 30 characters of the Arabic description. This ensures "حفر وخنادق للأساسات والكمرات" detects as `excavation` (keyword "حفر" at position 0) instead of `beam_concrete`.

```typescript
let bestMatch: { rule: CategoryRule; matchedKeywords: string[]; effectiveCount: number } | null = null;

for (const rule of sorted) {
  const matched: string[] = [];
  for (const kw of rule.keywords) {
    if (combined.includes(kw.toLowerCase()) || arabicText.includes(kw)) {
      matched.push(kw);
    }
  }
  if (matched.length > 0) {
    const hasEarlyMatch = matched.some(kw => {
      const idx = description.indexOf(kw);
      return idx >= 0 && idx < 30;
    });
    const effectiveCount = hasEarlyMatch ? matched.length + 1 : matched.length;
    if (!bestMatch || effectiveCount > bestMatch.effectiveCount ||
        (effectiveCount === bestMatch.effectiveCount && rule.priority > bestMatch.rule.priority)) {
      bestMatch = { rule, matchedKeywords: matched, effectiveCount };
    }
  }
}
```

---

## File 2: `src/lib/pricingEngine.ts`

### Change A: Add approved-rate fallback to `findRateLibraryMatch` (lines 76–128)

Add `approvedRateIds: Set<string>` parameter. After the main scoring loop (line 125), if no match found, run a secondary pass targeting only approved library entries with a lower threshold of 20, mandatory unit match, tokenize-based overlap with Arabic prefix stripping, and confidence capped at 55.

```typescript
function findRateLibraryMatch(
  description: string,
  descriptionEn: string,
  unit: string,
  category: string,
  rateLibrary: RateLibraryItem[],
  linkedRateId?: string | null,
  approvedRateIds?: Set<string>,  // NEW
): { item: RateLibraryItem; confidence: number } | null {
  // ... existing Path A and Path B unchanged ...

  // NEW: Path C — Approved-rate fallback (after line 125)
  if (!bestMatch && approvedRateIds && approvedRateIds.size > 0) {
    const stripPrefix = (t: string) => t.replace(/^(ال|و|لل|بال)/, "");
    const normalizedUnit_ = normalizeUnit(unit);

    for (const candidate of rateLibrary) {
      if (!approvedRateIds.has(candidate.id)) continue;
      if (normalizeUnit(candidate.unit) !== normalizedUnit_) continue;

      const textScore = Math.max(
        textSimilarity(description, candidate.standard_name_ar || ""),
        textSimilarity(descriptionEn || "", candidate.standard_name_en || ""),
      ) * 60;

      const srcTokens = tokenize(description + " " + (descriptionEn || "")).map(stripPrefix);
      const candTokens = tokenize((candidate.standard_name_ar || "") + " " + (candidate.standard_name_en || "")).map(stripPrefix);
      const overlapCount = srcTokens.filter(t => candTokens.includes(t)).length;
      const kwScore = Math.min(25, overlapCount * 5);

      let score = Math.min(textScore + kwScore, 55);

      if (score >= 20 && score > bestScore) {
        bestScore = score;
        bestMatch = candidate;
      }
    }

    if (bestMatch) {
      return { item: bestMatch, confidence: Math.min(bestScore, 55) };
    }
  }

  return bestMatch ? { item: bestMatch, confidence: bestScore } : null;
}
```

### Change B: Build `approvedRateIds` in `runPricingEngine` (after line 213)

```typescript
const approvedRateIds = new Set<string>();
for (const [rateId, sources] of sourcesMap.entries()) {
  if (sources.some(s => s.source_type === 'Approved')) {
    approvedRateIds.add(rateId);
  }
}
```

Pass it to `findRateLibraryMatch` at line 269.

### Change C: Deviation protection with explicit flag (lines 317–355)

After AI pricing (line 337), add deviation check with an explicit `extremeDeviation` flag. The flag is defined at the same scope level as `itemStatus` (before the `if (matchedItem)` block) so it's accessible during status assignment.

```typescript
// Defined at block scope (same level as itemStatus, around line 280)
let extremeDeviation = false;

// ... inside the else branch (AI pricing), after line 337:
const normalizedUnit_ = normalizeUnit(block.primaryRow.unit);
const sameUnitRates = rateLibrary.filter(l => normalizeUnit(l.unit) === normalizedUnit_);
if (sameUnitRates.length > 0) {
  const closest = sameUnitRates.reduce((a, b) =>
    Math.abs(a.target_rate - cost.unitRate) < Math.abs(b.target_rate - cost.unitRate) ? a : b
  );
  const deviation = Math.abs(cost.unitRate - closest.target_rate) / closest.target_rate;
  if (deviation > 3.0) {
    extremeDeviation = true;
    cost.confidence = Math.min(cost.confidence, 40);
    cost.explanation += ` | ⚠️ انحراف ${Math.round(deviation * 100)}% عن "${closest.standard_name_ar}" (${closest.target_rate} SAR)`;
  }
}

// In status assignment (line 349), add explicit override:
} else if (extremeDeviation) {
  itemStatus = "needs_review";
  cost.explanation += " | 🚫 تسعير AI مرفوض — انحراف كبير عن مكتبة الأسعار";
} else if (detection.confidence < 60 || cost.confidence < 70) {
  // ... existing logic
```

---

## Expected Outcome

| Protection Layer | Trigger | Result |
|---|---|---|
| Position-aware category | "حفر" in first 30 chars | Correct `excavation` detection |
| Approved-rate fallback | No main match + approved entry exists | Library rate used, confidence ≤55, `needs_review` |
| Deviation protection | AI price >300% of library rate | Explicit `extremeDeviation` flag → forced `needs_review` |

