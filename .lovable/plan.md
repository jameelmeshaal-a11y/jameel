

# إصلاح: البند المضاف يدوياً لا يُكتشف عند إعادة التسعير

## التشخيص
عند إضافة بند جديد من نموذج "إضافة سعر"، يُحفظ بـ **keywords فارغة** و**aliases فارغة**. محرك المطابقة V3 يعتمد بشكل كبير على الـ keywords والنص المُرمَّز (tokenized) للمقارنة. بدون keywords، يحصل البند الجديد على درجة منخفضة ولا يتجاوز حد الـ 50 نقطة المطلوب.

## الحل

### 1. توليد keywords تلقائياً عند الإضافة
**`src/hooks/usePriceLibrary.ts`** — تعديل `useAddPriceItem`:
- إضافة دالة `generateKeywords(name: string)` تقوم بـ tokenize الاسم العربي وتنظيفه (إزالة حروف الجر والتشكيل) لتوليد keywords تلقائياً.
- تمرير الـ keywords المولَّدة مع الـ insert.

### 2. تعبئة item_name_aliases تلقائياً
- حفظ الاسم العربي الكامل كأول alias في `item_name_aliases` حتى يكون قابلاً للبحث بالتطابق النصي الكامل.

### 3. تحديث البنود الحالية الفارغة (migration)
- تشغيل migration يملأ keywords للبنود التي لديها `keywords = '{}'` عبر tokenize الاسم العربي مباشرة في SQL.

## الملفات المتأثرة
| الملف | التغيير |
|---|---|
| `src/hooks/usePriceLibrary.ts` | إضافة `generateKeywords` + استخدامها في `useAddPriceItem` |
| Migration SQL | ملء keywords الفارغة للبنود الحالية |

