

# تنفيذ إصلاح مطابقة البنود — extractCleanSegment

## المشكلة
أوصاف البنود تحتوي على تسلسل هرمي (`إجمالي النوافذ | أعمال التشطيبات — بلاط سيراميك`) يُلوث `boqTokens` و `boqConcepts` بكلمات غير ذات صلة، مما يُخفض درجة المطابقة تحت 50.

## التعديلات

### 1. `src/lib/pricing/matchingV3.ts`

**إضافة دالة `extractCleanSegment`** (بعد الـ imports، قبل الـ types):
```typescript
function extractCleanSegment(desc: string): string {
  if (desc.includes("—")) return desc.split("—").pop()!.trim();
  if (desc.includes(" - ")) return desc.split(" - ").pop()!.trim();
  if (desc.includes("|")) return desc.split("|").pop()!.trim();
  return desc;
}
```

**تعديل سطور 190-194** — استخدام الوصف النظيف لحساب features:
```typescript
const cleanDesc = extractCleanSegment(enrichedDesc);
const cleanEn = extractCleanSegment(descriptionEn || "");
const featureText = cleanDesc + " " + (cleanEn || "");
const boqCodes = extractModelCodes(fullText); // keep full for codes
const boqTokens = tokenize(featureText);      // clean for tokens
const boqDimensions = parseDimensions(featureText);
const boqConcepts = detectConcepts(featureText);
```

**تعديل سطور 411-417** — إضافة تقسيم على `|` في scoreCandidate:
```typescript
const descSegments = [description];
if (description.includes("—")) {
  const lastSeg = description.split("—").pop()?.trim();
  if (lastSeg && lastSeg.length > 3) descSegments.push(lastSeg);
}
if (description.includes("|") && !description.includes("—")) {
  const lastPipe = description.split("|").pop()?.trim();
  if (lastPipe && lastPipe.length > 3) descSegments.push(lastPipe);
}
```

**تعديل سطور 442-445** — حساب ngramScore بالجزء النظيف:
```typescript
const cleanSeg = extractCleanSegment(description);
const ngramScore = Math.max(
  charNgramSimilarity(description, candidate.standard_name_ar || ""),
  charNgramSimilarity(cleanSeg, candidate.standard_name_ar || ""),
  charNgramSimilarity(descriptionEn || "", candidate.standard_name_en || ""),
) * 30;
```

### 2. `src/lib/pricing/matchingV3.test.ts`

إضافة 3 اختبارات بعد السطر 830:

- **حالة `|` و `—` معاً**: `"إجمالي النوافذ | أعمال التشطيبات — بلاط سيراميك للحوائط"` مع سجل مكتبة "بلاط سيراميك" → يطابق
- **حالة `|` بدون `—`**: `"إجمالي النوافذ | بلاط سيراميك"` → يطابق سجل "بلاط سيراميك"
- **HVAC مع تسلسل طويل**: وصف طويل مع `—` → يطابق الوحدة الصحيحة

سيتم إضافة سجل مكتبة mock جديد لـ "بلاط سيراميك" في `mockLibrary`.

### 3. بعد التنفيذ

- تشغيل الاختبارات والتأكد من نجاحها
- **لن** يتم تشغيل إعادة تسعير تلقائية
- عرض عينة 10 بنود pending مع السجل المتوقع للمراجعة قبل التطبيق

## الملفات المتأثرة
| الملف | التغيير |
|---|---|
| `src/lib/pricing/matchingV3.ts` | `extractCleanSegment` + تنظيف features + scoring |
| `src/lib/pricing/matchingV3.test.ts` | 3 اختبارات هرمية + mock جديد |

