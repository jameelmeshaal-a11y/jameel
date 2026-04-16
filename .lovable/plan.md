

# خطة التنفيذ النهائية — محرك التسعير المحكوم v2.0

تنفيذ كامل للمراحل 1→8 مع التحسينات الست المدمجة.

---

## الدفعة 1: المرحلة 8 + المرحلة 1 — الاختبارات + هيكلة A→E

### `src/lib/pricing/matchingV3.test.ts`
إضافة 12 اختبار TDD جديد (item_no bypass، category gate، extractCleanSegment، dimensions، historical map).

### `src/lib/pricing/matchingV3.ts`
- إضافة `INCOMPATIBLE_GROUPS` (doors↔windows↔plumbing↔hvac↔concrete↔earthworks)
- إضافة `extractCleanSegment()` — آخر جزء بعد `—` أو `/`
- تغيير توقيع `findRateLibraryMatchV3` لتقبل `item_no` و `historicalMap`
- إعادة هيكلة `scoreCandidate()` بالترتيب الصارم:
  - **A**: item_no exact → 98 فوراً (يتجاوز كل شيء)
  - **B**: INCOMPATIBLE_GROUPS → 0 فوراً
  - **C**: extractCleanSegment + textScore < 50 → 0
  - **D**: hasConceptConflict على الوصف النظيف → 0
  - **E**: historicalMap lookup → 95
  - باقي النقاط (dimensions, keywords, codes, containment)

### `src/lib/pricingEngine.ts`
- تمرير `item_no` و `historicalMap` إلى `findRateLibraryMatchV3()`
- إزالة `findHistoricalMatch()` كـ fallback منفصل (مدمج في المرحلة E)

### `supabase/functions/match-price-item/index.ts`
- إضافة `INCOMPATIBLE_GROUPS` و `areCategoriesCompatible()`

---

## الدفعة 2: المرحلة 2 — مسار الحفظ الذري

### DB Migration — تحديث `save_manual_price` RPC
1. فحص توافق الفئة + الوحدة قبل ربط `linked_rate_id` (مع fallback بـ `similarity() > 0.4` + شرط `category = v_detected_category`)
2. `is_locked` guard: إذا السجل مقفل → لا تعدّله، فقط اربط البند به
3. `is_locked = true` عند كل إنشاء/تحديث يدوي
4. Propagation بـ CTE لمنع التكرار + فحص الفئة في **كلا** الخطوتين:
   - Propagation 1: `extract_sub_item` + `detect_category_from_description(bi.description) = v_detected_category`
   - Propagation 2: `linked_rate_id` + `word_similarity > 0.25` + `bi.id NOT IN (SELECT id FROM p1_updated)` + **`detect_category_from_description(bi.description) = v_detected_category`**
5. إرجاع `protected_count`
6. إضافة INSERT في `pricing_audit_log` داخل الـ RPC

### DB Migration — دوال SQL جديدة
- `categories_compatible(a text, b text)` — جدول الفئات غير المتوافقة
- `detect_category_from_description(desc text)` — كشف الفئة من الوصف

### `src/components/PriceBreakdownModal.tsx`
- حذف `.update()` + `syncToRateLibrary()` (سطور 261-299)
- استبدال بـ `supabase.rpc("save_manual_price", {...})`
- عرض `protected_count` في Toast

---

## الدفعة 3: المرحلة 3 + 4 — الحماية + approved_library

### DB Migration
```sql
ALTER TABLE boq_items DROP CONSTRAINT IF EXISTS boq_items_source_check;
ALTER TABLE boq_items ADD CONSTRAINT boq_items_source_check
  CHECK (source IN ('library','library-high','library-medium','ai','manual',
    'project_override','master_update','bms-points-engine','approved_library'));
```

### `src/lib/pricingEngine.ts` — 4 مواقع:

1. **`resetBoQPricing()`** (سطر 872): إضافة `override_type` للـ select → فصل البنود اليدوية → reset فقط العادية → Toast بالعددين

2. **`runPricingEngine()`** (سطر 541): تغيير status من `needs_review` إلى `approved` + إضافة guard لـ `approved_library`:
```typescript
if (hasManualOverride(block.primaryRow) || block.primaryRow.source === 'approved_library') {
  // حماية كاملة
}
```

3. **`repriceUnpricedItems()`** (سطر 963): إضافة `override_type, source` للـ select + guard:
```typescript
if (row.override_type === 'manual' || row.source === 'approved_library') continue;
```

4. **`repriceSingleItem()`** (بعد سطر 1070): إضافة guard مزدوج

5. عند مطابقة سجل مقفل (فقط `source_type === 'Approved'`):
```typescript
if (matchedItem.is_locked && matchedItem.source_type === 'Approved') {
  source = 'approved_library';
  confidence = 95;
}
```
- تعديل سطر 597 و 997 و 1091: `'Approved'` فقط (حذف `Field-Approved` و `Revised`)

---

## الدفعة 4: المرحلة 6 — نافذة تأكيد الاعتماد

### `src/components/PriceBreakdownModal.tsx`
- عند "حفظ" → `AlertDialog` وسيطة تعرض: اسم البند + السعر القديم + السعر الجديد
- حقل "سبب التعديل" **إلزامي** (زر التأكيد `disabled` حتى يُملأ)
- الملاحظة تُمرر كـ `p_correction_note` إلى الـ RPC

---

## الدفعة 5: المرحلة 5 — المؤشرات المرئية

### `src/components/BoQTable.tsx`
- 🔒 لـ `override_type === 'manual'` + Tooltip: `"معتمد بواسطة [override_by] بتاريخ [override_at] — مقفل"`
- ✅ لـ `source === 'approved_library'` + Tooltip: `"سعر معتمد من مكتبة مقفلة — لن يتغير تلقائياً"`
- فلاتر: `[🔒 يدوي]` `[✅ مكتبة معتمدة]` `[⏳ pending]`
- إضافة `override_type, source, override_by, override_at` للـ select

---

## الدفعة 6: المرحلة 7 — تصدير ملف اعتماد

### `src/lib/export/etemadExporter.ts` (ملف جديد)
- قراءة Excel الأصلي من Storage عبر `boq_files.file_path`
- `findColumnByHeader()` بمطابقة دقيقة (`val === c || val.startsWith(c + ' ')`) مع إيقاف فوري عند أول تطابق
- تحديد `headerRowIndex` ديناميكياً (بحث عن صف يحتوي "الكمية" و "البند")
- `row_index` mapping مع safety check (مقارنة `item_no` كـ sanity)
- بنود pending → خلية فارغة
- اسم الملف: `[الأصلي]_مسعّر.xlsx`

### `src/components/BoQTable.tsx`
- زر "تصدير اعتماد" بجانب زر التصدير الحالي

---

## ملخص الملفات

| الملف | الدفعة |
|---|---|
| `src/lib/pricing/matchingV3.test.ts` | 1 |
| `src/lib/pricing/matchingV3.ts` | 1 |
| `src/lib/pricingEngine.ts` | 1, 3 |
| `supabase/functions/match-price-item/index.ts` | 1 |
| DB Migrations (RPC + functions + constraint) | 2, 3 |
| `src/components/PriceBreakdownModal.tsx` | 2, 4 |
| `src/components/BoQTable.tsx` | 5, 6 |
| `src/lib/export/etemadExporter.ts` (جديد) | 6 |

