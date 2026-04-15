

# إضافة نافذة تأكيد الاعتماد مع ملاحظات

## الملخص

عند الضغط على "حفظ" في نافذة تعديل السعر (`PriceBreakdownModal`), ستظهر نافذة تأكيد وسيطة تحتوي على:
- حقل نصي لكتابة ملاحظات أو شروط قبل الاعتماد
- زر "تأكيد الاعتماد" وزر "إلغاء"
- الملاحظات تُحفظ في `pricing_audit_log` مع سجل الاعتماد

## التغييرات

### 1. `src/components/PriceBreakdownModal.tsx`

**أ.** إضافة state جديد:
```typescript
const [showConfirmDialog, setShowConfirmDialog] = useState(false);
const [approvalNotes, setApprovalNotes] = useState("");
```

**ب.** تغيير زر "حفظ" (سطر 626) ليفتح نافذة التأكيد بدلاً من استدعاء `handleSave` مباشرة:
```typescript
onClick={() => setShowConfirmDialog(true)}
```

**ج.** إضافة `AlertDialog` يظهر عند `showConfirmDialog = true`:
- عنوان: "تأكيد اعتماد السعر"
- وصف: البند + السعر الجديد
- حقل `Textarea` لملاحظات الاعتماد
- زر "تأكيد الاعتماد" → يستدعي `handleSave` مع حفظ `approvalNotes`
- زر "إلغاء" → يغلق النافذة

**د.** تعديل `handleSave` لحفظ `approvalNotes` في `pricing_audit_log`:
```typescript
// بعد نجاح save_manual_price، إدراج سجل في pricing_audit_log
await supabase.from("pricing_audit_log").insert({
  item_id: item.id,
  project_id: boqFileProjectId,
  action_type: "manual_approve",
  edit_type: "manual_override",
  change_scope: "item_and_linked",
  reason: approvalNotes || null,
  changed_by: user?.id,
  old_values: { unit_rate: item.unit_rate },
  new_values: { unit_rate: unitRate },
  changed_fields: { ...overridesObj },
  affected_items_count: 1 + (result?.linked_items_count || 0),
});
```

### 2. لا تغيير في قاعدة البيانات

جدول `pricing_audit_log` موجود بالفعل ويحتوي على عمود `reason` — مناسب تماماً لحفظ ملاحظات الاعتماد.

## ملف واحد فقط: `src/components/PriceBreakdownModal.tsx`

