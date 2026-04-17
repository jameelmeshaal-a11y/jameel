

المستخدم يوضح أن المنطق بسيط: **كل صف فيه `quantity > 0` يجب أن يحقن فيه سعر الوحدة والإجمالي في خلايا الصف نفسه**. الصورة تُظهر صف `02025002` بكمية 75.00 ووحدة م3، ويجب أن يحقن السعر في نفس هذا الصف.

سأفحص الملف المرفق والكود الحالي لفهم سبب فشل الحقن.
<lov-tool-use id="toolu_vrtx_01Fb4wTmffKkRHLuk5i2bAmb" name="code--exec" integration-id="code" data="{\"command\": \"lov-copy user-uploads://برج_المراقبة_عسير-2.xlsx /tmp/burj.xlsx && cd /tmp && python3 -c \\\"\\nimport zipfile, re\\nz = zipfile.ZipFile('/tmp/burj.xlsx')\\nss = z.read('xl/sharedStrings.xml').decode('utf-8')\\nsheet = z.read('xl/worksheets/sheet1.xml').decode('utf-8')\\n# extract sharedStrings\\nstrs = re.findall(r'<si[^>]*>(.*?)</si>', ss, re.DOTALL)\\ndef flat(s):\\n    return ''.join(re.findall(r'<t[^>]*>([^<]*)</t>', s))\\nflats = [flat(s) for s in strs]\\n# find rows containing 02025002\\nfor i, s in enumerate(flats):\\n    if '02025002' in s or 'حفر وخنادق' in s:\\n        print(i, repr(s[:80]))\\n\\\"\\n\", \"user_facing_description\": \"فحص الملف المرفق\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01UVUxBF8kWHAReLtTQDRJ4g" name="code--exec" integration-id="code" data="{\"command\": \"lov-copy user-uploads://برج_المراقبة_عسير-2.xlsx /tmp/burj.xlsx && python3 << 'EOF'\\nimport zipfile, re\\nz = zipfile.ZipFile('/tmp/burj.xlsx')\\nss = z.read('xl/sharedStrings.xml').decode('utf-8')\\nsheet = z.read('xl/worksheets/sheet1.xml').decode('utf-8')\\nstrs = re.findall(r'<si[^>]*>(.*?)</si>', ss, re.DOTALL)\\ndef flat(s): return ''.join(re.findall(r'<t[^>]*>([^<]*)</t>', s))\\nflats = [flat(s) for s in strs]\\n# find idx for \\\"02025002\\\" and \\\"حفر وخنادق\\\"\\ntarget_idx = []\\nfor i, s in enumerate(flats):\\n    if '02025002' == s.strip() or 'حفر وخنادق للأساسات' in s:\\n        target_idx.append((i, s[:60]))\\nprint('target sharedString idx:', target_idx)\\n\\n# Now find row in sheet containing these string refs\\nrows = re.findall(r'<row[^>]*r=\\\"(\\\\d+)\\\"[^>]*>(.*?)</row>', sheet, re.DOTALL)\\nprint('total rows:', len(rows))\\nfor rn, body in rows:\\n    cells = re.findall(r'<c\\\\s+r=\\\"([A-Z]+\\\\d+)\\\"([^>]*)>(.*?)</c>', body, re.DOTALL)\\n    has_target = False\\n    for ref, attrs, inner in cells:\\n        if 't=\\\"s\\\"' in attrs:\\n            v = re.search(r'<v>(\\\\d+)</v>', inner)\\n            if v and int(v.group(1)) in [t[0] for t in target_idx]:\\n                has_target = True\\n    if has_target:\\n        print(f'\\\\n=== Row {rn} ===')\\n        for ref, attrs, inner in cells:\\n            print(f'  {ref} attrs={attrs.strip()[:40]} inner={inner[:60]}')\\nEOF\\n\", \"user_facing_description\": \"فحص بنية الملف المُصدَّر\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01KU2KTkDorqVVJTFotgskFX" name="code--view" integration-id="code" data="{\"file_path\": \"user-uploads://برج_المراقبة_عسير-2.xlsx\"}">
</lov-tool-use>
I'm in plan mode and can't run shell. Let me view the exporter source directly.
<lov-tool-use id="toolu_vrtx_01Xc8pCw86y3kUxWMd7qqSQG" name="code--view" integration-id="code" data="{\"file_path\": \"src/lib/export/approvalExporter.ts\", \"lines\": \"1,80\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01LJKCy1rJBEtahyw3xWSvs9" name="code--view" integration-id="code" data="{\"file_path\": \"src/lib/export/approvalExporter.ts\", \"lines\": \"280,460\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01DqU4PBmEL3z56rh6y9ydXs" name="code--view" integration-id="code" data="{\"file_path\": \"src/lib/export/approvalExporter.ts\", \"lines\": \"200-470\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01WmBHwgLi4g4eWCd4HFxZwz" name="code--view" integration-id="code" data="{\"file_path\": \"src/lib/export/approvalExporter.ts\", \"lines\": \"470-672\"}">
</lov-tool-use>
Now I understand. Looking at the user's image:
- Row 02025002 (حفر وخنادق للأساسات والكمرات) has quantity **75.00** in one column and **54.60** in another column
- The user says: prices should be injected into unit_rate cell **next to** the qty column (every row with qty>0)

