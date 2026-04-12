

# تحصين النظام ضد انحراف الأسعار — حماية متعددة الطبقات

## تشخيص السبب الجذري

بعد فحص البيانات، وجدت أن الـ 77 بند المنحرف ليست خطأ في المحرك نفسه — بل هي **بنود تم تسعيرها بأسعار مكتبة قديمة**، ثم تم تحديث أسعار المكتبة لاحقاً دون إعادة تسعير جداول الكميات. أمثلة:
- بند عزل: سعر المكتبة الحالي 150 ريال، السعر المحفوظ 125 ريال
- حنفية حريق: المكتبة 4,025 ريال، المحفوظ 3,500 ريال

المحرك يعمل بشكل صحيح — `priceFromApprovedRate()` يكتب سعر المكتبة بدون أي تعديل. لكن المشكلة أنه لا يوجد **آلية تلقائية لتحديث البنود عند تغيّر أسعار المكتبة**.

## الحل — 4 طبقات حماية

### الطبقة 1: تأكيد فوري بعد الكتابة (Post-Write Assertion)
**ملف**: `src/lib/pricingEngine.ts`

بعد كتابة السعر في قاعدة البيانات (سطر 768)، نضيف فحص فوري:
```typescript
// INTEGRITY GUARD: verify written rate matches library exactly
if (matchedItem && cost.unitRate !== matchedItem.target_rate) {
  console.error(`🛑 RATE MISMATCH: wrote ${cost.unitRate} but library has ${matchedItem.target_rate}`);
  // Force correct to library rate
  const correctedRate = matchedItem.target_rate;
  await supabase.from("boq_items").update({
    unit_rate: correctedRate,
    total_price: +(correctedRate * block.quantity).toFixed(2),
  }).eq("id", block.primaryRow.id);
}
```

### الطبقة 2: فحص سلامة تلقائي بعد التسعير
**ملف**: `src/lib/pricingEngine.ts`

في نهاية `runPricingEngine`، بعد اكتمال كل البنود، نشغّل `runIntegrityCheck` تلقائياً ونعالج أي انحرافات:
```typescript
// Auto-fix any remaining deviations after bulk pricing
const report = await runIntegrityCheck(boqFileId);
if (report.summary.byType.rate_deviation > 0) {
  const deviations = report.issues.filter(i => i.issueType === "rate_deviation");
  await fixIntegrityIssues(deviations, boqFileId);
}
```

### الطبقة 3: كشف البنود القديمة عند تحديث المكتبة
**ملف**: `src/hooks/usePriceLibrary.ts` (أو دالة الحفظ في المكتبة)

عند حفظ سعر جديد في المكتبة، نبحث عن كل البنود المرتبطة بنفس `rate_id` ونضع عليها علامة "بحاجة لتحديث":
```typescript
// After library rate update, flag stale items
await supabase.from("boq_items")
  .update({ status: "stale_price", notes: "⚠️ سعر المكتبة تغيّر — يحتاج إعادة تسعير" })
  .eq("linked_rate_id", rateId)
  .neq("unit_rate", newTargetRate);
```

### الطبقة 4: شريط تنبيه في واجهة جدول الكميات
**ملف**: `src/components/BoQTable.tsx`

إذا وُجدت بنود بحالة `stale_price`، يظهر شريط تحذيري أعلى الجدول:
```
⚠️ يوجد X بند بأسعار قديمة — تم تحديث المكتبة بعد التسعير. [تحديث الأسعار]
```
زر "تحديث الأسعار" يعيد تسعير البنود القديمة فقط دون المساس بالبنود السليمة أو التعديلات اليدوية.

## الملفات المتأثرة

| الملف | التغيير |
|---|---|
| `src/lib/pricingEngine.ts` | طبقة 1 (assertion) + طبقة 2 (auto-check بعد التسعير) |
| `src/hooks/usePriceLibrary.ts` | طبقة 3 (كشف البنود القديمة عند تحديث المكتبة) |
| `src/components/BoQTable.tsx` | طبقة 4 (شريط تنبيه + زر تحديث) |

## ما لا يتأثر
- خوارزمية المطابقة (V3) — بدون أي تغيير
- التعديلات اليدوية — محمية (لن يتم الكتابة فوقها)
- التقارير والتصدير — بدون تغيير
- محرك BMS — بدون تغيير

