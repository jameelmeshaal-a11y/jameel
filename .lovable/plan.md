

# تنفيذ: الاعتماد التلقائي + تحسين الملاحظات للبنود الجديدة والقديمة

## التغييرات المطلوبة

### 1. `src/lib/pricing/rateSyncService.ts` — 3 تحسينات

**أ) إضافة `userId` للـ SyncParams + تعيين `approved_at/approved_by`:**
- إضافة حقل `userId?: string` في `SyncParams`
- عند **تحديث** بند موجود (سطر 122-132): إضافة `approved_at`, `approved_by`, وتغيير `source_type` من `"Revised"` إلى `"Approved"`
- عند **إنشاء** بند جديد (سطر 166-186): إضافة `approved_at`, `approved_by`, وتغيير `source_type` من `"Field-Approved"` إلى `"Approved"`

**ب) حفظ الملاحظات للبنود الجديدة:**
- حالياً `buildCorrectionEnrichment` تعمل فقط مع البنود الموجودة (تحتاج `libraryId`)
- عند إنشاء بند جديد، يتم تجاهل `correctionNote` تماماً
- الإصلاح: إضافة حقل `notes` مباشرة في `insert` البند الجديد عند وجود `correctionNote`

### 2. `src/components/PriceBreakdownModal.tsx` — تمرير userId

- استيراد `useAuth` واستخراج `user.id`
- تمريره كـ `userId` في استدعاء `syncToRateLibrary` (سطر 287-293)

### 3. `src/lib/pricing/propagationService.ts` — تمرير userId

- تمرير `userId` في استدعاء `syncToRateLibrary` من Propagation (سطر 80-85)

### 4. Database Migration — تحديث Trigger لحماية البنود اليدوية

```sql
CREATE OR REPLACE FUNCTION public.flag_stale_boq_items()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.target_rate IS DISTINCT FROM NEW.target_rate THEN
    UPDATE boq_items
    SET status = 'stale_price'
    WHERE linked_rate_id = NEW.id
      AND unit_rate IS DISTINCT FROM NEW.target_rate
      AND status != 'stale_price'
      AND (override_type IS NULL OR override_type != 'manual');
  END IF;
  RETURN NEW;
END;
$$;
```

### 5. إصلاح البنود الحالية (one-time data fix)

تحديث بنود المكتبة الحالية التي مصدرها `Revised` أو `Field-Approved` بدون `approved_at`:
```sql
UPDATE rate_library
SET approved_at = last_reviewed_at, source_type = 'Approved'
WHERE source_type IN ('Revised', 'Field-Approved')
  AND approved_at IS NULL;
```

## الملفات المتأثرة

| الملف | التغيير |
|---|---|
| `src/lib/pricing/rateSyncService.ts` | `userId` + `approved_at/by` + ملاحظات البنود الجديدة |
| `src/components/PriceBreakdownModal.tsx` | تمرير `userId` |
| `src/lib/pricing/propagationService.ts` | تمرير `userId` |
| Database Migration | تحديث Trigger + إصلاح بيانات حالية |

