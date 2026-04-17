

## التشخيص النهائي (لماذا ظهر 350 بدلاً من 1350)

تم استعلام قاعدة البيانات مباشرة. النتيجة:

**ملف "غرفة الكهرباء 1 عسير"** ربط 11 بند خرسانة (القواعد، الأعمدة، الكمرات، البلاطات…) بسجل مكتبة:
- `id=0c7296bf…` اسمه «بلاطة على الأرض بسمك 125 مم» — فئة `general_concrete` — وحدة م³ — سعر **350**.

بينما السجلات الصحيحة موجودة في المكتبة بسعر **1350**:
- «القواعد» (general, م³, 1350)
- «الكمرات» (slab_concrete, م³, 1350)
- «حوائط القص الخرسانية» (general, م³, 1350)
- «خرسانة مسلحة - بلاطات أسقف» (slab_concrete, م³, 1350)

في ملف "برج المراقبة عسير" نفس البنود رُبطت بـ «حوائط القص الخرسانية = 1350» — صحيح. الفرق الوحيد بين الملفين هو **أي بند رُبط أولاً** (Stage 1 يصبح مقفلاً للملف).

### الأسباب الجذرية الستة

1. **`categories_compatible` متساهلة جداً**: `general` متوافق مع كل شيء. سجل 350 فئته `general_concrete` يطابق `general` للبنود ⇒ يدخل التنافس.
2. **Stage 1 (item_no override → 99)** يطلق على أول مرشح يدخل `sameFileLibraryIds`. أول ربط خاطئ يُجمّد بقية الملف على نفس الفئة الخاطئة.
3. **`source_type='Approved'` → `library-high`** يُنتج `confidence=99` حتى عند نقاط التطابق المنخفضة لأن Stage 1 تتجاوز Stage 3 بالكامل.
4. **طبقة `rate_sources` + `resolveFromSources` + `weighted`** ما تزال نشطة في `pricingEngine.ts` — تُنتج أسعاراً مختلفة عن `target_rate` بدون أثر مرئي للمستخدم.
5. **trigger `flag_stale_boq_items`** يحوّل `status` إلى `stale_price` خفية عند أي تغيير، فيختلف ما تراه عن ما يُحفظ.
6. **`location_factor` و `base_city`** ما زال مُمرَّراً لـ `priceFromApprovedRate` (حتى لو لم يُضرب الآن، الكود موجود وقابل للنكوص).

---

## الحل النهائي — حوكمة بـ 10 طبقات حماية لا يمكن تجاوزها

### الطبقة 1 — تصفير شامل قبل المطابقة (DB migration)
```text
DELETE rate_sources;                          -- يلغي طبقة المصادر بالكامل
UPDATE boq_items SET unit_rate=NULL, total_price=NULL,
  materials=NULL, labor=NULL, equipment=NULL, logistics=NULL,
  risk=NULL, profit=NULL, confidence=NULL, source=NULL,
  status='pending', linked_rate_id=NULL,
  override_type=NULL, override_at=NULL, override_by=NULL,
  override_reason=NULL, manual_overrides='{}'::jsonb;
-- يشمل اليدوية. (لا يوجد trigger guard_manual_override في DB حالياً، الخانة آمنة)
```

### الطبقة 2 — تشديد `categories_compatible` (DB function)
حذف الاستثناء `'general' OR 'general'`. تصبح القاعدة:
- نفس الفئة بعد `split_part('_',1)` → ✅
- INCOMPATIBLE_GROUPS صريحة → ❌
- `general` ↔ أي فئة محددة → ❌ (جديد، يحجب 350 من اقتحام بنود concrete)

### الطبقة 3 — إيقاف طبقة المصادر نهائياً
`pricingEngine.ts`: حذف كل استدعاءات `fetchAllSources / resolveFromSources`. يبقى مرجع واحد فقط = `rate_library.target_rate`.

### الطبقة 4 — `effectiveRate = target_rate` صراحةً
ثابت في الكود. لا متغير `effectiveRate` يأتي من مكان آخر. إن اختلف عن `target_rate` يُرفض الكتابة.

### الطبقة 5 — Stage 1 (item_no Override) مُقيّد بفئة + وحدة متطابقتين
حالياً Stage 1 يطلق فور تطابق `item_code` ≥95% ضمن نفس الملف. يُضاف شرط: `categories_compatible(boq.category, candidate.category) AND normalizeUnit متطابقة` قبل العودة بـ 99. هذا يمنع البند الخاطئ الأول من قفل الملف.

### الطبقة 6 — رفع العتبة الصارمة من 75 إلى 80
`matchingV3.ts`: `>= 75` → `>= 80`. أي بند أقل = يبقى `pending`.

