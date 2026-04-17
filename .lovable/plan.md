

## خطة الإصلاح — تصدير اعتماد + المزايا الموثقة

### المرحلة 1: تشخيص الوضع الحالي (قبل أي تعديل)

أحتاج التحقق من:
1. هل `src/lib/boqOriginalExport.ts` موجود فعلاً؟ (الملف غير ظاهر في قائمة المشروع)
2. الوضع الحالي لـ `src/lib/export/etemadExporter.ts` (تم إعادة كتابته في v4.0)
3. هل RPC `save_manual_price` مُستخدم حالياً في `PriceBreakdownModal.tsx`؟
4. الوضع الحالي لـ `pricingEngine.ts` بخصوص حماية البنود اليدوية
5. الوضع الحالي لـ `matchingV3.ts` بخصوص `linked_rate_id`

**ملاحظة جوهرية**: المشروع يستخدم `etemadExporter.ts` (وليس `boqOriginalExport.ts`). لذا الحل الموثق في الملف لن ينطبق حرفياً — سنطبق نفس **المبدأ** على الملف الفعلي.

---

### المرحلة 2: الإصلاحات (بعد التشخيص)

#### (1) تصدير اعتماد — الحل الجذري الموثق
- فحص `etemadExporter.ts` للتأكد من عدم إضافة شيت ثانٍ
- التأكد أن المسار يحقن فقط في الشيت الأصلي
- إذا كان هناك أي إضافة لشيت "تحليل الأسعار" → حذفها
- التحقق من أن `injectCellValue` يعمل بشكل صحيح بعد sanitize

#### (2) الحفظ الذري عبر RPC `save_manual_price`
- استبدال أي `update boq_items` + `syncToRateLibrary` منفصلين بـ استدعاء RPC واحد
- RPC موجود فعلاً في قاعدة البيانات (مؤكد من schema)
- إزالة `syncToRateLibrary` من `handleSave`

#### (3) حماية البنود اليدوية في `pricingEngine.ts`
- إضافة guard صريح في `repriceSingleItem` و `repriceUnpricedItems`
- تخطي أي بند بـ `override_type === 'manual'`

#### (4) إخفاء بنود التحليل من جدول الكميات
- ملاحظة: لا يوجد عمود `item_type` في `boq_items` (مؤكد من schema)
- بدلاً من الفلترة بـ `item_type`، نستخدم `quantity === 0` + علامات وصفية كما هو معتمد في النظام
- إضافة toggle UI فقط (الفلترة موجودة بالفعل عبر `BoQ Row Classification System`)

#### (5) توليد keywords/aliases تلقائياً
- إضافة `generateKeywords()` helper في `usePriceLibrary.ts`
- استدعاء في `useAddPriceItem` و `useUpdatePriceItem`

#### (6) إصلاح `matchingV3.ts` — `linked_rate_id` كـ hint
- ملاحظة مهمة: يتعارض مع memory `item-no-hard-override` (≥95% = bypass)
- التعديل المقترح: `linked_rate_id` يصبح bonus +5 فقط، **لكن** نحافظ على `item_no` Hard Override كما هو
- إضافة فحص تعارض (concept/dimension/category) قبل الثقة في `linked_rate_id`

#### (7) Migration — backfill keywords
- SQL لملء `keywords` و `item_name_aliases` للبنود الحالية الفارغة

---

### الملفات المعدّلة (متوقعة)

| الملف | التغيير |
|---|---|
| `src/lib/export/etemadExporter.ts` | تحقق + تنظيف أي شيت إضافي |
| `src/components/PriceBreakdownModal.tsx` | استبدال handleSave بـ RPC ذري |
| `src/lib/pricingEngine.ts` | guard للبنود اليدوية |
| `src/components/BoQTable.tsx` | toggle لإخفاء بنود التحليل |
| `src/hooks/usePriceLibrary.ts` | توليد keywords/aliases |
| `src/lib/pricing/matchingV3.ts` | linked_rate_id كـ hint + فحص تعارض |
| Migration جديد | backfill keywords للبنود الحالية |

### ضمانات الالتزام بالـ Memory
- ✅ `item_no` Hard Override (≥95% = confidence 99) محفوظ
- ✅ Category Hard Gate محفوظ
- ✅ Hardened Propagation (word_similarity ≥0.65) محفوظ
- ✅ Manual Approval Sync عبر RPC `save_manual_price` (موجود فعلاً)
- ✅ Reset Governance — البنود اليدوية محمية
- ✅ Zero AI Pricing + VAT excluded
- ✅ صفر تغيير على schema الأساسي

### ترتيب التنفيذ
1. تشخيص etemadExporter + إصلاح التصدير (الأولوية القصوى)
2. اختبار التصدير
3. RPC ذري + حماية يدوية
4. keywords + matchingV3 hint
5. UI toggle + migration backfill

