

# إصلاح تسعير BMS: حذف السجل + تحديث فوري + طي اللوحة

## التغييرات

### 1. حذف سجل BMS من مكتبة الأسعار (Database Migration)
حذف أي سجل في `rate_library` يحتوي وصفه على كلمات BMS مثل "إدارة المباني" أو "نظام تحكم مركزي". هذا يمنع أي مطابقة خاطئة مستقبلاً.

### 2. تخطي بند BMS في الحلقة الرئيسية (`src/lib/pricingEngine.ts`)
إضافة فحص `isBMSItem()` قبل المطابقة مع المكتبة — إذا كان البند BMS يتم تخطيه مباشرة ويُسعّر فقط في المرحلة النهائية (post-processing) بناءً على النقاط.

### 3. عرض لوحة BMS فقط عند وجود بند BMS فعلي (`src/components/BoQTable.tsx`)
إضافة شرط: لا تظهر اللوحة إلا إذا يوجد بند يحتوي كلمة BMS بكمية > 0.

### 4. جعل لوحة BMS قابلة للطي (`src/components/BMSAnalysisPanel.tsx`)
العنوان والشارة يبقيان ظاهرين — التفاصيل مطوية افتراضياً.

## الملفات المتأثرة

| الملف | التغيير |
|---|---|
| Database migration | حذف سجل BMS من rate_library |
| `src/lib/pricingEngine.ts` | تخطي BMS في الحلقة الرئيسية (3 أسطر) |
| `src/components/BoQTable.tsx` | شرط عرض مشروط + import isBMSItem |
| `src/components/BMSAnalysisPanel.tsx` | Collapsible wrapper |

## ما لا يتأثر
- محرك النقاط BMS — بدون تغيير
- المرحلة النهائية (post-processing) — تبقى كما هي
- مكتبة الأسعار لبقية البنود — بدون تغيير
- التسعير الفردي (repriceItem) — يعمل بشكل صحيح

