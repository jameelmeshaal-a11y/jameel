

# إصلاح جذري دائم — قاعدة "النوع الأول في النص يفوز"

## المشكلة بالضبط

السطر 608 في `matchingV3.ts`:
```typescript
const candStructType = STRUCTURAL_TYPES.find(([, rx]) => rx.test(candStructText));
```

لسجل مكتبة اسمه **"حفر وخنادق للأساسات والكمرات"**:
- `.find()` يختبر كل regex **بترتيب المصفوفة** (ليس بترتيب ظهوره في النص)
- `beam` (كمرات) يظهر في المصفوفة **قبل** `excavation` (حفر)
- النتيجة: السجل يُصنّف كـ "beam" بدل "excavation"
- البوابة ترى: beam = beam → يمرّ → سعر 42 ريال بدل 1,350

## الحل — قاعدة دائمة لا تعتمد على ترتيب المصفوفة

**القاعدة**: عندما يطابق نص واحد أكثر من نوع إنشائي، **النوع الذي يظهر أولاً في النص** هو النوع الصحيح.

هذه قاعدة لغوية ثابتة: الكلمة الأولى في اسم أي بند هي التي تحدد هويته.

### التغيير في `src/lib/pricing/matchingV3.ts`

استبدال `.find()` بدالة `detectStructuralType()` جديدة:

```typescript
function detectStructuralType(text: string): [string, RegExp] | undefined {
  // Find ALL matching types with their position in the text
  const matches: { entry: [string, RegExp]; pos: number }[] = [];
  for (const entry of STRUCTURAL_TYPES) {
    const m = text.match(entry[1]);
    if (m && m.index !== undefined) {
      matches.push({ entry, pos: m.index });
    }
  }
  if (matches.length === 0) return undefined;
  // Return the type that appears EARLIEST in the text
  matches.sort((a, b) => a.pos - b.pos);
  return matches[0].entry;
}
```

تطبيقها في مكانين:
- سطر 608: `const boqStructType = detectStructuralType(boqStructText);`
- سطر 610: `const candStructType = detectStructuralType(candStructText);`

### إصلاح البند في قاعدة البيانات

تحديث البند `6318167b`:
- `linked_rate_id` → `1e9c15b8` (الكمرات - 1,350 ريال)
- `unit_rate` → 1,350
- `total_price` → 610 × 1,350 = 823,500
- `status` → `approved`, `confidence` → 99

### اختبار تراجعي في `matchingV3.test.ts`

اختبار يؤكد أن "حفر وخنادق للأساسات والكمرات" تُصنّف كـ `excavation` وليس `beam`.

## لماذا هذا الحل دائم ولا يتكرر الخطأ

- لا يعتمد على ترتيب المصفوفة — يعتمد على **موقع الكلمة في النص**
- ينطبق تلقائياً على أي بند مستقبلي يحتوي على أكثر من نوع إنشائي
- مثال: "بلاطات سقف للكمرات" → `slab` (بلاطات في الموقع 0) وليس `beam`
- مثال: "حفر لأساسات الأعمدة" → `excavation` (حفر في الموقع 0) وليس `column`

## الملفات المتأثرة

| الملف | التغيير |
|---|---|
| `src/lib/pricing/matchingV3.ts` | دالة `detectStructuralType` بدل `.find()` |
| `src/lib/pricing/matchingV3.test.ts` | اختبار تراجعي |
| قاعدة البيانات | إصلاح البند `6318167b` |

