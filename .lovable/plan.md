

# تنفيذ حوكمة المطابقة — 3 محاور

## محور 2 (أولاً): حماية التعديل اليدوي

### `src/lib/pricingEngine.ts` — سطور 929-966
- تعديل `resetBoQPricing` لإضافة `override_type` في الـ SELECT (سطر 932)
- تقسيم البنود إلى `manualIds` و `normalIds`
- تنفيذ UPDATE كامل فقط على `normalIds` بدفعات 100
- البنود اليدوية لا تُمس
- تغيير نوع الإرجاع إلى `Promise<{ reset: number; protected: number }>`

### `src/components/BoQTable.tsx` — سطر 160-161
- تحديث استقبال النتيجة: `const { reset: resetCount, protected: protectedCount } = await resetBoQPricing(boqFileId);`
- تحديث الـ console.log ليعرض العددين
- إضافة toast بعد إعادة التسعير (سطر ~198) يعرض: `"تم إعادة تعيين X بند، وتم الحفاظ على Y تعديل يدوي ✅"`

---

## محور 1: اختبارات Regression

### `src/lib/pricing/matchingV3.test.ts` — إضافة بعد سطر 651
قسم `Cross-Category Conflict Gate` مع 8 اختبارات تستخدم `detectConcepts` و `hasConceptConflict` المُصدّرتين من `synonyms.ts`:
- باب أمني ↔ نافذة → conflict
- خزائن ↔ نافذة → conflict  
- صحي ↔ نافذة → conflict
- مراوح ↔ نافذة → conflict
- نافذة أمنية ↔ نافذة عادية → conflict
- باب أمني ↔ باب خشب → conflict
- نافذة ↔ نافذة (نفس الفئة) → no conflict
- `findRateLibraryMatchV3` مع linkedRateId خاطئ → يتجاهل الربط

---

## محور 3: تنبيهات التعارض مع append للـ notes

### `src/lib/pricing/matchingV3.ts` — سطر 108 + 150-154
- تغيير نوع الإرجاع إلى `{ item: RateLibraryItem; confidence: number; conflictNotes?: string }`
- عند اكتشاف تعارض (سطر 150-152)، بناء `conflictNotes` بنوع التعارض
- تمرير `conflictNotes` في كل `return` لاحق بالدالة

### `src/lib/pricingEngine.ts` — سطر 763
- تعديل بناء `notes` ليأخذ بعين الاعتبار:
  1. `existingNotes` من البند الأصلي (من `block.primaryRow`)
  2. `conflictNotes` من نتيجة المطابقة
  3. `cost.explanation` من محرك التسعير
- الصيغة: append الثلاثة معاً بدل الكتابة فوق القديم

### ملاحظة على نوع الإرجاع في wrapper
- `findRateLibraryMatch` في `pricingEngine.ts` (سطر 117) يستخدم نفس نوع الإرجاع — يجب تحديثه أيضاً ليمرر `conflictNotes`

---

## الملفات المتأثرة

| الملف | التغيير |
|---|---|
| `src/lib/pricingEngine.ts` | حماية reset + append notes + تحديث wrapper type |
| `src/components/BoQTable.tsx` | toast بالتفصيل |
| `src/lib/pricing/matchingV3.test.ts` | 8 اختبارات regression |
| `src/lib/pricing/matchingV3.ts` | `conflictNotes` في الإرجاع |

