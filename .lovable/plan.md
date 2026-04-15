

# خطة التنفيذ — المحاور 1→3 (+ تحضير المحاور 4→6)

## الحالة الفعلية بعد المراجعة

### ما يحتاج إصلاح فعلاً:

**المحور 1 — SQL Trigger**: `guard_manual_override` يحتاج إضافة استثناء `status='pending'` في البداية. الكود الحالي (أسطر 3-18) لا يحتوي على هذا الاستثناء.

**المحور 2 — `item_no` في Frontend Hooks**: 
- `priceMatchService.ts` سطر 19: `body: { item_name: description, unit }` ← ينقصه `item_no`
- `usePriceLibrary.ts` سطر 220: `body: { item_name: itemName, unit }` ← ينقصه `item_no`
- Edge Function (سطر 154) **يستقبل** `item_no` بالفعل ✅

**المحور 3 — إزالة `!== description`**:
- `matchingV3.ts` سطر 248: `cleanItemNoForOverride !== description` ← يجب إزالته
- `matchingV3.ts` سطر 323: `cleanItemNo !== description` ← يجب إزالته
- Edge Function **لا يحتوي** على هذا الشرط ✅ (سطر 188 يفحص فقط `cleanItemNo.length >= 4`)

**المحور 4 — `INCOMPATIBLE_GROUPS` في pricingEngine**: 
- ملاحظتك صحيحة 100%: `INCOMPATIBLE_GROUPS` معرّفة كمتغير محلي داخل `findRateLibraryMatchV3()` (سطر 232)، غير مُصدَّرة
- `detectCategory` مُصدَّرة من `categoryDetector.ts` ✅
- الحل: استخراج `INCOMPATIBLE_GROUPS` و `areCategoriesCompatible()` كدالة مُصدَّرة من `matchingV3.ts`، ثم استيرادها في `pricingEngine.ts`

**المحور 5 — `itemNoBonus` في الحلقة**:
- سطر 332-335: حالياً `itemNoBonus = 50` عند `≥ 0.95` — يجب تحويله إلى `return فوراً` بثقة 99
- التدرج المطلوب: `≥0.95` → return 99, `≥0.85` → +40, `≥0.70` → +20

**المحور 6 — Pending عند confidence < 70**:
- سطر 731-738: حالياً `needs_review` مع كتابة السعر — يجب تحويله إلى `pending` بدون سعر مع `continue`

---

## التنفيذ (7 محاور)

### المحور 1: SQL Migration
```sql
CREATE OR REPLACE FUNCTION public.guard_manual_override()
  -- إضافة في البداية:
  IF NEW.status = 'pending' AND NEW.override_type IS NULL THEN
    RETURN NEW;
  END IF;
  -- باقي الكود كما هو
```

### المحور 2: إرسال `item_no`
- `priceMatchService.ts`: إضافة `itemNo?: string` للدوال + `item_no: itemNo` في body
- `usePriceLibrary.ts`: إضافة `itemNo?: string` في `match()` + تمريره

### المحور 3: إزالة `!== description`
- `matchingV3.ts` سطر 248: حذف `&& cleanItemNoForOverride !== description`
- `matchingV3.ts` سطر 323: حذف `&& cleanItemNo !== description`

### المحور 4: بوابات Historical Match
- استخراج `INCOMPATIBLE_GROUPS` و `areCategoriesCompatible()` من داخل `findRateLibraryMatchV3` إلى مستوى الملف كـ `export`
- استيرادهما في `pricingEngine.ts`
- إضافة فحص الفئة في `findHistoricalMatch` (سطور 432-451)
- إزالة `overrideType` من النتيجة المُرجعة
- إزالة `isInheritedManual` (سطر 754) وكل الكود المرتبط (سطور 754-776)
- إضافة تعليق توثيقي

### المحور 5: Hard Override في الحلقة
- سطر 332: `if (itemNoSim >= 0.95)` → `return { item: candidate, confidence: 99 }` فوراً

### المحور 6: Pending عند confidence < 70
- سطر 733-738: تحويل `needs_review` إلى `pending` بدون سعر + `continue`
- إضافة dry-run log مؤقت

### المحور 7: تحديث Memory + تقرير تحقق
- تحديث `mem://features/matching/v4-engine-core`
- إنشاء `mem://features/pricing/hardened-governance`
- اختبار 6 حالات عبر Edge Function

---

## الملفات المتأثرة

| الملف | المحاور |
|---|---|
| Migration SQL | 1 |
| `src/lib/pricing/matchingV3.ts` | 3, 4 (export), 5 |
| `src/lib/pricing/priceMatchService.ts` | 2 |
| `src/hooks/usePriceLibrary.ts` | 2 |
| `src/lib/pricingEngine.ts` | 4, 6 |
| Memory | 7 |

