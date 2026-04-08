

# Fix: Inherit Parent Description into Child Items

## Root Cause (Two Bugs)

### Bug 1: Parent context resets after first child
In `parseBoQExcel()` (line 78), `parentDescriptions.length = 0` clears the parent buffer after the **first** child row consumes it. Subsequent sibling rows under the same parent get empty `parent_context`.

```text
Parent row: "توريد وتنفيذ خرسانة مسلحة..." (qty=0)
  Child 1: الأعمدة (qty>0) → gets parent ✅
  Child 2: الكمرات (qty>0) → parent already cleared ❌
  Child 3: بلاطات الأسقف (qty>0) → empty ❌
  Child 4: قواعد خرسانية (qty>0) → empty ❌
```

### Bug 2: CreateBoQDialog drops parent context
`CreateBoQDialog.tsx` (line 195) stores items using only `getRowClassificationNote(row)` — it never includes `[PARENT: row.parent_context]` in notes. So even when the parser produces parent context, this upload path loses it.

## Fix Strategy

### 1. `src/lib/boqParser.ts` — Keep parent context for all siblings

Change the post-processing loop: do NOT clear `parentDescriptions` after each child. Instead, only clear when a **new parent section** begins (i.e., when a new zero-qty descriptive row appears after a priced row).

```text
Before: parent resets after first child
After:  parent persists for all consecutive children until next parent
```

Additionally, store the combined description directly in the `description` field for payable rows, while preserving the original short description in `parent_context` metadata. This ensures the pricing engine always sees the full description regardless of which upload path is used.

**Revised logic:**
```typescript
let activeParent = "";
let parentBuffer: string[] = [];

for (const row of rawRows) {
  if (row.quantity <= 0) {
    // Descriptive row — accumulate as potential parent
    if (row.description.trim()) {
      parentBuffer.push(row.description.trim());
    }
  } else {
    // Payable row — finalize active parent from buffer (if any)
    if (parentBuffer.length > 0) {
      activeParent = parentBuffer.join(" | ");
      parentBuffer = [];
    }
    // Attach active parent to this child
    row.parent_context = activeParent;
  }
}
```

This way all children under the same parent section inherit the same parent description.

### 2. `src/lib/boqParser.ts` — Store combined description for payable rows

After the parent-context pass, for every row with `quantity > 0` and non-empty `parent_context`:
- Set `row.description = parent_context + " — " + original_description`
- This ensures the DB `description` column contains the full inherited text

This eliminates reliance on the `[PARENT: ...]` notes extraction — the full description is always in the primary field.

### 3. `src/components/CreateBoQDialog.tsx` — Include parent context in notes

Update item mapping (line 186-196) to match the pattern used in `uploadAndParseBoQ`:

```typescript
const parentNote = row.parent_context ? `[PARENT: ${row.parent_context}]` : "";
const classNote = getRowClassificationNote(row);
const combinedNote = [parentNote, classNote].filter(Boolean).join(" ");
```

This ensures both upload paths store parent context consistently.

### 4. Data Reset — Clear BoQ data for re-upload

```sql
DELETE FROM boq_items;
DELETE FROM boq_files;
DELETE FROM price_change_log;
DELETE FROM pricing_audit_log;
UPDATE projects SET boq_count = 0, total_value = 0;
```

## Expected Result After Fix

For the example parent:
> توريد وتنفيذ خرسانة مسلحة مصبوبة فى الموقع فوق سطح الأرض باستخدام اسمنت بورتلاندى عادي...

All four children will be stored as:

| item_no | stored description |
|---|---|
| 033000-11 | parent — الأعمدة من بلاطة أرضية الدور الأرضى إلى أعلى |
| 033000-12 | parent — الكمرات |
| 033000-13 | parent — بلاطات الأسقف فى جميع الأدوار |
| 033000-14 | parent — قواعد خرسانية للماكينات |

The pricing engine's `findRateLibraryMatch()` receives the full combined description — no separate extraction needed.

## Files Changed

| File | Change |
|---|---|
| `src/lib/boqParser.ts` | Fix parent context persistence for all siblings; store combined description in payable rows |
| `src/components/CreateBoQDialog.tsx` | Include `[PARENT: ...]` in notes for consistency |
| Data operation | Clear BoQ data for re-upload |

## What Is NOT Changed

- Rate library data — preserved
- Pricing engine logic — already uses `mergedDescription` which now gets the full text
- Schema/tables — no changes
- `boqRowGrouping.ts` — still extracts parent from notes as a fallback, but primary fix is in the description field itself

