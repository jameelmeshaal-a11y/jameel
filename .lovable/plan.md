

## الخطة — 3 إصلاحات

### 1) إعادة زر «إعادة التسعير الشاملة» للشريط العلوي (`BoQTable.tsx`)
- إزالة `AlertDialog` مع `RotateCcw` من داخل كل صف (السطور ~807-828).
- إعادة زر إعادة التسعير الشاملة إلى الشريط العلوي بجوار أزرار التسعير (بعد زر "تسعير غير المسعّرة").
- زر `RefreshCw` لكل بند (السطور ~864-907) يبقى كما هو — لا تغيير.

### 2) إزالة `BudgetDistributionPanel` من صفحة BoQ (`BoQTable.tsx`)
- حذف `<BudgetDistributionPanel projectId={projectId} />` (السطر ~491).
- حذف الـ import (السطر ~20).

### 3) إصلاح تصدير الاعتماد (fallback) (`etemadExporter.ts`)

**المشكلة**: `discoverColumnsViaJSZip` يبحث فقط في `sheet1.xml` والـ regex للخلايا يفترض ترتيب ثابت للـ attributes (`r` قبل `t`) ويتطلب closing tag `</c>` — فيتجاهل الخلايا ذات الترتيب المختلف أو self-closing.

**الحل**:
- البحث في جميع أوراق العمل (sheets) وليس فقط `sheet1.xml`.
- تحسين regex الخلايا ليقبل أي ترتيب attributes وself-closing cells.
- إضافة header markers إضافية: `"الوحدة"` كـ item marker لتوسيع التعرف.
- عند استخدام JSZip fallback، حقن القيم في الورقة الصحيحة (التي تحتوي على الـ header).

### الملفات المعدّلة
| الملف | التغيير |
|---|---|
| `src/components/BoQTable.tsx` | إرجاع زر إعادة التسعير للشريط العلوي + حذف BudgetDistributionPanel |
| `src/lib/export/etemadExporter.ts` | إصلاح fallback: بحث multi-sheet + regex مرن |

### ضمانات
- لا تغيير على أي منطق تسعير أو حسابات.
- زر `RefreshCw` لكل بند يبقى كما هو.

