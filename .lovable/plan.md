

## خطة محدّثة — تنظيف ما قبل المطابقة + Pipeline صارم (مع التعديلات الثلاثة)

### Migration 1 — تنظيف DB (مرة واحدة)

#### 1.A — فك ربط البنود غير المعتمدة يدوياً مع **الإبقاء على أسعار approved**
```sql
UPDATE public.boq_items
SET linked_rate_id = NULL,
    status = CASE WHEN status = 'approved' THEN 'stale_price' ELSE 'pending' END
    -- unit_rate / total_price / materials / labor / equipment / logistics / risk / profit تبقى كما هي
WHERE (override_type IS NULL OR override_type <> 'manual');
```
✅ بنود approved تحتفظ بأسعارها وتنتقل لـ `stale_price` (تظهر للمراجعة دون إعادة تسعير تلقائية)
✅ بنود pending/أخرى تبقى pending مع فك الربط

#### 1.B — حذف بنود مكتبة قديمة (بدون شرط زمني — فقط source_type)
```sql
DELETE FROM public.rate_sources
WHERE rate_library_id IN (
  SELECT id FROM public.rate_library
  WHERE is_locked = false
    AND source_type <> 'Approved'
);

DELETE FROM public.rate_library
WHERE is_locked = false
  AND source_type <> 'Approved'
  AND id NOT IN (SELECT DISTINCT linked_rate_id FROM public.boq_items WHERE linked_rate_id IS NOT NULL);
```
✅ يحتفظ بكل ما هو `is_locked=true` أو `source_type='Approved'` أو مرتبط ببند BoQ حالي

---

### Pipeline المطابقة الصارم (4 مراحل — كل مرحلة gate)

#### Stage 1 — `item_no` (مقيّد بـ boq_file_id)
- البحث عن مطابقة `item_no` بنسبة ≥95% **داخل نفس `boq_file_id` فقط** (عبر بنود BoQ المعتمدة سابقاً في الملف نفسه أو library entries مرتبطة بـ rate_sources لنفس الملف).
- ✅ يمنع تسريب رقم بند من ملف لآخر (أرقام البنود قد تتكرر بين ملفات مختلفة).
- نجاح → confidence 99، وقف Pipeline.

#### Stage 2 — Category + Unit (gate)
- Filter pool: `categories_compatible(boq.category, lib.category) = true` AND `normalizeUnit(boq.unit) = normalizeUnit(lib.unit)`.
- pool فارغ → no match (يبقى pending).

#### Stage 3 — Description (normalized + synonyms + word_similarity ≥0.65)
- على pool المرشّح من Stage 2.
- normalize عربي + synonyms + Jaccard على keywords + `word_similarity` PG.
- score ≥ 0.85 → match (confidence = round(score × 100))، وقف Pipeline.

#### Stage 4 — Bundled strict (composite ≥75، لا fallback مفتوح)
- composite = `0.4 × itemNoSim + 0.3 × jaccard + 0.3 × wordSimilarity` × 100.
- ≥ 75 → match. أقل → pending.

---

### الملفات المتأثرة

| الملف | التغيير |
|---|---|
| migration جديدة | تنظيف 1.A + 1.B بالصيغة المحدّثة |
| `src/lib/pricing/matchingV3.ts` | Pipeline 4 مراحل، Stage 1 مقيّد بـ boq_file_id، عتبات 0.85 / 75 |
| `supabase/functions/match-price-item/index.ts` | نفس Pipeline على الخادم، يقبل `boq_file_id` parameter |
| `src/lib/pricing/priceMatchService.ts` | تمرير `boq_file_id` للـ Edge Function |
| `mem://features/matching/v4-engine-core` | تحديث الذاكرة (Pipeline متسلسل + boq_file_id scope) |

### ضمانات الحوكمة

- ✅ Manual overrides (`override_type='manual'`) لا تُمسّ (`guard_manual_override` + استثناء صريح)
- ✅ بنود approved تحتفظ بأسعارها (تنتقل لـ `stale_price` للمراجعة فقط)
- ✅ مكتبة `is_locked=true` أو `source_type='Approved'` محفوظة
- ✅ `save_manual_price` و propagation و export (qty-based) و pricing engine: صفر تغيير
- ✅ Stage 1 مقيّد بالملف يمنع cross-file leakage

### التحقق بعد التنفيذ

1. شغّل re-price على مشروع برج المراقبة
2. console: `matchedAtStage1 / 2 / 3 / 4 / unmatched`
3. تأكد بنود 🔒 لم تتغيّر، وبنود stale_price ظاهرة مع أسعارها القديمة للمراجعة

