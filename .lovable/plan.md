

# تنفيذ: تصفير كامل عند إعادة التسعير + نظام فلترة متقدم

## 1. تعديل منطق إعادة التسعير (Clean State)

### المشكلة الحالية
`handleRePrice` في `BoQTable.tsx` يستدعي `runPricingEngine` مباشرة بدون تصفير البيانات أولاً. المحرك يتخطى البنود ذات `manual_overrides` ويعتمد على `linked_rate_id` القديم — أي أن إعادة التسعير ليست نظيفة 100%.

### الحل
**ملف: `src/lib/pricingEngine.ts`** — إضافة دالة `resetBoQPricing(boqFileId)`:
- تصفير جميع الحقول السعرية لكل البنود: `unit_rate`, `total_price`, `materials`, `labor`, `equipment`, `logistics`, `risk`, `profit`, `confidence`, `source`, `linked_rate_id`, `location_factor`, `notes`
- تعيين `status = 'pending'` لجميع البنود القابلة للتسعير
- إزالة `override_type`, `override_reason`, `override_by`, `override_at` (لكن **حفظ** `manual_overrides` إذا أراد المستخدم الحفاظ عليها — أو تصفيرها أيضاً حسب المطلوب)
- عملية واحدة `UPDATE` على كل البنود في الـ BoQ

**ملف: `src/components/BoQTable.tsx`** — تعديل `handleRePrice`:
1. استدعاء `resetBoQPricing(boqFileId)` أولاً
2. مسح cache الـ query client: `qc.removeQueries(["boq-items", boqFileId])`
3. ثم استدعاء `runPricingEngine` كالمعتاد
4. تحديث dialog التأكيد ليوضح أن التصفير شامل

## 2. نظام الفلترة المتقدم

### التصميم
إضافة شريط فلاتر بين شريط الأدوات والجدول — فلترة على مستوى العرض فقط (UI-level) بدون تعديل أي بيانات.

**ملف: `src/components/BoQTable.tsx`**:

#### States جديدة:
```typescript
const [filters, setFilters] = useState<Set<string>>(new Set());
```

#### الفلاتر المتاحة (أزرار toggle):
| الفلتر | المنطق |
|---|---|
| الأعلى سعر وحدة | Top 20 items by `unit_rate` (DESC) |
| الأعلى إجمالي | Top 20 items by `total_price` (DESC) |
| موثوقية منخفضة | `confidence < 70` |
| غير معتمد | `status !== "approved"` AND priceable |
| غير مسعّر | `unit_rate` is null or 0 |

#### المنطق:
- الفلاتر تعمل كـ **intersection** (AND) — تطبيق أكثر من فلتر يضيّق النتائج
- `useMemo` لحساب `filteredItems` من `items` بناءً على الفلاتر النشطة
- الجدول يعرض `filteredItems` بدلاً من `items`
- عدّاد يوضح "عرض X من Y بند"
- زر "مسح الفلاتر" لإعادة العرض الكامل
- **لا يؤثر على**: الإجماليات، التصدير، التسعير — كلها تستخدم `items` الأصلي

#### واجهة الفلاتر:
شريط أفقي من أزرار `Toggle` صغيرة بألوان مختلفة، يظهر تحت شريط الأدوات مباشرة.

## الملفات المتأثرة

| الملف | التغيير |
|---|---|
| `src/lib/pricingEngine.ts` | إضافة `resetBoQPricing()` + تصديرها |
| `src/components/BoQTable.tsx` | تعديل `handleRePrice` + إضافة شريط الفلاتر + `filteredItems` |

## ما لن يتأثر
- محرك التسعير الأساسي — لا تعديل على منطق المطابقة أو الحساب
- نظام الاعتمادات والـ overrides — لا تغيير
- التقارير والتصدير — تبقى تعمل على البيانات الكاملة
- فحص السلامة — يبقى كما هو
- مكتبة الأسعار — بدون تعديل
- لا migrations أو تغييرات في قاعدة البيانات

