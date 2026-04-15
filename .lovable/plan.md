

# بوابة تحقق متعددة المراحل — 4 طبقات

## ترتيب التنفيذ (حسب طلبك): الطبقة 1 ← 4 ← 3 ← 2

---

### الطبقة 1: تنظيف البيانات (Migration SQL)

فك ارتباط 17 بنداً مرتبطة خطأً بسجل `8db5d710` (أحواض، مراحيض، مراوح، نوافذ). إعادتها لـ `pending` لإعادة تسعيرها بشكل صحيح.

---

### الطبقة 4: INCOMPATIBLE_GROUPS في `matchingV3.ts`

إضافة hard gate قبل إضافة أي مرشح لـ `viableCandidates`:

```typescript
const INCOMPATIBLE_GROUPS: Record<string, string[]> = {
  doors: ['windows','plumbing_fixtures','plumbing_pipes','hvac_equipment','hvac_ductwork'],
  windows: ['doors','plumbing_fixtures','plumbing_pipes','hvac_equipment','steel_misc'],
  plumbing_fixtures: ['doors','windows','hvac_equipment','steel_misc','electrical_fixtures'],
  hvac_equipment: ['doors','windows','plumbing_fixtures','steel_misc'],
};
```

**ملاحظتك مطبّقة**: `fire_fighting` غير موجودة في قائمة `doors` — أبواب الحريق لن تُحظر.

---

### الطبقة 3: Category Gate في Edge Function

**الملف**: `supabase/functions/match-price-item/index.ts`

1. إضافة دالة `detectItemCategory(name)` (regex-based)
2. إضافة `areCategoriesCompatible()` بنفس INCOMPATIBLE_GROUPS
3. تخطي أي سجل مكتبة ذي فئة غير متوافقة قبل حساب النقاط

---

### الطبقة 2: Propagation 2 بشرط similarity (Migration SQL — الأخيرة)

**ملاحظتك مطبّقة**: `pg_trgm` غير مفعّل حالياً — سيُفعّل أولاً. `extract_sub_item` موجودة بالفعل ✓

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

ثم تحديث Propagation 2 في `save_manual_price` بإضافة:
```sql
AND similarity(public.extract_sub_item(bi.description), v_sub_item_name) > 0.25
```

---

## الملفات المتأثرة

| الملف | التغيير |
|---|---|
| Migration SQL | تنظيف بيانات + `pg_trgm` + تحديث `save_manual_price` |
| `src/lib/pricing/matchingV3.ts` | INCOMPATIBLE_GROUPS hard gate |
| `supabase/functions/match-price-item/index.ts` | detectItemCategory + areCategoriesCompatible |

