

# تنفيذ: نقل شارة "محمي يدوياً" + إصلاح الفلترة

## التغييرات في `src/components/BoQTable.tsx`

### 1. إصلاح الفلترة (سطر 416)
المشكلة: `if (activeFilters.size === 0) return items;` يرجع قبل فحص `statusFilter`.
الحل: تغيير الشرط ليفحص `statusFilter` أيضاً:
```typescript
if (activeFilters.size === 0 && !statusFilter) return items;
```

### 2. حذف شارة "محمي يدوياً" من عمود الوصف (أسطر 940-944)
حذف كامل لهذا الجزء:
```tsx
{item.override_type === "manual" && (
  <Badge variant="outline" className="...">
    <Lock className="w-3 h-3" /> محمي يدوياً
  </Badge>
)}
```

### 3. إضافة حالة "محمي يدوياً" في عمود المطابقة (أسطر 949-962)
إضافة شرط أولي قبل باقي الحالات:
```tsx
<td className="text-center">
  {item.override_type === "manual" ? (
    <Badge variant="outline" className="text-[9px] border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 font-semibold gap-1 px-1.5 py-0.5">
      <Lock className="w-3 h-3" /> محمي يدوياً
    </Badge>
  ) : isPriced && (
    // ... باقي الحالات كما هي (✅🟡🔴🟢)
  )}
</td>
```

### 4. العمود الأول — لا تغيير
القفل 🔒 بجانب رقم البند يبقى كما هو.

## ملف واحد فقط: `src/components/BoQTable.tsx`
لا تغيير في الخوارزميات أو المعادلات.

