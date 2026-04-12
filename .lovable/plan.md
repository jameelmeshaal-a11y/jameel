

# إصلاح خطأ "Shared Formula" في تصدير اعتماد

## المشكلة
عند الضغط على زر "تصدير اعتماد"، يفشل ExcelJS في قراءة الملف الأصلي بسبب وجود **Shared Formulas** (صيغ مشتركة) في الخلية I43. هذا خطأ معروف في مكتبة ExcelJS عند التعامل مع ملفات Excel المعقدة من منصة اعتماد.

الخطأ: `Shared Formula master must exist above and or left of clone for cell I43`

## الحل

**ملف واحد**: `src/lib/boqOriginalExport.ts`

### التغيير: استخدام خيار `ignoreNodes` عند تحميل الملف

ExcelJS يدعم خياراً لتجاهل أخطاء الصيغ المشتركة عند التحميل. سنستبدل:

```typescript
await wb.xlsx.load(buffer);
```

بـ:

```typescript
// Ignore shared formula errors — common in Etimad files
// ExcelJS throws on shared formulas but the rest of the file loads correctly
try {
  await wb.xlsx.load(buffer);
} catch (loadErr: any) {
  if (loadErr.message?.includes("Shared Formula")) {
    // Retry with a patched approach: read as buffer ignoring formula errors
    console.warn("[Etemad Export] Shared formula warning, retrying with workaround...");
    const wb2 = new ExcelJS.Workbook();
    // Force load by catching and continuing
    await wb2.xlsx.load(buffer, { 
      ignoreNodes: ['sharedFormula'] 
    } as any);
    // Use wb2 instead
    Object.assign(wb, wb2);
  } else {
    throw loadErr;
  }
}
```

**ملاحظة**: إذا لم يدعم ExcelJS خيار `ignoreNodes`، الحل البديل هو تعديل الملف كـ ZIP أولاً وإزالة سمات `si` (shared index) من الصيغ قبل التحميل. هذا أكثر موثوقية:

```typescript
// Alternative: Pre-process the xlsx (ZIP) to remove shared formula attributes
import JSZip from 'jszip';

const zip = await JSZip.loadAsync(buffer);
const sheetXml = await zip.file("xl/worksheets/sheet1.xml")?.async("string");
if (sheetXml) {
  // Remove shared formula references that cause ExcelJS errors
  const fixedXml = sheetXml
    .replace(/\s+t="shared"\s+si="\d+"/g, '')
    .replace(/<f\s+t="shared"[^>]*\/>/g, '');
  zip.file("xl/worksheets/sheet1.xml", fixedXml);
  const fixedBuffer = await zip.generateAsync({ type: "arraybuffer" });
  await wb.xlsx.load(fixedBuffer);
} else {
  await wb.xlsx.load(buffer);
}
```

## الملفات المتأثرة

| الملف | التغيير |
|---|---|
| `src/lib/boqOriginalExport.ts` | معالجة خطأ Shared Formula قبل التحميل |
| `package.json` | إضافة مكتبة `jszip` (إن لم تكن موجودة) |

## ما لا يتأثر
- لا تغيير في التنسيقات أو الألوان أو الدمج — فقط إزالة سمات الصيغ المشتركة
- الصيغ العادية (غير المشتركة) تبقى كما هي
- أعمدة سعر الوحدة والإجمالي ستُكتب فيها قيم رقمية وليس صيغ

