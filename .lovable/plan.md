

# إضافة Propagation 2 محصورة بنفس ملف جدول الكميات

## التغيير

### Migration: تحديث `save_manual_price`

إضافة كتلة UPDATE ثانية بعد Propagation 1 (المطابقة بـ `extract_sub_item`) — تستهدف البنود المرتبطة بنفس `linked_rate_id` **داخل نفس الملف فقط**:

```sql
-- Propagation 2: Same library item, same BoQ file only
UPDATE public.boq_items bi
SET
    unit_rate = p_unit_rate,
    total_price = round(p_unit_rate * bi.quantity, 2),
    materials = p_materials, labor = p_labor,
    equipment = p_equipment, logistics = p_logistics,
    risk = p_risk, profit = p_profit,
    status = 'approved',
    override_type = 'manual',
    source = 'manual',
    confidence = 100,
    override_at = now(),
    override_by = p_user_id,
    override_reason = 'موروث من تسعير يدوي — مرتبط بنفس بند المكتبة',
    notes = concat_ws(' | ', bi.notes, '🔒 محمي يدوياً — موروث من بند ' || coalesce(v_item.item_no, p_item_id::text))
WHERE bi.linked_rate_id = v_library_id
  AND bi.id <> p_item_id
  AND bi.boq_file_id = v_item.boq_file_id
  AND (bi.override_type IS NULL OR bi.override_type != 'manual');
```

يُضاف مباشرة بعد `GET DIAGNOSTICS v_linked_count = ROW_COUNT;` الحالي، مع تحديث العدّاد:

```sql
GET DIAGNOSTICS v_linked_count = ROW_COUNT;

-- Propagation 2 here...

v_linked_count := v_linked_count + v_linked_count_2;
```

### ملف واحد: Migration SQL فقط

| العنصر | التفصيل |
|---|---|
| النطاق | نفس `boq_file_id` فقط — لا يمتد لمشاريع أخرى |
| الشرط | `linked_rate_id` متطابق + نفس الملف + ليس محمياً مسبقاً |
| النتيجة | Ws04/05/06 ستحصل على `override_type = 'manual'` + `confidence = 100` + شارة 🔒 |

