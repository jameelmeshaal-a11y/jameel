

# Single Save Flow — Implementation Plan

## Overview
Replace all save/approve/propagate buttons with one **"حفظ" (Save)** button. Sequential DB writes with explicit partial-failure handling. Modal stays open on sync failure for immediate retry.

## File 1: `src/lib/pricing/rateSyncService.ts`

**4 targeted fixes:**

| Line | Current | New |
|------|---------|-----|
| 151 | `base_city: realCity \|\| "Riyadh"` | `base_city: realCity \|\| ""` |
| 172 | `city: realCity \|\| "Riyadh"` | `city: realCity \|\| ""` |
| 167-175 | Fire-and-forget `rate_sources` insert | Capture error, return `null` on failure |
| 178-181 | Fire-and-forget `linked_rate_id` update | Capture error, return `null` on failure |

## File 2: `src/components/PriceBreakdownModal.tsx`

### Remove
- Line 2: `Globe` from imports
- Line 11: `propagateChanges`, `ChangeScope`, `EditType` imports
- Line 12: `SimilarItem` import
- Line 15: `PropagationScopeModal` import
- Line 56: `showPropagation` state
- Lines 92-95: `handleResetAuto` function
- Lines 113-161: `handleQuickSave` — replaced by new `handleSave`
- Lines 163-166: `handleSaveWithScope`
- Lines 168-219: `handlePropagationConfirm`
- Lines 221-238: `handleApprove`
- Lines 419-426: Propagate + Reset buttons
- Lines 429-436: Approve + Edit buttons block
- Lines 443-454: `PropagationScopeModal` render

### New `handleSave` (replaces all save functions)
```typescript
const handleSave = async () => {
  if (!hasChanges) return;
  setSaving(true);
  try {
    const unitRate = getUnitRate(values);
    const totalPrice = +(unitRate * item.quantity).toFixed(2);
    const overridesObj: Record<string, boolean> = {};
    manualFields.forEach(f => { overridesObj[f] = true; });

    // Step 1: Save to boq_items with status "approved"
    const { error } = await supabase.from("boq_items").update({
      materials: values.materials, labor: values.labor,
      equipment: values.equipment, logistics: values.logistics,
      risk: values.risk, profit: values.profit,
      unit_rate: unitRate, total_price: totalPrice,
      status: "approved",
      notes: item.notes || "Manual pricing adjustment",
      manual_overrides: overridesObj,
      override_at: new Date().toISOString(),
    }).eq("id", item.id);

    if (error) {
      toast.error("فشل حفظ التعديل: " + error.message);
      return;
    }

    // Step 2: Sync to rate library — AWAITED
    const syncResult = await syncToRateLibrary({
      itemId: item.id, boqFileId: item.boq_file_id, values, unitRate,
    });

    if (!syncResult) {
      toast.error("تم حفظ السعر لكن فشل التحديث في مكتبة الأسعار. يرجى المحاولة مرة أخرى.");
      return; // modal stays open, values preserved, retry possible
    }

    toast.success(`تم الحفظ والاعتماد — سعر الوحدة: ${formatNumber(unitRate)} ريال`);
    setEditing(false);
    onUpdated?.();
    onClose();
  } catch (err: any) {
    toast.error("خطأ: " + err.message);
  } finally {
    setSaving(false);
  }
};
```

### New action buttons (lines 408-437)

**Editing mode** — two buttons only:
```tsx
<div className="flex gap-2">
  <Button className="flex-1 gap-2" onClick={handleSave} disabled={saving || !hasChanges}>
    <CheckCircle className="w-4 h-4" /> {saving ? "جاري الحفظ..." : "حفظ"}
  </Button>
  <Button variant="outline" onClick={() => { setValues(initial); setManualFields(new Set()); setEditing(false); }}>
    إلغاء
  </Button>
</div>
```

**Non-editing mode** — Edit button only:
```tsx
<Button variant="outline" className="flex-1 gap-2" onClick={() => setEditing(true)}>
  <Pencil className="w-4 h-4" /> Edit Price
</Button>
```

### Wrapper cleanup
Remove outer `<>...</>` fragment (lines 244, 455). Return just the modal `div` since `PropagationScopeModal` is gone.

### Retry behavior
On partial failure: `finally` runs `setSaving(false)` → button re-enables. `values` stay in state. `hasChanges` stays `true` (because `initial` is never updated on partial failure). User clicks Save again → idempotent boq_items update + sync retry.

## Technical Notes
- This is a **single save flow with explicit partial-failure handling**, not an atomic DB transaction
- Notes field is read-only in the modal — using `item.notes` is correct
- `RotateCcw` icon stays (used in auto-rebalance toggle at line 306)
- `propagationService.ts` code remains untouched (callable from other contexts)

