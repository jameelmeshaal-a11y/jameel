

# محرك تسعير BMS بنظام النقاط (Points-Based BMS Pricing Engine)

## الفكرة

فكرة ممتازة وهندسياً صحيحة. نظام BMS لا يُسعّر كبند واحد — بل يُحسب من خلال عدّ النقاط (I/O Points) المستخلصة من بنود HVAC والحريق والكهرباء الموجودة فعلاً في جدول الكميات.

سيعمل المحرك كـ **طبقة إضافية** فوق محرك التسعير الحالي — لا يغيّره — بل يقرأ نتائجه ويولّد بنداً مركّباً جديداً.

---

## الهيكل التقني

```text
┌─────────────────────────────────────────────┐
│           محرك التسعير الحالي               │
│  (يسعّر HVAC, Fire, Electrical عادي)        │
└──────────────────┬──────────────────────────┘
                   │ بعد الانتهاء
                   ▼
┌─────────────────────────────────────────────┐
│         محرك BMS Points (جديد)              │
│                                             │
│  ① مسح البنود المسعّرة → تصنيف BMS         │
│  ② تحويل كل بند إلى نقاط (Dictionary)      │
│  ③ جمع النقاط + تطبيق المضاعفات            │
│  ④ حساب التكلفة النهائية                    │
│  ⑤ إدراج صف BMS في جدول الكميات            │
└─────────────────────────────────────────────┘
```

---

## الملفات والتغييرات

### 1. ملف جديد: `src/lib/pricing/bmsEngine.ts`
المحرك الأساسي — يحتوي على:

**A) قاموس التحويل (Points Dictionary)**
```text
AHU          → 15-25 نقطة (حسب الحجم)
FCU          → 2-4 نقاط
Fire Damper  → 1 نقطة
Smoke Detector → 1 نقطة
Chiller      → 15-40 نقطة
Pump         → 3-6 نقاط
VAV Box      → 2 نقاط
Exhaust Fan  → 2-4 نقاط
Control Valve → 1 نقطة
Temperature Sensor → 1 نقطة
```

**B) Pattern Matching (كلمات مفتاحية عربي/إنجليزي)**
- يستخدم نفس منطق `categoryDetector.ts` لكن بقواعد خاصة بـ BMS
- يبحث في: AHU, FCU, مراوح, مضخات, صمامات, كاشف دخان, damper, chiller, إلخ

**C) Rules Engine (مضاعفات)**
- نوع المشروع: حكومي ×1.0، أمني ×1.3، صحي ×1.15
- عدد المباني: مبنى واحد ×1.0، متعدد ×1.1-1.2
- Integration: +15-25%
- Programming & Commissioning: +10%
- Server/Gateway: تكلفة ثابتة إذا > 200 نقطة

**D) دالة `calculateBMSCost()`**
- Input: بنود جدول الكميات المسعّرة + نوع المشروع
- Output: إجمالي النقاط، التكلفة، التفصيل حسب النظام

### 2. تعديل: `src/lib/pricing/categoryDetector.ts`
- إضافة فئات جديدة: `"bms_controller"`, `"bms_sensor"`, `"bms_actuator"`
- إضافة كلمات مفتاحية: BMS, DDC, تحكم مبنى, building management, controller

### 3. تعديل: `src/lib/pricingEngine.ts`
- بعد انتهاء التسعير العادي، استدعاء `calculateBMSCost()` إذا وُجدت بنود HVAC/Fire/Electrical
- إدراج صف BMS ملخّص في نتائج التسعير (اختياري — يظهر كبند مستقل)

### 4. تعديل: `src/components/BoQTable.tsx`
- عرض ملخص BMS في أسفل الجدول أو كصف خاص
- عرض: عدد النقاط، التكلفة، التفصيل (HVAC/Fire/Security)

### 5. لا migration — البيانات تُحسب ديناميكياً
- لا حاجة لجداول جديدة
- النقاط تُحسب من البنود الموجودة في كل مرة

---

## لا تأثير على:
- خوارزميات المطابقة الحالية
- سياسات التسعير أو RLS
- مكتبة الأسعار
- محرك التسعير الأساسي (إضافة فقط، لا تعديل منطق)

---

## القسم التقني: معادلة الحساب

```text
Total Points = Σ (quantity × points_per_unit) لكل بند مطابق

BMS Base Cost = Total Points × Rate per Point (400-600 ريال/نقطة)

Additions:
  + Integration    = Base × 15-25%
  + Programming    = Base × 10%
  + Server/Gateway = 50,000-150,000 (إذا > 200 نقطة)

BMS Total = Base + Integration + Programming + Server

Multipliers:
  × Project Type Factor (حكومي/أمني/صحي)
  × Multi-building Factor
```

