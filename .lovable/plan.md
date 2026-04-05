

# Optimized Project Total Auto-Sync — Implementation Plan

## Strategy
Explicit `recalculate_project_total` RPC at operation boundaries only. No per-row trigger. No database migration.

## Changes

### 1. `src/components/PriceBreakdownModal.tsx`

In `handleSave`, add RPC call at two points:

**Partial failure path** (after line 150, before `return` on line 151):
```typescript
await supabase.rpc("recalculate_project_total", { p_project_id: projectId }).catch(() => {});
```

**Full success path** (after line 154, before toast.success on line 155):
```typescript
await supabase.rpc("recalculate_project_total", { p_project_id: projectId });
```

### 2. `src/components/BoQTable.tsx`

**a. Update React import (line 1):** Add `useRef, useEffect`

**b. Add guarded auto-fix (after line 36):**
```typescript
const autoFixAttempted = useRef(false);
const [autoFixFailed, setAutoFixFailed] = useState(false);

useEffect(() => {
  if (!consistency || consistency.consistent) {
    autoFixAttempted.current = false;
    setAutoFixFailed(false);
    return;
  }
  if (autoFixAttempted.current) return;
  autoFixAttempted.current = true;
  fixConsistency(projectId, boqFileId)
    .then(() => {
      qc.invalidateQueries({ queryKey: ["projects", projectId] });
      qc.invalidateQueries({ queryKey: ["project-consistency", projectId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    })
    .catch(() => setAutoFixFailed(true));
}, [consistency?.consistent, projectId, boqFileId, qc]);
```

**c. Remove export blocking on inconsistency (lines 67-70):** Delete the `if (!consistency.consistent)` block

**d. Update canExport (line 125):** Change to `const canExport = exportSummary.canExport;`

**e. Downgrade banner (line 190):** Change `!consistency.consistent` to `autoFixFailed`

### Files unchanged
- `src/lib/boqParser.ts` — import doesn't write `total_price`
- `src/lib/pricingEngine.ts` — already has RPC at end
- No database migration needed

### Recalculation coverage

| Operation | Recalc | Location |
|---|---|---|
| Bulk pricing engine | Once at end | `pricingEngine.ts` (existing) |
| Manual save — full success | Once at end | `PriceBreakdownModal` (new) |
| Manual save — partial failure | Once at end | `PriceBreakdownModal` (new) |
| Fallback | Once per inconsistency | `BoQTable` auto-fix (new) |

