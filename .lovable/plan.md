

# تحديث محرك التسعير: عرض تتابعي في الوقت الحقيقي

## الوضع الحالي
المحرك يعالج البنود تتابعياً بالفعل (loop واحد)، لكن واجهة الجدول لا تتحدث إلا بعد انتهاء **جميع** البنود — لأن `refetchQueries` يُستدعى فقط في النهاية.

## التغيير المطلوب
إضافة callback ثانٍ `onItemPriced` يُرسل بيانات كل بند فور تسعيره → الواجهة تحدّث الصف مباشرة في الجدول + الإجمالي التراكمي.

---

## الملفات والتغييرات

### 1. `src/lib/pricingEngine.ts`
- إضافة parameter جديد `onItemPriced` لـ `runPricingEngine` و `repriceUnpricedItems`
- بعد كل `supabase.update` ناجح لبند، استدعاء `onItemPriced(itemId, pricingData)`
- نفس المنطق لـ descriptive/unmatched rows (ترسل status فقط بدون سعر)
- **لا تغيير** في خوارزميات التسعير أو المطابقة أو السياسات

### 2. `src/components/BoQTable.tsx`
- في `handlePricing` / `handleRePrice` / `handleRepriceUnpriced`: تمرير callback `onItemPriced`
- الـ callback يستخدم `qc.setQueryData` لتحديث الصف المحدد في cache مباشرة (بدون refetch)
- إضافة state `runningTotal` يتراكم مع كل بند مسعّر ويظهر فوراً بجانب شريط التقدم
- عرض اسم البند الحالي قيد التسعير في شريط التقدم

### 3. لا تغيير في:
- خوارزميات المطابقة (`matchingV3`, `similarItemMatcher`)
- سياسات التسعير (`priceFromApprovedRate`, `sourceResolver`)
- حساب الإجماليات النهائي (`recalculate_project_total`)
- RLS أو قاعدة البيانات

---

## التفاصيل التقنية

```text
runPricingEngine(boqFileId, cities, onProgress, projectType, onItemPriced?)
                                                               ↑ NEW
onItemPriced = (itemId: string, update: {
  unit_rate, total_price, status, confidence, source, notes, ...
}) => void

BoQTable callback:
  qc.setQueryData(["boq-items", boqFileId], (old) =>
    old.map(item => item.id === itemId ? { ...item, ...update } : item)
  )
  setRunningTotal(prev => prev + (update.total_price || 0))
```

هذا يضمن:
- كل بند يظهر سعره فور معالجته
- الإجمالي يتزايد تدريجياً
- لا تأثير على أي منطق حسابي أو سياسة موجودة

