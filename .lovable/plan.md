

# تحليل وإصلاح مشكلتين: الموثوقية 84% + عدم انتقال الحماية اليدوية بين المشاريع

## التشخيص من البيانات الحية

### المشكلة 1: موثوقية 84% بدل 99%

**البيانات:**
- `item_no` في جدول الكميات: `سلم من الحديد`
- اسم المكتبة (`standard_name_ar`): `سلالم من الحديد :تصميم و توريد وإنشاء سلم من الحديد بما في ذلك... — سلم من الحديد`

**السبب الجذري:** كود `itemNoBonus` (سطر 250-253) يقارن `item_no` بالاسم الكامل الطويل للمكتبة. النص الطويل يقلل نسبة التشابه فلا تصل إلى 0.95 ولا 0.85.

لكن `extractCleanSegment` يستخرج "سلم من الحديد" من بعد "—" — وهو مطابق 100% لـ `item_no`. **لكن هذه المقارنة لا تحدث في كود `itemNoBonus`.**

**الحل:** إضافة مقارنة `item_no` مع `extractCleanSegment(candidate.standard_name_ar)` في حساب `itemNoBonus`.

### المشكلة 2: لا تظهر علامة "محمي يدوياً" في المشروع الجديد

**البيانات:**
| المشروع | البند | override_type | confidence |
|---|---|---|---|
| حجز الرجال (أمس) | سلم من الحديد | `manual` ✅ | 95 |
| حجز النساء (اليوم) | سلم من الحديد | `null` ❌ | 84 |

**السبب الجذري:** `buildHistoricalMap()` تجلب `linked_rate_id` فقط — لا تجلب `override_type`. وعند المطابقة التاريخية، المحرك لا ينقل حالة الحماية اليدوية. النظام لا "ينسى"، لكنه ببساطة لم يُصمم لنقل الحماية بين المشاريع.

**الحل:** توسيع `buildHistoricalMap` لتحمل `override_type`، وعند المطابقة التاريخية لبند كان `manual` في مشروع سابق، ينتقل `override_type = "manual"` تلقائياً.

---

## التغييرات المطلوبة

### 1. `src/lib/pricing/matchingV3.ts` — إصلاح حساب itemNoBonus

في الأسطر 250-254، إضافة مقارنة مع الجزء النظيف من اسم المكتبة:

```typescript
const itemNoSim = Math.max(
  textSimilarity(cleanItemNo, candidate.standard_name_ar || ""),
  textSimilarity(cleanItemNo, candidate.standard_name_en || ""),
  textSimilarity(cleanItemNo, extractCleanSegment(candidate.standard_name_ar || "")), // ← جديد
  textSimilarity(cleanItemNo, extractCleanSegment(candidate.standard_name_en || "")), // ← جديد
  ...(candidate.item_name_aliases || []).map(a => a ? textSimilarity(cleanItemNo, a) : 0),
  ...(candidate.item_name_aliases || []).map(a => a ? textSimilarity(cleanItemNo, extractCleanSegment(a)) : 0), // ← جديد
);
```

هذا يجعل "سلم من الحديد" يطابق الجزء النظيف "سلم من الحديد" بنسبة 100% → bonus = 50 → confidence = 99.

### 2. `src/lib/pricingEngine.ts` — نقل الحماية اليدوية بين المشاريع

**أ.** توسيع `HistoricalMapping` ليشمل `overrideType`:
```typescript
interface HistoricalMapping {
  normalizedDesc: string;
  tokens: string[];
  linkedRateId: string;
  unit: string;
  overrideType: string | null; // ← جديد
}
```

**ب.** تحديث `buildHistoricalMap` لجلب `override_type`:
```typescript
.select("description, description_en, unit, linked_rate_id, source, override_type")
```

**ج.** تحديث `findHistoricalMatch` لإرجاع `overrideType`:
```typescript
return { item: linked, confidence: 92, overrideType: hist.overrideType };
```

**د.** في المحرك الرئيسي (سطر ~602)، عند المطابقة التاريخية لبند `manual`:
```typescript
if (libraryMatchResult?.overrideType === "manual") {
  // نقل الحماية اليدوية من المشروع السابق
  update.override_type = "manual";
  update.source = "manual";
  update.notes = "⭐ تسعير يدوي موروث من مشروع سابق";
}
```

### 3. `src/lib/pricing/matchingV3.test.ts` — اختبار تراجعي

اختبار يؤكد أن `item_no = "سلم من الحديد"` يطابق مكتبة اسمها الكامل طويل لكن الجزء بعد "—" هو "سلم من الحديد" بموثوقية ≥ 95.

## الملفات المتأثرة

| الملف | التغيير |
|---|---|
| `src/lib/pricing/matchingV3.ts` | مقارنة itemNo مع extractCleanSegment |
| `src/lib/pricingEngine.ts` | نقل override_type عبر المطابقة التاريخية |
| `src/lib/pricing/matchingV3.test.ts` | اختبار تراجعي |

## لماذا هذا الحل دائم
- **المشكلة 1**: أي بند `item_no` مطابق للجزء النظيف من اسم المكتبة يحصل على 99% تلقائياً
- **المشكلة 2**: أي بند سُعّر يدوياً في أي مشروع سابق يحمل حمايته تلقائياً لكل مشروع مستقبلي

