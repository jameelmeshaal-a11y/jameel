

# إصلاح خطأ "فشل التحديث في مكتبة الأسعار"

## السبب الجذري

عند تعديل سعر بند وحفظه، تعمل دالة `syncToRateLibrary` على تحديث `rate_library` → يشتغل الـ Trigger `trg_flag_stale_items` → يحاول تعيين `status = 'stale_price'` على بنود `boq_items` المرتبطة → **يفشل** لأن قيد الفحص (check constraint) على عمود `status` لا يحتوي `'stale_price'` ضمن القيم المسموحة.

القيم المسموحة حالياً:
```text
pending, approved, review, conflict, descriptive, invalid,
needs_review, manual_override, project_override, priced
```

القيم المفقودة: **`stale_price`** و **`unmatched`**

هذا يعني أن كل عملية تعديل سعر تفشل عند المزامنة مع المكتبة بسبب الـ Trigger.

## الحل

### 1. Database Migration — إضافة القيم المفقودة للقيد
```sql
ALTER TABLE public.boq_items DROP CONSTRAINT boq_items_status_check;
ALTER TABLE public.boq_items ADD CONSTRAINT boq_items_status_check
  CHECK (status = ANY (ARRAY[
    'pending', 'approved', 'review', 'conflict', 'descriptive',
    'invalid', 'needs_review', 'manual_override', 'project_override',
    'priced', 'unmatched', 'stale_price'
  ]));
```

### 2. لا تغييرات على الكود
الكود يعمل بشكل صحيح — المشكلة فقط في قاعدة البيانات.

## الملفات المتأثرة

| المكون | التغيير |
|---|---|
| Database Migration | إضافة `stale_price` و `unmatched` لقيد `boq_items_status_check` |

## ما لا يتأثر
- محرك التسعير — بدون تغيير
- مكتبة الأسعار — بدون تغيير
- Trigger `trg_flag_stale_items` — سيعمل بشكل صحيح بعد إضافة القيمة