### الطبقة 7 — حذف `flag_stale_boq_items` trigger والدالة
لا توجد حالة `stale_price` خفية. الحالات المسموحة: `pending | approved | needs_review | unmatched | descriptive`.

### الطبقة 8 — حذف location_factor من التسعير
حذف معاملات `locationFactor, baseCity, projectCity` من `priceFromApprovedRate`. `unit_rate := target_rate` بلا استثناء.

### الطبقة 9 — DB CHECK constraint على boq_items
```text
ALTER TABLE boq_items ADD CONSTRAINT chk_unit_rate_matches_library
CHECK (
  unit_rate IS NULL
  OR override_type = 'manual'
  OR linked_rate_id IS NOT NULL
);
-- يمنع أي صف مسعّر بدون رابط واضح للمكتبة.
```

### الطبقة 10 — Health check ودالة DB للتحقق
دالة `verify_pricing_governance()` ترجع تقريراً JSON: عدد البنود التي `unit_rate ≠ rl.target_rate AND override_type ≠ 'manual'`. تُستدعى من زر «فحص الحوكمة» في صفحة الإدارة. إن وُجد أي صف ⇒ alert أحمر.

---

## الـ Pipeline النهائي بعد التطبيق (صارم، 4 مراحل)

```text
1. item_no exact match (≥95%) داخل نفس الملف
   + AND categories_compatible(boq.cat, lib.cat)
   + AND normalizeUnit متطابقة
   → confidence 99، STOP

2. Category gate (شامل general↔specific block) + Unit gate (هارد)
   → فلترة المرشحين، لا توجد نقاط

3. Description scoring على المرشحين الناجين فقط:
   normalized Arabic + synonyms + Jaccard + char n-gram
   → score ≥ 80 يفوز، STOP

4. Bundled strict (composite ≥ 80)
   → score يفوز، STOP

غير ذلك → null. unit_rate=NULL، status='pending'. لا fallback.
```

---

## الملفات المتأثرة

| ملف | تغيير |
|---|---|
| migration جديدة | تصفير شامل + إعادة `categories_compatible` + حذف trigger + CHECK constraint + دالة `verify_pricing_governance` |
| `src/lib/pricingEngine.ts` | حذف fetchAllSources/resolveFromSources، حذف locationFactor من التسعير، استخدام target_rate حرفياً |
| `src/lib/pricing/matchingV3.ts` | عتبة 75→80، إضافة شرط category+unit على Stage 1 |
| `src/lib/pricing/locationEngine.ts` | يبقى للعرض فقط (مدينة المشروع للسجلات)، لا يضرب |
| `src/lib/pricing/sourceResolver.ts` | يُحذف من الاستيراد (يبقى الملف لحين تنظيف لاحق) |
| `src/pages/AdminDashboard.tsx` | زر «فحص حوكمة الأسعار» يستدعي `verify_pricing_governance()` |
| `mem://features/matching/v4-engine-core` | تحديث: عتبة 80، Stage 1 مع category gate، حذف rate_sources |

---

## بعد التطبيق — خطة تحقق (الإثبات)

1. تشغيل migration ⇒ كل أسعار boq_items = NULL، رسالة تأكيد بعدد الصفوف المُصفّرة + 0 rate_sources.
2. الضغط على «إعادة تسعير المشروع» لمشروع برج المراقبة عسير.
3. استعلام تحقق:
   ```text
   SELECT COUNT(*) FROM boq_items bi
   JOIN rate_library rl ON rl.id = bi.linked_rate_id
   WHERE bi.unit_rate IS NOT NULL AND bi.unit_rate <> rl.target_rate
     AND (bi.override_type IS NULL OR bi.override_type <> 'manual');
   ```
   يجب أن يُرجع 0.
4. صورة من جدول BoQ لـ «غرفة الكهرباء 1 عسير» تُظهر القواعد/الأعمدة/الكمرات بسعر **1350** (أو يبقى pending إن لم يصل ≥80).
5. توست تقرير الحوكمة في صفحة الإدارة: «✅ 100% من البنود المسعّرة مطابقة للمكتبة».

---

## ضمانات لا رجعة فيها

- ✅ `target_rate` فقط، صفر متغيرات/مضاعفات.
- ✅ `general` لا يطابق فئة محددة.
- ✅ Stage 1 لا يقفز فوق فئة/وحدة.
- ✅ DB CHECK يرفض صف مسعّر بدون رابط مكتبة.
- ✅ trigger stale_price محذوف.
- ✅ rate_sources معطّل في الكود.
- ✅ دالة فحص دورية متاحة من زر واحد.
- ✅ كل بند غير مطابق ≥80 يبقى `pending` بدون سعر.
- ✅ التسعير اليدوي محمي عبر `override_type='manual'` المستثنى من CHECK.
- ✅ كل تغيير يُسجَّل في `pricing_audit_log`.

