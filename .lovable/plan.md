

## الخطة v4.0 — Production-Stable Export Engine

### 1) `etemadExporter.ts` — 4 طبقات + 4 stabilizers

#### الطبقة 1: `readSheetStructure(zip)` + sharedStrings flattening قوي
```
parseSharedStrings(xml):
  for each <si>:
    flatten = جمع نصوص كل <t>...</t> داخل <si> (تجاهل <rPr> و <r> wrappers)
    push flatten إلى array
```
- يدعم rich text, multiple `<t>` segments, nested formatting بأمان
- لا يعتمد على بنية معقدة، فقط على `<t>` extraction

#### الطبقة 2: `detectHeaderMap` — Cursor parser + Fallback
- **المسار الأساسي**: cursor-based scanner (`<row>` → `<c>` → resolve)
- **Fallback**: عند فشل cursor parser، `minimalRowScan(xml)` يستخدم regex بسيط على `<row r="N">` فقط (دون parsing للخلايا) لإيجاد header row تقريباً
- يضمن: لا انهيار كامل عند ملفات غريبة

#### الطبقة 3: `buildRowIndexMap` — Priority-based (ليس strict)
```
priority order:
  1. item_no exact match → استخدم مباشرة (ثقة عالية)
  2. row_index fallback (structural primary) → افتراضي قوي
  3. description similarity ≥0.7 → last resort فقط
```
- **ليس validation strict**: إذا item_no تطابق، لا نتحقق من qty/description
- يمنع false negatives من تغيرات qty المعاد حسابها

#### الطبقة 4: `injectCellValue` — Safe minimal (لا clone)
- إذا الخلية موجودة:
  - حافظ على `r`, `s`, attributes الأصلية
  - احذف `<f>` فقط
  - استبدل/أضف `<v>` بالقيمة الجديدة
  - حول `t="s"` → `t="n"` للأرقام
- **إذا الخلية غير موجودة** (لا clone template):
  ```xml
  <c r="REF" t="n"><v>VALUE</v></c>
  ```
  - styles افتراضي (0)
  - آمن 100%، لا corruption، لا Excel repair
  - أدرج في الصف بترتيب `r` صحيح

#### المسار النهائي
```
download → JSZip.load → 
readSheetStructure (with safe sharedStrings flatten) →
try { cursor detectHeaderMap } catch { minimalRowScan fallback } →
buildRowIndexMap (priority: item_no → row_index → desc) →
forEach(item) injectCellValue (safe minimal, no clone) →
zip.generate → download
```

**حذف ExcelJS كلياً** من الـ imports والمسار.

---

### 2) `BoQTable.tsx` — UI controllers + compute guards

**BMSAnalysisPanel** — Lazy mount + compute guard:
- State: `bmsView: 'hidden' | 'collapsed' | 'expanded'` افتراضياً `'hidden'`
- **داخل `useEffect`**: 
  ```typescript
  useEffect(() => {
    if (bmsView === 'hidden') return; // compute guard
    // ...calculate BMS
  }, [bmsView, items]);
  ```
- Mount الـ component فقط عند `bmsView !== 'hidden'`
- زر toggle في الـ header

**Export readiness summary** (سطر 624-665):
- لف بـ `Collapsible` افتراضياً مطوي

**PricingIntegrityReport** — Event-driven:
- إزالة `setIntegrityReportOpen(true)` التلقائي (سطر 124-126, 207-209)
- يفتح فقط من زر «🛡️ فحص السلامة»

**حماية notes.match()** (سطر 73-75):
```typescript
const match = String(update?.notes ?? "").match(/[""]([^""]+)[""]/);
if (match?.[1]) setCurrentItemName(match[1].slice(0, 50));
```

---

### الملفات المعدّلة

| الملف | التغيير |
|---|---|
| `src/lib/export/etemadExporter.ts` | إعادة كتابة كاملة: JSZip-only + cursor parser + minimal-scan fallback + safe sharedStrings flatten + priority mapping + safe minimal cell injection (no clone) |
| `src/components/BoQTable.tsx` | (أ) safe match (ب) BMS lazy + compute guard (ج) Collapsible للـ readiness (د) إزالة auto-open للـ Integrity |

### ضمانات Production
- ✅ صفر تغيير على `pricingEngine.ts`، `matchingV3.ts`، RPCs، schema
- ✅ كل وظائف BMS/Integrity محفوظة قابلة للاستدعاء
- ✅ Fallback parser → لا انهيار صامت
- ✅ Safe minimal cell → لا Excel repair، لا corrupted styles
- ✅ Priority mapping → لا false negatives
- ✅ sharedStrings flattening آمن مع rich text
- ✅ BMS compute guard → صفر حسابات خلفية مخفية

