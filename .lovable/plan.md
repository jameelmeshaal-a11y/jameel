

# تحليل المشكلة: لماذا اعتمد النظام سعر 26,000 ريال لجرس إنذار الحريق

## السبب الجذري

البند #423 "جرس انذار حريق" (17 عدد) تم ربطه بسجل المكتبة **"غرفة الاتصالات"** (26,000 ريال) بدلاً من **"جرس انذار حريق"** (320 ريال).

### كيف حدث هذا؟

1. **حقل `item_no`** = "جرس انذار حريق" — مطابق **100%** لسجل المكتبة "جرس انذار حريق" (320 ريال)
2. **حقل `description`** = نص طويل جداً يبدأ بـ "إجمالى نظام الدائرة التلفزيونية المغلقة | نظام الكشف والأنذار عن الحريق..." — ويحتوي عشرات الكلمات التقنية عن أنظمة الحريق والكابلات والمواسير واللوحات
3. سجل "غرفة الاتصالات" في المكتبة يحتوي **keywords** تشمل: `جرس`, `انذار`, `حريق`, `كابلات`, `مواسير`, `لوحات`, `تحكم`, `نظام` — وهي كلمات كثيرة تتطابق مع الوصف الطويل
4. **النتيجة**: jaccard similarity بين الوصف الطويل وكلمات "غرفة الاتصالات" أعلى من jaccard مع "جرس انذار حريق" البسيط
5. رغم أن `itemNoBonus = +50` للمطابقة الصحيحة، فإن النتيجة الأساسية لـ "غرفة الاتصالات" من الوصف تتجاوزها

### الخلاصة: المحرك يثق بالوصف الطويل أكثر من اسم البند الدقيق

---

## الحل: بوابة `item_no` الحاسمة (Hard Override)

### المبدأ
عندما يتطابق `item_no` مع اسم سجل في المكتبة بنسبة ≥ 95% **مع تطابق الوحدة** → هذا هو التطابق النهائي. لا مجال للمنافسة من الوصف.

### التغييرات

#### 1. `src/lib/pricing/matchingV3.ts` — بوابة item_no قبل التسجيل

**قبل** حلقة `for (const candidate of rateLibrary)` التي تسجل النقاط، إضافة مسح أولي:

```text
// ── Pre-scan: item_no Hard Override ──
// If item_no exactly matches a library name (≥95%), 
// return that match immediately at confidence 99.
// This prevents long descriptions from overriding the precise item name.

for each candidate in rateLibrary:
  if unit doesn't match → skip
  if category incompatible → skip
  compute itemNoSim = max similarity of (item_no vs candidate names/aliases)
  if itemNoSim >= 0.95 → return immediately with confidence 99
```

هذا يضمن:
- "جرس انذار حريق" (item_no) يطابق "جرس انذار حريق" (مكتبة) بنسبة ~100% → يُرجع فوراً بثقة 99
- "غرفة الاتصالات" لن تحصل على فرصة للمنافسة أصلاً

#### 2. `supabase/functions/match-price-item/index.ts` — نفس البوابة

إضافة معامل `item_no` اختياري للـ Edge Function وتطبيق نفس المنطق: إذا `item_no` تطابق اسم المكتبة بنسبة ≥95% مع تطابق الوحدة → يُرجع فوراً.

#### 3. حفظ القاعدة في الذاكرة

تحديث `mem://features/matching/v4-engine-core` بقاعدة:
> item_no exact match (≥95%) is a HARD OVERRIDE — bypasses all description scoring.

---

## الملفات المتأثرة

| الملف | التغيير |
|---|---|
| `src/lib/pricing/matchingV3.ts` | Pre-scan loop: item_no ≥ 95% → return immediately |
| `supabase/functions/match-price-item/index.ts` | Accept `item_no` param + same hard override |
| Memory | حفظ قاعدة item_no Hard Override |

## لماذا هذا يمنع التكرار مع بنود أخرى

- أي بند له `item_no` واضح ودقيق (مثل "جرس انذار حريق"، "كاشف دخان"، "رشاش حريق") سيتطابق فوراً مع المكتبة بغض النظر عن طول الوصف
- البنود ذات الوصف الطويل الموروث من السياق الأعلى لن تتداخل مع بنود أخرى غير ذات صلة
- القاعدة تعمل كبوابة أولى قبل أي تحليل — لا تحذف أي منطق سابق، فقط تضيف أولوية حاسمة

