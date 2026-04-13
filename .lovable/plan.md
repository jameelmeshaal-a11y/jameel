

# إصلاح جذري: تنظيف 32 بند + إصلاح منطق الثقة + مفاهيم جديدة

## الخطوة 1: تنظيف قاعدة البيانات (أولاً)

البند الصحيح الوحيد المربوط بسجل النافذة W09: `fa0f6719-2e79-4499-8117-ebedfa3f64a1`

```sql
UPDATE boq_items 
SET linked_rate_id = NULL, status = 'pending',
    notes = '[تنظيف] فك ربط خاطئ بسجل نافذة عادية W09'
WHERE linked_rate_id = '8db5d710-80a9-4815-8e3b-671cd79577ac'
  AND id != 'fa0f6719-2e79-4499-8117-ebedfa3f64a1';
```

هذا يفك ربط 32 بند خاطئ ويعيدها لـ `pending` مع الإبقاء على W09 الصحيح.

## الخطوة 2: إصلاح `matchingV3.ts` — Path A (سطور 110-135)

إضافة فحص مفهومي وفئوي بعد فحص الأبعاد الحالي:

```typescript
// بعد سطر 127 (thickConflict)، إضافة:
const boqConceptsCheck = detectConcepts(
  description + " " + (descriptionEn || "")
);
const linkedText = (linked.standard_name_ar || "") + " " + (linked.standard_name_en || "");
const linkedConceptsCheck = detectConcepts(linkedText);
const conceptConflict = hasConceptConflict(boqConceptsCheck, linkedConceptsCheck);

// فحص فئوي: باب↔نافذة، صحي↔نافذة، مطبخ↔نافذة، مراوح↔نافذة
const CROSS_CATEGORY_PAIRS: [RegExp, RegExp][] = [
  [/أبواب|باب|door/i, /نافذ|نوافذ|window|شباك/i],
  [/أمني|أمنية|security/i, /نافذ|نوافذ|window/i],
  [/حوض|مرحاض|مغسل|sanitary|lavatory/i, /نافذ|نوافذ|window/i],
  [/خزائن|كاونتر|cabinet|kitchen/i, /نافذ|نوافذ|window/i],
  [/مروح|fan|exhaust/i, /نافذ|نوافذ|window/i],
];
const categoryConflict = CROSS_CATEGORY_PAIRS.some(([patA, patB]) =>
  (patA.test(description) && patB.test(linkedText)) ||
  (patB.test(description) && patA.test(linkedText))
);

if (wxhConflict || thickConflict || conceptConflict || categoryConflict) {
  console.log(`[V3] linked_rate_id ${linkedRateId} conflict detected, re-scoring`);
} else {
  return { item: linked, confidence: 95 };
}
```

## الخطوة 3: تحديث `synonyms.ts` — مفاهيم وأزواج جديدة

إضافة في `SYNONYM_GROUPS`:
```typescript
"باب_أمني": ["باب أمني", "باب امني", "أبواب أمنية", "ابواب امنيه", "security door", "باب مصفح", "STUVE", "CHUB"],
"نافذة_أمنية": ["نافذه أمنيه", "نافذه امنيه", "نوافذ أمنيه", "security window", "شباك أمني"],
"أجهزة_صحية": ["حوض غسيل", "مرحاض", "أجهزه صحيه", "sanitary", "lavatory", "WC"],
"خزائن": ["خزائن مطبخ", "كاونتر", "kitchen cabinet", "خزانه", "دولاب"],
"مراوح_شفط": ["مروحه شفط", "exhaust fan", "مروحه طرد", "سحب دخان"],
```

إضافة في `ANTI_CONFUSION_PAIRS`:
```typescript
["باب_أمني", "نافذة"],
["باب_أمني", "باب_خشب"],
["باب_حديد", "نافذة"],
["نافذة_أمنية", "نافذة"],
["أجهزة_صحية", "نافذة"],
["خزائن", "نافذة"],
["مراوح_شفط", "نافذة"],
```

## الملفات المتأثرة

| الملف | التغيير |
|---|---|
| Database (INSERT tool) | فك ربط 32 بند خاطئ |
| `src/lib/pricing/matchingV3.ts` | فحص مفهومي + فئوي في Path A (سطور 110-135) |
| `src/lib/pricing/synonyms.ts` | 5 مفاهيم + 7 أزواج Anti-Confusion |

## النتيجة المتوقعة
- باب D2 أمني → يتجاهل الربط القديم → يطابق سجل 4,500 ريال
- نوافذ Ws → تطابق سجلاتها الأمنية الصحيحة
- أي ربط خاطئ مستقبلي بين فئات مختلفة يُرفض تلقائياً

