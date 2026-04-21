

## الهدف
حذف كامل لمكتبة الأسعار + توسيع حد العرض/الرفع إلى 50,000+ بند، **بدون أي مساس** بإعدادات التسعير أو إعدادات تصدير اعتماد أو منطق المطابقة.

## ضمانات عدم التأثير
لن يُلمس أي من الملفات التالية إطلاقاً:
- `src/lib/pricing/matchingV3.ts`
- `src/lib/pricing/*` (كل محرك التسعير)
- `src/lib/pricingEngine.ts`
- `src/lib/export/approvalExporter.ts`
- `supabase/functions/match-price-item/`
- أي trigger أو RPC متعلق بالتسعير (`save_manual_price`, `force_resync_rate`, `guard_manual_override`...)
- إعدادات `boq_files`, `boq_items`, `projects` تبقى كما هي

العمل محصور حرفياً في 3 ملفات فقط + عملية بيانات واحدة.

---

## 1) حذف مكتبة الأسعار حذفاً حقيقياً (عملية بيانات فقط، بدون migration)

تنفيذ بالترتيب التالي عبر insert tool:

```sql
-- أ. فك ربط بنود BoQ من المكتبة (بدون تغيير أسعار يدوية أو schema)
UPDATE boq_items SET linked_rate_id = NULL WHERE linked_rate_id IS NOT NULL;

-- ب. حذف السجلات التابعة
DELETE FROM rate_sources;
DELETE FROM price_change_log WHERE rate_library_id IS NOT NULL;
DELETE FROM pricing_audit_log WHERE rate_library_id IS NOT NULL;

-- ج. حذف المكتبة بالكامل
DELETE FROM rate_library;
```

**ملاحظة مهمة**: لن تُمس أعمدة `unit_rate`, `total_price`, `materials`, `labor`... في `boq_items`. الأسعار الحالية في المشاريع تبقى كما هي. فقط الرابط `linked_rate_id` يُصفّر — هذا لا يكسر أي شيء، بل يمنع orphan references.

التحقق بعدها: `SELECT COUNT(*) FROM rate_library` = 0.

---

## 2) دعم العرض والرفع لأكثر من 50,000 بند

### `src/hooks/usePriceLibrary.ts` — Pagination داخلي شفاف

استبدال الجلب الأحادي المحدود (1000) بحلقة دفعات تتجاوز سقف Supabase REST:

```ts
const PAGE_SIZE = 1000;
const MAX_ITEMS = 60000; // safety cap
const all: any[] = [];
let from = 0;
while (from < MAX_ITEMS) {
  let q = supabase.from("rate_library").select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (category !== "all") q = q.eq("category", category);
  if (search) q = q.or(`standard_name_ar.ilike.%${search}%,standard_name_en.ilike.%${search}%,item_code.ilike.%${search}%`);
  const { data, error } = await q;
  if (error) throw error;
  if (!data || data.length === 0) break;
  all.push(...data);
  if (data.length < PAGE_SIZE) break;
  from += PAGE_SIZE;
}
return all;
```

نفس signature، لا تأثير على أي مستهلك آخر.

### `src/pages/RateLibraryPage.tsx` — العداد الحقيقي

العداد العلوي يعتمد على `count: exact` من query منفصل (HEAD request)، لا على `data.length`. يعرض العدد الفعلي حتى لو 50,000+.

### `src/components/PriceLibraryImportDialog.tsx` — رفع قابل للتوسع

- إزالة الاعتماد على `usePriceLibrary()` الذي يحمّل المكتبة كاملة في الذاكرة
- المطابقة (جديد/تحديث) تتم على دفعات server-side عبر استعلامات `in()` لمجموعات `item_code` و `standard_name_ar` فقط
- الرفع `bulkUpsert` يتم على chunks من 500 صف
- المعاينة (جديد/تحديث/بدون تغيير) تبقى كما هي بصرياً

---

## الملفات المتأثرة (3 فقط)
| ملف | التغيير |
|---|---|
| `src/hooks/usePriceLibrary.ts` | Pagination داخلي |
| `src/pages/RateLibraryPage.tsx` | عداد server-side count |
| `src/components/PriceLibraryImportDialog.tsx` | مطابقة ورفع بدفعات |

**صفر migrations. صفر تعديل في schema. صفر مساس بمحرك التسعير أو exporter.**

---

## التحقق بعد التنفيذ
1. `SELECT COUNT(*) FROM rate_library` = 0 ✓
2. `SELECT COUNT(*) FROM boq_items WHERE linked_rate_id IS NOT NULL` = 0 ✓
3. أرفع ملف 2,800 بند → العداد يعرض 2,800 ✓
4. صفحة المكتبة تعرض كل البنود بدون قطع عند 1,000 ✓
5. ملفات `approvalExporter.ts` و `matchingV3.ts` و `pricingEngine.ts` لم تتغير (git diff فارغ) ✓

