

## الحل النهائي الكامل — حذف شامل واعتماد المكتبة الحالية مرجعاً وحيداً

### ما سأنفذه (3 خطوات متسلسلة)

#### الخطوة 1 — حذف شامل لكل البيانات القديمة
- حذف **كل** سجلات `rate_sources` نهائياً (841 سجل)
- فك ربط **كل** بنود BoQ بدون استثناء (حتى اليدوية): `linked_rate_id = NULL`
- تصفير **كل** بيانات التسعير في `boq_items` بدون استثناء:
  - `unit_rate, total_price, materials, labor, equipment, logistics, risk, profit, confidence, source, override_type, override_at, override_by, override_reason, manual_overrides, notes` ← الكل NULL/فارغ
  - `status = 'pending'`
- ملاحظة: trigger `guard_manual_override` يسمح بهذا (لأنه يستثني الحالة `status='pending' AND override_type=NULL`)

#### الخطوة 2 — إزالة حصانة `approved_library` من محرك التسعير
- في `src/lib/pricingEngine.ts` (سطور 1013، 1129، وأي موضع آخر): إزالة شرط `|| row.source === 'approved_library'`
- بعد الخطوة 1 لن يبقى أي بند بمصدر قديم، لكن نضمن المستقبل

#### الخطوة 3 — إعادة تسعير المشروع
- تشغيل re-price سيطبّق Pipeline V4 على **كل** البنود
- كل بند سيأخذ سعره من `rate_library.target_rate` الحالي مباشرة
- مثال: حفر الأساسات سيُسعَّر 42 (المكتبة الحالية) بدل 54

### الإثبات الذي سأقدّمه
1. **قبل**: لقطة من DB تُظهر:
   - `count(rate_sources)` = 841
   - `count(boq_items where linked_rate_id IS NOT NULL)` = X
   - `count(boq_items where override_type='manual')` = Y
2. **بعد**: لقطة من DB تُظهر:
   - `count(rate_sources)` = 0
   - `count(boq_items where linked_rate_id IS NOT NULL)` = 0
   - `count(boq_items where override_type='manual')` = 0
   - كل البنود `status='pending'`, `unit_rate IS NULL`
3. **بعد re-price**: لقطة لبند الحفر تُظهر `unit_rate = 42` مطابقاً لـ `target_rate` في المكتبة

### الملفات المتأثرة

| الملف | التغيير |
|---|---|
| migration جديدة | حذف rate_sources بالكامل + reset كل boq_items (بدون استثناء يدوي) |
| `src/lib/pricingEngine.ts` | إزالة حصانة `source === 'approved_library'` من 3 مواضع |

### ما سيبقى محفوظاً
- ✅ سجلات `rate_library` الحالية (المكتبة نفسها) — **هي المرجع الوحيد**
- ✅ `pricing_audit_log` و `price_change_log` (أرشيف تاريخي)
- ✅ schema, RPCs, RLS, triggers — صفر تغيير
- ✅ Pipeline V4 المطابقة كما هي

### تحذير صريح
بعد التنفيذ ستفقد:
- ❌ كل الأسعار اليدوية القديمة (سيُعاد تسعيرها من المكتبة)
- ❌ كل تاريخ rate_sources (841 سجل)
- ❌ كل روابط boq_items القديمة

⚠️ هذه عملية لا رجعة فيها. التسعير سيعتمد 100% على `rate_library.target_rate` الحالي.