The issue is the user shows that the current export injected `54.60` (which is actually the **unit_rate** that ended up displayed) but the value in the database was different, OR the columns are mismapped: the screenshot shows 4,095.00 and 8,639.63 in what looks like price columns and 54.60, 40.95 as unit rates.

Wait - looking more carefully at image-74: row `02025002` has cells: 75.00 (qty), 54.60 (unit rate?). The right-most cells show the description and item code. The user wants **both** unit_rate AND total_price injected next to each priced row (qty>0).

The user's complaint: only some rows get prices, not all. The previous fix matched by row_index, but apparently many DB items don't have row_index aligned to the actual Excel row OR the items table only has SOME rows (others are "analysis/header" rows in the Excel that need no injection).

Let me check what's actually being passed. Look at handleEtemadExport caller:
<lov-tool-use id="toolu_vrtx_015YgZSpeMFEyw3Rn2CUt2WZ" name="code--search_files" integration-id="code" data="{\"query\": \"exportApproval|handleEtemadExport\", \"include_patterns\": \"*.tsx,*.ts\"}">
</lov-tool-use>
So all `items` (BoQ table state) are passed in. The issue: items have `row_index` from parser. The screenshot shows row 02025002 with qty 75.00 has NO injected price (it shows `54.60` which is the OLD existing value in that cell from the original Excel — likely a quantity-related figure, not our price).

Actually wait — looking again at image-75 which is a closeup: it shows `54.60` then `75.00` then `م3` then description then `02025002`. Both 54.60 and 75.00 look like they're in qty/numeric cells. The user says price wasn't injected.

The problem: `row_index` in DB doesn't match `row.rowNum` in Excel for THIS file. Let me query the DB to check:
<lov-tool-use id="toolu_vrtx_011phcVueTE3TEEKvDqoq3L1" name="code--exec" integration-id="code" data="{\"command\": \"psql -c \\\"SELECT bi.row_index, bi.item_no, LEFT(bi.description, 40) as desc, bi.quantity, bi.unit_rate, bi.status FROM boq_items bi JOIN boq_files bf ON bf.id=bi.boq_file_id WHERE bf.project_id='29dae45a-708e-4954-887d-28b3c45a3163' AND (bi.item_no LIKE '%02025%' OR bi.description LIKE '%حفر وخنادق%' OR bi.description LIKE '%الردم%') ORDER BY bi.row_index LIMIT 30;\\\"\", \"user_facing_description\": \"فحص row_index للبنود في القاعدة\"}">
</lov-tool-use>
Now I see the **real root cause**:

1. **Multiple DB rows share the same `row_index`** (e.g., row_index=11 has 5 different items with different quantities — 22.8, 8812, 4406, 75, 655.8). This is because the parser inherited descriptions across rows but kept `row_index=11`.
2. The screenshot shows row "حفر وخنادق للأساسات والكمرات" with qty=75.00 and unit_rate=54.60 — this **IS** in the database (row 4 of the result above: qty=75, unit_rate=54.60). So the price IS in DB but the export isn't injecting it.
3. The exporter's `byRowIndex` map: when there are duplicates with `row_index=11`, only ONE wins. But there are MANY actual Excel rows with different quantities that need different DB items.

The user's expectation: **inject the price into EVERY Excel row that has quantity > 0**, by matching the **quantity in the cell** + the description, not just `row_index`.

<lov-plan>

## خطة الإصلاح — مطابقة دقيقة عبر (الكمية + الوصف)

### السبب الجذري الحقيقي (تم تأكيده من القاعدة)

عند استعلام DB لمشروع برج المراقبة، تبيّن أن **عدة بنود تشترك في نفس `row_index`** بسبب توارث الوصف من الصف الأب:

```
row_index=11 | حفر وخنادق... | qty=22.8  | rate=42
row_index=11 | حفر وخنادق... | qty=8812  | rate=42
row_index=11 | حفر وخنادق... | qty=4406  | rate=42
row_index=11 | حفر وخنادق... | qty=75    | rate=54.60   ← المستهدف في الصورة
row_index=11 | حفر وخنادق... | qty=655.8 | rate=42
```

