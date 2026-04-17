---
name: Matching V4 Engine Core
description: Strict 4-stage sequential matching pipeline with file-scoped item_no override and ≥75 minimum threshold (no loose fallback)
type: feature
---

The Matching V4 engine enforces a STRICT 4-stage sequential pipeline. Each stage is a gate — if it matches, the pipeline stops. If no stage produces a match ≥75, the item stays pending (NO loose fallback).

### Pipeline (strict order)

1. **Stage 1 — item_no Hard Override (≥95% similarity → confidence 99)**
   - SCOPED to same `boq_file_id` only — controlled by `sameFileLibraryIds: Set<string>` passed to `findRateLibraryMatchV3`.
   - This set contains `rate_library` IDs that already have a linked BoQ item in the same file.
   - Prevents cross-file leakage (item_no codes commonly repeat across different files).
   - For new files this set is empty → Stage 1 simply doesn't fire, pipeline falls through to Stage 2.

2. **Stage 2 — Category + Unit Gate**
   - `categories_compatible(boq.category, lib.category) = true` AND `normalizeUnit(boq.unit) = normalizeUnit(lib.unit)`.
   - Hard filter: candidates failing this gate are skipped entirely (no scoring).

3. **Stage 3 — Description match (effective threshold ≥85)**
   - On the gated pool only.
   - Normalized Arabic text + synonyms + Jaccard on tokens + char n-gram similarity + concept conflict checks (gates incompatible concepts to score 0).
   - Score ≥85 → match wins, confidence = round(score).

4. **Stage 4 — Bundled strict (composite ≥75)**
   - Composite of text similarity, category match bonus, keyword overlap, code matching, dimension matching, synonym boost, containment, library keywords, parent context, correction notes.
   - Score 75-99 → match. <75 → null (pending).

### Pre-matching cleanup (one-time migration)

- BoQ items not manually overridden: `linked_rate_id = NULL`; previously `approved` items become `stale_price` (KEEP unit_rate/total_price for review); other statuses become `pending`.
- `rate_library` entries not locked AND not approved AND not still referenced are deleted.
- `rate_sources` for those deleted library entries are deleted first.

### Governance protections

- `override_type='manual'` items are never touched (DB trigger `guard_manual_override` + explicit code exclusion).
- `is_locked=true` library entries are preserved (never deleted, never overwritten).
- `source_type='Approved'` library entries are preserved.
- `save_manual_price` RPC, propagation logic, Etemad-Ready export, and the pricing engine itself are unchanged.

### Removed (V3 → V4)

- ❌ Path C "Approved-rate fallback at threshold 50, capped 55" — removed entirely.
- ❌ `>= 50` minimum threshold — replaced with `>= 75` strict.
- ❌ "suggestion" match_level in Edge Function — only `auto` (≥75) or no match.

### Files

- `src/lib/pricing/matchingV3.ts` — strict pipeline implementation
- `src/lib/pricingEngine.ts` — `buildSameFileLibraryIds(boqFileId)` helper + 3 call sites
- `supabase/functions/match-price-item/index.ts` — server-side mirror of strict pipeline (accepts `boq_file_id`, `item_no`, `category`)
- `src/lib/pricing/priceMatchService.ts` — forwards `boq_file_id` + `item_no` + `category` to the edge function
