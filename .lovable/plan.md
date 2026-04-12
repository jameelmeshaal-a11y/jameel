

# فحص شامل وإصلاح نهائي لنظام التسعير

## ملخص الوضع الحالي

بعد الفحص الشامل، وجدت:

### ✅ ما تم إصلاحه بنجاح
- فحص المقاسات في المسار A (Direct lookup) — يعمل
- مسح `linked_rate_id` الخاطئ من J2 و J6 — تم (كلاهما `null` الآن)
- Hard skip في محرك المطابقة V3 للمقاسات المختلفة — يعمل
- فحص المقاسات في `rateSyncService.ts` — يعمل
- إعادة التسعير تصفّر كل البيانات (unit_rate, total_price, breakdown, linked_rate_id, notes, status, overrides) — يعمل ✅
- مسح الكاش (`qc.removeQueries`) قبل إعادة التسعير — يعمل ✅

### ❌ ثغرة خطيرة مكتشفة: المسار A.5 (Historical Mapping)

الدالة `findHistoricalMatch` (سطر 401) تبحث في **جميع بنود المشاريع الأخرى** التي لها `linked_rate_id`، وتستخدم Jaccard similarity ≥ 0.85 للربط — **بدون أي فحص للمقاسات**.

**السيناريو**: بند N2 (900×2150) في مشروع آخر مرتبط بسجل `01035fe2`. عند تسعير J2 (1000×2350) في المشروع الحالي:
1. المسار A: لا يوجد `linked_rate_id` (تم مسحه) ✅
2. المسار B (V3): Hard skip بسبب اختلاف المقاسات ✅
3. **المسار A.5**: يجد بند N2 من مشروع آخر بتشابه > 85%، فيربط J2 بنفس السجل ❌

### ❌ مشكلة إضافية: لا يوجد سجل مكتبة لـ J2 أو J6

المكتبة تحتوي فقط على:
- `01035fe2` → N2 (900×2150) بسعر 2,300
- `feb3d95c` → Q1 (3600×1800) بسعر 4,300

لا يوجد سجل لـ J2 (1000×2350) أو J6 (2200×2350). عند إعادة التسعير، هذه البنود ستظهر كـ "unmatched" — وهذا **سلوك صحيح** لأن النظام لا يختلق أسعاراً.

## الحل — 4 تغييرات

### 1. إضافة فحص المقاسات في المسار A.5 (pricingEngine.ts)
في `findHistoricalMatch`، إضافة تحقق من المقاسات قبل قبول المطابقة التاريخية:

```typescript
function findHistoricalMatch(...) {
  // ... existing code ...
  for (const hist of historicalMap) {
    // ... existing matching ...
    if (jaccard >= 0.85) {
      const linked = rateLibrary.find(r => r.id === hist.linkedRateId);
      if (linked) {
        // NEW: Dimension validation
        const boqDims = parseDimensions(description + " " + descriptionEn);
        const linkedDims = parseDimensions(linked.standard_name_ar + " " + linked.standard_name_en);
        const boqHasWxH = boqDims.some(d => d.type === "dimensions" && d.values.length >= 2);
        const linkedHasWxH = linkedDims.some(d => d.type === "dimensions" && d.values.length >= 2);
        if (boqHasWxH && linkedHasWxH && compareDimensions(boqDims, linkedDims) === -1) {
          continue; // مقاسات مختلفة — تخطي
        }
        return { item: linked, confidence: 90 };
      }
    }
  }
}
```

### 2. إضافة اختبارات شاملة (matchingV3.test.ts)
- اختبار: مسار A.5 لا يربط أبواباً بمقاسات مختلفة
- اختبار: أبواب بنفس المقاس تتطابق بنجاح
- اختبار: J2 (1000×2350) لا تتطابق مع N2 (900×2150)

### 3. تقرير فحص ما قبل إعادة التسعير (BoQTable.tsx)
عند الضغط على "إعادة التسعير"، يعرض ملخصاً يوضح:
- عدد البنود التي ستُصفَّر
- عدد البنود المتوقع مطابقتها من المكتبة
- عدد البنود المتوقع أن تكون "unmatched"

### 4. تعزيز تقرير سلامة التسعير
إضافة فحص جديد: **"بنود مرتبطة بسجل مكتبة بمقاسات مختلفة"** — يكتشف أي ربط خاطئ قائم.

## الملفات المتأثرة

| الملف | التغيير |
|---|---|
| `src/lib/pricingEngine.ts` | فحص المقاسات في `findHistoricalMatch` |
| `src/lib/pricing/matchingV3.test.ts` | اختبارات جديدة |
| `src/lib/pricing/integrityChecker.ts` | فحص تطابق المقاسات |
| `src/components/BoQTable.tsx` | ملخص ما قبل إعادة التسعير |

## إجابات أسئلتك

**هل تستطيع إعادة تسعير جداول الكميات السابقة؟**
نعم — زر "إعادة التسعير" يصفّر كل شيء (أسعار، توزيعات، ربط، تعديلات يدوية) ويبدأ من الصفر. الكود موجود ويعمل.

**هل النظام يخلط ولا يلتزم بمكتبة الأسعار؟**
النظام **يلتزم** بالمكتبة 100%. المشكلة كانت أن بنوداً مختلفة المقاس تُربط بنفس السجل. بعد الإصلاح + سد ثغرة المسار A.5، كل باب بمقاس مختلف سيُعامل كبند مستقل.

**هل النظام يسعّر بنوداً غير موجودة في المكتبة؟**
لا — أي بند لا يتطابق مع المكتبة يظهر كـ "unmatched" بسعر صفر. J2 و J6 ستظهر كـ unmatched حتى تُضاف أسعارها يدوياً ثم تُحفظ في المكتبة.

