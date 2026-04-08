

# منع اعتماد بنود مكتبة الأسعار بسعر صفر

## الملخص

إضافة حماية تمنع اعتماد أي بند في مكتبة الأسعار إذا كان `base_rate = 0` أو `target_rate = 0`، في كل من الاعتماد الفردي والاعتماد الجماعي.

## التغييرات

### 1. `src/hooks/usePriceLibrary.ts` — حماية الاعتماد الفردي

في `useApprovePriceItem()` (سطر 72-86): قبل تنفيذ التحديث، جلب البند والتحقق من أن `base_rate > 0`. إذا كان صفراً، رمي خطأ بدلاً من الاعتماد.

### 2. `src/hooks/usePriceLibrary.ts` — حماية الاعتماد الجماعي

في `useBulkApprovePending()` (سطر 226-245): إضافة شرط `base_rate.gt.0` في الاستعلام حتى لا يتم اعتماد البنود ذات السعر الصفري. إرجاع عدد البنود المتخطاة للمستخدم.

### 3. `src/pages/RateLibraryPage.tsx` — تنبيه المستخدم

- عند الاعتماد الفردي لبند بسعر صفر: عرض رسالة خطأ "لا يمكن اعتماد بند بسعر صفر"
- عند الاعتماد الجماعي: عرض عدد البنود المتخطاة بسبب السعر الصفري
- إضافة تحذير مرئي على البنود ذات السعر الصفري في الجدول

## التفاصيل التقنية

**الاعتماد الفردي:**
```typescript
// useApprovePriceItem - fetch item first, check rate
const { data: item } = await supabase.from("rate_library").select("base_rate").eq("id", id).single();
if (!item || item.base_rate <= 0) throw new Error("ZERO_RATE");
```

**الاعتماد الجماعي:**
```typescript
// useBulkApprovePending - add filter to exclude zero-rate items
.is("approved_at", null)
.gt("base_rate", 0)  // ← new filter
```

## الملفات المتأثرة

| الملف | التغيير |
|---|---|
| `src/hooks/usePriceLibrary.ts` | إضافة فحص السعر في الاعتماد الفردي والجماعي |
| `src/pages/RateLibraryPage.tsx` | عرض رسائل خطأ/تحذير للمستخدم |

## ما لن يتغير
- منطق التسعير — بدون تعديل
- منطق الاستيراد — بدون تعديل
- جداول قاعدة البيانات — بدون تعديل

