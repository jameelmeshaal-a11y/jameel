

# إصلاح تسعير BMS — التشخيص والحل الجذري

## التشخيص النهائي

قاعدة البيانات تُظهر أن آخر تسعير لبند BMS كان:
```
source: "library-high"
notes: "📚 Repriced (single): نظام إدارة المباني (BMS) | 🎯 95%"
total_price: 252,000
```

هذا يعني أن محرك BMS **لم يعمل** — المسار ذهب مباشرة لتسعير المكتبة. السبب المحتمل: الكود القديم (بدون الكلمات المفتاحية الموسّعة) هو الذي نُفّذ عند آخر ضغطة على زر إعادة التسعير.

## المشاكل الثلاث التي يجب حلها

### 1. لا يوجد تسجيل (logging) — لا نعرف ماذا يحدث
المحرك يفشل بصمت بدون أي رسالة في الكونسول.

### 2. محرك BMS لا يُحدّث الكاش مباشرة
`repriceSingleItem` يعتمد على `refetchQueries` بعد الرجوع، لكن لا يستخدم `onItemPriced` callback لتحديث الصف فوراً في واجهة المستخدم.

### 3. لوحة التحليل لا تظهر
`bmsResult` يُحسب عند التحميل الأولي فقط — لا يُعاد حسابه بعد نجاح repriceSingleItem لأن `refetchQueries` لا يُحدّث `bmsResult`.

## التغييرات المطلوبة

### ملف 1: `src/lib/pricingEngine.ts`

**A) إضافة console.log في مسار BMS:**
- طباعة عدد البنود المُسترجعة من الملف
- طباعة نتيجة `calculateBMSCost` (عدد المطابقات، إجمالي النقاط، التكلفة)
- طباعة رسالة واضحة عند النجاح أو الفشل

**B) إضافة error handling للتحديث:**
```typescript
const { error } = await supabase.from("boq_items").update(bmsUpdate).eq("id", itemId);
if (error) console.error("BMS update failed:", error);
```

### ملف 2: `src/components/BoQTable.tsx`

**A) تحديث الكاش فوراً بعد repriceSingleItem:**
بعد `result = await repriceSingleItem(...)`:
- إذا نجح مع source=bms-points-engine، تحديث الصف مباشرة في React Query cache
- تحديث `bmsResult` بعد `refetchQueries` (موجود فعلاً لكن يحتاج تأكيد)

**B) إجبار refetchQueries على الانتظار الكامل:**
```typescript
await qc.refetchQueries({ queryKey: ["boq-items", boqFileId] });
// ثم إعادة حساب BMS
```

## الملفات المتأثرة

| الملف | التغيير |
|---|---|
| `src/lib/pricingEngine.ts` | إضافة console.log + error handling في مسار BMS |
| `src/components/BoQTable.tsx` | تحديث فوري للكاش + إعادة حساب bmsResult بعد التحديث |

## النتيجة
- عند الضغط على ⟲: محرك BMS يعمل ويحسب النقاط ويحفظ السعر الجديد
- الجدول يُحدّث فوراً بالسعر الجديد
- لوحة التحليل تظهر تلقائياً مع التفاصيل
- في حالة فشل BMS: رسالة واضحة في الكونسول تشرح السبب

