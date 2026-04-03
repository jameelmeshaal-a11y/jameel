import { useLanguage } from "@/contexts/LanguageContext";
import AppLayout from "@/components/AppLayout";
import { Blocks, Database, Upload, Calculator, FileDown, Globe, Shield, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";

const layers = [
  {
    icon: Globe,
    en: "Pages (Routes)",
    ar: "الصفحات (المسارات)",
    items: [
      { en: "/ → Dashboard", ar: "/ → لوحة التحكم" },
      { en: "/projects → Projects List", ar: "/projects → قائمة المشاريع" },
      { en: "/projects/:id → Project Workspace", ar: "/projects/:id → مساحة المشروع" },
      { en: "/rate-library → Rate Library", ar: "/rate-library → مكتبة الأسعار" },
      { en: "/settings → Settings", ar: "/settings → الإعدادات" },
      { en: "/validation → System Validation", ar: "/validation → التحقق من النظام" },
      { en: "/qa-center → QA Test Center", ar: "/qa-center → مركز ضمان الجودة" },
      { en: "/architecture → System Architecture", ar: "/architecture → هيكل النظام" },
    ],
  },
  {
    icon: Blocks,
    en: "Core Components",
    ar: "المكونات الأساسية",
    items: [
      { en: "AppLayout — Main layout with sidebar", ar: "AppLayout — التخطيط الرئيسي مع الشريط الجانبي" },
      { en: "AppSidebar — Navigation sidebar (RTL-aware)", ar: "AppSidebar — شريط التنقل (يدعم RTL)" },
      { en: "BoQTable — Bill of Quantities viewer & pricer", ar: "BoQTable — عارض ومسعّر جداول الكميات" },
      { en: "DocumentsTab — Document upload & management", ar: "DocumentsTab — رفع وإدارة المستندات" },
      { en: "CreateProjectDialog — New project form", ar: "CreateProjectDialog — نموذج مشروع جديد" },
      { en: "DebugPanel — Real-time debug overlay", ar: "DebugPanel — لوحة التصحيح المباشر" },
    ],
  },
  {
    icon: Database,
    en: "Backend (Lovable Cloud)",
    ar: "الخادم (Lovable Cloud)",
    items: [
      { en: "projects — Project records", ar: "projects — سجلات المشاريع" },
      { en: "boq_files — Uploaded BoQ metadata", ar: "boq_files — بيانات ملفات جداول الكميات" },
      { en: "boq_items — Parsed BoQ line items", ar: "boq_items — بنود جداول الكميات المحللة" },
      { en: "project_documents — Document metadata", ar: "project_documents — بيانات المستندات" },
    ],
  },
  {
    icon: Upload,
    en: "Storage Buckets",
    ar: "حاويات التخزين",
    items: [
      { en: "documents — Project documents (PDF, DOCX)", ar: "documents — مستندات المشاريع" },
      { en: "boq-files — Excel BoQ files", ar: "boq-files — ملفات جداول الكميات (Excel)" },
    ],
  },
  {
    icon: Calculator,
    en: "Business Logic",
    ar: "المنطق التجاري",
    items: [
      { en: "boqParser.ts — Excel parsing (xlsx library)", ar: "boqParser.ts — تحليل ملفات Excel" },
      { en: "pricingEngine.ts — Cost breakdown & location factors", ar: "pricingEngine.ts — تفصيل التكاليف ومعاملات الموقع" },
      { en: "validationEngine.ts — System self-testing", ar: "validationEngine.ts — الاختبار الذاتي للنظام" },
      { en: "validationPDF.ts — PDF report generation", ar: "validationPDF.ts — إنشاء تقارير PDF" },
    ],
  },
  {
    icon: Shield,
    en: "API Layer (Hooks)",
    ar: "طبقة API (الخطافات)",
    items: [
      { en: "useProjects — CRUD projects", ar: "useProjects — إدارة المشاريع" },
      { en: "useBoQFiles / useBoQItems — BoQ data", ar: "useBoQFiles / useBoQItems — بيانات جداول الكميات" },
      { en: "useProjectDocuments — Document management", ar: "useProjectDocuments — إدارة المستندات" },
      { en: "useUploadDocument — File upload", ar: "useUploadDocument — رفع الملفات" },
    ],
  },
  {
    icon: Cpu,
    en: "Infrastructure",
    ar: "البنية التحتية",
    items: [
      { en: "React 18 + Vite 5 + TypeScript", ar: "React 18 + Vite 5 + TypeScript" },
      { en: "TanStack Query — Server state management", ar: "TanStack Query — إدارة حالة الخادم" },
      { en: "Tailwind CSS v3 — Styling system", ar: "Tailwind CSS v3 — نظام التنسيق" },
      { en: "i18n — Arabic/English bilingual support", ar: "i18n — دعم ثنائي اللغة عربي/إنجليزي" },
    ],
  },
];

export default function SystemArchitecturePage() {
  const { lang } = useLanguage();
  const isAr = lang === "ar";

  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="page-header">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <Blocks className="w-6 h-6 text-primary" />
              {isAr ? "هيكل النظام" : "System Architecture"}
            </h1>
            <p className="page-subtitle">
              {isAr ? "نظرة شاملة على مكونات النظام وطبقاته" : "Complete overview of system components and layers"}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {layers.map((layer, idx) => {
            const Icon = layer.icon;
            return (
              <div key={idx} className="stat-card">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <h2 className="font-semibold">{isAr ? layer.ar : layer.en}</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                  {layer.items.map((item, j) => (
                    <div key={j} className="text-sm py-1.5 px-3 rounded-lg bg-muted/50 text-muted-foreground font-mono text-xs">
                      {isAr ? item.ar : item.en}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
