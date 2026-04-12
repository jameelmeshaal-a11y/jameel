

# إصلاح الطبقة 3: تفعيل كشف البنود القديمة عند تحديث المكتبة

## المشكلة المكتشفة أثناء الاختبار

عند تغيير سعر بند في مكتبة الأسعار (من 1375 إلى 1380)، لم يتم تحديث حالة البنود المرتبطة في `boq_items` إلى `stale_price`. السبب المحتمل:

1. **RLS يمنع التحديث**: سياسة UPDATE على `boq_items` تتطلب أن يكون المستخدم مالك ملف الـ BoQ أو admin. الدالة تعمل من الـ client-side مع صلاحيات المستخدم العادية، وقد لا يتم التعرف على صلاحية الـ admin بشكل صحيح في هذا السياق.

2. **الحل**: نقل منطق تحديث البنود القديمة إلى **database trigger** على جدول `rate_library` بدلاً من الاعتماد على كود الـ client. هذا يضمن التنفيذ بصلاحيات SECURITY DEFINER ويتجاوز RLS.

## التغييرات المطلوبة

### 1. Database Migration — Trigger على rate_library
إنشاء trigger يعمل عند تحديث `base_rate` أو `target_rate` في `rate_library`:

```sql
CREATE OR REPLACE FUNCTION public.flag_stale_boq_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.target_rate IS DISTINCT FROM NEW.target_rate THEN
    UPDATE boq_items
    SET status = 'stale_price'
    WHERE linked_rate_id = NEW.id
      AND unit_rate IS DISTINCT FROM NEW.target_rate
      AND status != 'stale_price';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_flag_stale_items
AFTER UPDATE ON rate_library
FOR EACH ROW
EXECUTE FUNCTION flag_stale_boq_items();
```

### 2. تنظيف كود الـ Client (`src/hooks/usePriceLibrary.ts`)
إزالة كود Layer 3 من `useUpdatePriceItem` (الأسطر 69-73) لأن الـ trigger سيتولى المهمة تلقائياً. الإبقاء فقط على تسجيل التغيير في `price_change_log`.

### 3. إصلاح شريط التحذير (`src/components/BoQTable.tsx`)
التأكد من أن الـ query الذي يبحث عن بنود `stale_price` يعمل بشكل صحيح ويعرض الشريط الأصفر.

### 4. إعادة السعر الأصلي للاختبار
إعادة سعر البند الذي تم تغييره أثناء الاختبار من 1380 إلى 1375 (أو تركه على 1380 إذا كان هذا هو السعر المطلوب).

## الملفات المتأثرة

| الملف / المكون | التغيير |
|---|---|
| Database Migration | إضافة trigger `flag_stale_boq_items` |
| `src/hooks/usePriceLibrary.ts` | إزالة كود التحديث المباشر (استبداله بالـ trigger) |
| `src/components/BoQTable.tsx` | مراجعة query البنود القديمة |

## ما لا يتأثر
- محرك التسعير — بدون تغيير
- Layer 1 (Post-Write Assertion) — يعمل بشكل صحيح
- Layer 2 (Auto Integrity Check) — يعمل بشكل صحيح
- مكتبة الأسعار — الواجهة تبقى كما هي

