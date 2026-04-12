

# إصلاح ربط الأبواب وإضافة اختبارات المقاسات

## المشكلة الحالية

الأبواب J2 (1000×2350) و J6 (2200×2350) و N2 (900×2150) **لا تزال مرتبطة بنفس السجل** `01035fe2` في المكتبة (باب N2 بمقاس 900×2150):

| البند | المقاس | linked_rate_id | السعر الحالي |
|---|---|---|---|
| J2 | 1000×2350 | 01035fe2 ❌ | 9,000 |
| J6 | 2200×2350 | 01035fe2 ❌ | 9,200 |
| N2 (أول) | 900×2150 | dee29d22 | 3,200 |
| N2 (ثاني) | 900×2150 | 01035fe2 ✅ | 1,600 |
| Q1 | 3600×1800 | feb3d95c ✅ | 8,500 |

**السبب**: الربط الخاطئ تم **قبل** إضافة فحص المقاسات. والآن عند إعادة التسعير، المسار A (Direct lookup) يستخدم `linked_rate_id` مباشرة **بدون أي فحص للمقاسات** — يتجاوز كل المنطق الجديد.

## الحل — 3 تغييرات

### 1. إضافة فحص المقاسات في المسار A (matchingV3.ts)
عند استخدام `linked_rate_id`، يجب التحقق أن المقاسات متطابقة. إذا اختلفت، يُلغى الربط ويُعاد التقييم من الصفر.

```typescript
// Path A — Direct lookup with dimension validation
if (linkedRateId) {
  const linked = rateLibrary.find((rate) => rate.id === linkedRateId);
  if (linked) {
    // Validate dimensions match
    const boqDims = parseDimensions(description + " " + descriptionEn);
    const linkedDims = parseDimensions(
      (linked.standard_name_ar || "") + " " + (linked.standard_name_en || "")
    );
    const bothHaveWxH = boqDims.some(d => d.type === "dimensions" && d.values.length >= 2)
      && linkedDims.some(d => d.type === "dimensions" && d.values.length >= 2);
    if (!bothHaveWxH || compareDimensions(boqDims, linkedDims) !== -1) {
      return { item: linked, confidence: 95 };
    }
    // Dimensions mismatch — fall through to scoring
    console.log(`[V3] linked_rate_id ${linkedRateId} dimension mismatch, re-scoring`);
  }
}
```

### 2. مسح linked_rate_id الخاطئ للبنود المتأثرة (migration)
تحديث البنود J2 و J6 لإزالة الربط الخاطئ بسجل `01035fe2`:

```sql
UPDATE boq_items 
SET linked_rate_id = NULL 
WHERE linked_rate_id = '01035fe2-9f35-4167-8c55-ebb8b6370021'
  AND description NOT LIKE '%900×2150%'
  AND description NOT LIKE '%900*2150%';
```

### 3. إضافة اختبارات المقاسات (matchingV3.test.ts)

إضافة حالات اختبار جديدة:
- **WxH mismatch**: باب 1000×2350 لا يتطابق مع 900×2150
- **WxH match**: باب 900×2150 يتطابق مع 900×2150
- **linked_rate_id dimension override**: عند وجود linked_rate_id بمقاسات مختلفة، يُعاد التقييم بدلاً من القبول الأعمى

## الملفات المتأثرة

| الملف | التغيير |
|---|---|
| `src/lib/pricing/matchingV3.ts` | فحص المقاسات في المسار A |
| `src/lib/pricing/matchingV3.test.ts` | 3 اختبارات جديدة للمقاسات |
| Database migration | مسح linked_rate_id الخاطئ |

## النتيجة المتوقعة
- J2 و J6 يحصلان على سجلات مستقلة عند إعادة التسعير
- Q1 و N2 يبقيان مرتبطين بسجلاتهما الصحيحة
- الاختبارات تضمن عدم تكرار المشكلة

