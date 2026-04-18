
## التحليل

قرأت `src/lib/export/approvalExporter.ts` (السطور 319–415 هي قلب المشكلة). أمر العمل دقيق ومُشخَّص صحيحاً. الفجوة 5,056,471 ر.س (42.6%) تعود لأربعة أسباب جذرية مؤكدة في الكود الحالي.

## السبب الجذري الفعلي في الكود

**1. فلتر `status` ضيّق:** الكود يحقن فقط `status='approved'`. بنود MEP/BMS/الحريق غالباً `stale_price` أو `pending` رغم أن لها `unit_rate > 0` ⇒ تُستثنى من الحقن.

**2. ربط الصفوف بـ Jaccard + الكمية:** الدالة الحالية تبحث عن صف الإكسل بمطابقة الكمية + تشابه الوصف (Jaccard). عند تكرار الكميات (25 بنداً بكمية=1) تختار صفاً خاطئاً ⇒ سعر يحقن في موقع خطأ أو لا يحقن.

**3. شيت "تحليل الأسعار" الزائد:** يُضاف شيت ثاني إلى ملف منصة اعتماد ⇒ مرفوض.

**4. لا تحقق على الإجمالي:** لا مقارنة بين إجمالي النظام وإجمالي الملف قبل التسليم.

## الحل — 5 إصلاحات صارمة

### 1. توسيع فلتر الحقن
```ts
// بدلاً من status === 'approved'
const itemsToInject = boqItems.filter(i =>
  i.unit_rate != null && i.unit_rate > 0 &&
  i.quantity > 0 &&
  i.status !== 'descriptive'
);
```

### 2. ربط الصفوف بـ `item_no` فقط (لا Jaccard، لا كمية)
بناء `Map<item_no, rowNumber>` بمسح الملف الأصلي مرة واحدة، ثم البحث المباشر:
```ts
function buildItemRowMap(ws: ExcelJS.Worksheet, itemNoCol: number): Map<string, number> {
  const map = new Map();
  for (let r = 1; r <= ws.rowCount; r++) {
    const v = ws.getRow(r).getCell(itemNoCol).value;
    if (v != null && String(v).trim()) map.set(normalizeItemNo(String(v)), r);
  }
  return map;
}
```
مع `normalizeItemNo` يُزيل المسافات والـ NBSP ويوحّد الأرقام العربية ⇒ صفر تصادم.

### 3. حذف شيت "تحليل الأسعار" نهائياً من ملف اعتماد
الملف المُصدَّر = الملف الأصلي + أسعار محقونة فقط. لا شيت إضافي.

### 4. Validation إجمالي قبل التسليم
```ts
const systemTotal = sum(boq_items.total_price حيث quantity>0)
const exportedTotal = sum(rows where unit_price filled)
if (Math.abs(systemTotal - exportedTotal) / systemTotal > 0.005) throw
```
عتبة 0.5% — أي انحراف أكبر = منع التحميل + رسالة خطأ واضحة.

### 5. تقرير ما بعد التصدير
Toast يعرض: `injected / missing / system_total / exported_total / variance%`. إذا `missing > 0` ⇒ تحذير أصفر بأرقام البنود المفقودة.

## ضمانات الحوكمة (لا تتأثر)

- ✅ التسعير اليدوي (`override_type='manual'`) محقون كما هو
- ✅ `target_rate` من المكتبة لم يُمسّ
- ✅ `boqExcelExport.ts` (التصدير العادي) لم يتغيّر
- ✅ migrations الحوكمة العشرية محفوظة
- ✅ صفر ضرب في `location_factor` عند الحقن

## ملف واحد فقط متأثر

`src/lib/export/approvalExporter.ts` — إعادة كتابة دوال: فلتر الحقن، `getExcelRowForItem` → `buildItemRowMap`، حذف قسم analysis sheet، إضافة `validateExportTotal` + تقرير toast.

## اختبار القبول على ملف "المطبخ والمغسلة عسير"

1. تصدير جديد ⇒ 102 بند الفارغة تحمل أسعاراً
2. إجمالي الملف = 11,864,884 ر.س (±0.5%)
3. شيت واحد فقط
4. console: `[INJECT] injected=N, missing=0`
5. toast أخضر بالأرقام