النتيجة في `buildRowIndexMap`:
- `byRowIndex.set(11, item)` يحفظ **عنصراً واحداً فقط** (آخر واحد يفوز) → يضيع 80% من البيانات
- ثم `Map<rowNum, item>` في الإكسل يربط الصف 11 بعنصر واحد فقط، ويتجاهل بقية الصفوف الفعلية ذات الكميات المختلفة

### الحل: استبدال المطابقة المعتمدة على `row_index` بـ **مطابقة الكمية + الوصف**

كل صف إكسل يحوي قيمة **quantity مرئية في خلية الكمية**. كل بند DB يحوي `quantity` نفسها. هذا هو المفتاح الفريد الحقيقي للربط.

#### خوارزمية جديدة في `buildRowIndexMap`

لكل صف إكسل (بعد الترويسة):
1. **استخراج الكمية** من خلية `qtyCol` (تحويل النص إلى رقم)
2. **تجاهل الصفوف ذات qty=0 أو غير رقمية** (صفوف عناوين / تحليلية)
3. **بناء قائمة مرشحين** من DB حيث `Math.abs(item.quantity - cellQty) < 0.01` AND `item.status === 'approved'` AND `item.unit_rate > 0`
4. **في حال وجود أكثر من مرشح**: استخدم وصف خلية الإكسل + Jaccard على وصف الـ DB لاختيار الأقرب
5. **في حال مرشح واحد فقط بنفس الكمية**: استخدمه مباشرة
6. **استبعاد بند DB من المرشحين بعد استخدامه** (لمنع تكرار نفس البند في صفين مختلفين)

#### كود مبسّط

```ts
const usedItems = new Set<string>();
const pricedItems = items.filter(i => 
  i.status === 'approved' && i.unit_rate && i.unit_rate > 0 && i.quantity > 0
);

for (const row of rows) {
  if (row.rowNum <= headerMap.headerRow) continue;
  if (headerMap.qtyCol === null) continue;
  
  const qtyCell = row.cells.find(c => parseRef(c.ref)?.col === headerMap.qtyCol);
  const qtyNum = parseFloat((qtyCell?.resolved ?? '').replace(/,/g, ''));
  if (!qtyNum || qtyNum <= 0) continue;          // تجاهل صفوف بدون كمية
  
  const descCell = row.cells.find(c => parseRef(c.ref)?.col === headerMap.descCol);
  const descTxt = descCell?.resolved ?? '';
  
  // مرشحون بنفس الكمية
  const candidates = pricedItems.filter(i =>
    !usedItems.has(i.id) && Math.abs((i.quantity ?? 0) - qtyNum) < 0.01
  );
  
  let chosen: ApprovalItem | undefined;
  if (candidates.length === 1) chosen = candidates[0];
  else if (candidates.length > 1) {
    // اختر أعلى تشابه وصفي
    chosen = candidates.reduce((best, cur) =>
      jaccardSim(descTxt, cur.description) > jaccardSim(descTxt, best.description) ? cur : best
    );
  }
  
  if (chosen) {
    result.set(row.rowNum, chosen);
    usedItems.add(chosen.id);
  }
}
```

#### مزايا هذا النهج
- ✅ **يطابق قيمة الكمية المرئية في الإكسل مع الكمية في DB** — الرابط الوحيد المضمون فريد
- ✅ يحل مشكلة `row_index` المتكرر (عدة بنود تشترك في نفس rowIndex من الـ parser)
- ✅ يحل مشكلة `item_no` الذي يحوي وصفاً بدلاً من رقم
- ✅ يحقن السعر **فقط** في الصفوف ذات qty>0 (مطابقة لما طلبه المستخدم بالضبط)
- ✅ صفوف العناوين والتحليل (qty=0) لا تتلقى أي حقن

### الملف المعدَّل
| الملف | التغيير |
|---|---|
| `src/lib/export/approvalExporter.ts` | استبدال `buildRowIndexMap` (السطور 316-413) بالخوارزمية الجديدة المعتمدة على (qty + description). إضافة `console.log` بكل صف وما تم اختياره له |

### ضمانات
- ✅ صفر تغيير على pricing engine، matching، schema، RPCs
- ✅ بنية الإكسل المُصدَّر بدون تغيير — فقط منطق الربط
- ✅ كل صف بكمية>0 سيحصل على unit_rate و total_price المطابقَين
- ✅ صفوف بـ qty=0 تبقى كما هي (لا حقن)

### التحقق بعد التنفيذ
1. اضغط «تصدير اعتماد» للملف
2. افتح Console — تأكد أن `matchedRows` ≈ عدد البنود المسعّرة في DB
3. افتح الناتج في إكسل — صف `02025002 | qty=75` يجب أن يظهر `unit_rate=54.60` و `total=4095.00`

