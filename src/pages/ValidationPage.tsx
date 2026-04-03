import { useState, useCallback } from "react";
import {
  ShieldCheck, Play, CheckCircle2, XCircle, AlertTriangle,
  Clock, ChevronDown, ChevronRight, Loader2, BarChart3,
  FileCheck, Database, MousePointerClick, Cpu, Brain, AlertOctagon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import AppLayout from "@/components/AppLayout";
import { useLanguage } from "@/contexts/LanguageContext";
import { runFullValidation, type ValidationReport, type TestResult, type TestStatus } from "@/lib/validationEngine";
import { cn } from "@/lib/utils";

const categoryIcons: Record<string, any> = {
  "Project System": FileCheck,
  "Document Upload": Database,
  "BoQ Upload": Database,
  "Pricing Engine": BarChart3,
  "UI / Interaction": MousePointerClick,
  "Data Integrity": ShieldCheck,
  "Performance": Cpu,
  "AI Quality": Brain,
  "Error Detection": AlertOctagon,
};

const statusConfig: Record<TestStatus, { icon: any; color: string; label: string; labelAr: string }> = {
  pass: { icon: CheckCircle2, color: "text-emerald-500", label: "Pass", labelAr: "ناجح" },
  fail: { icon: XCircle, color: "text-red-500", label: "Fail", labelAr: "فشل" },
  warn: { icon: AlertTriangle, color: "text-amber-500", label: "Warning", labelAr: "تحذير" },
  running: { icon: Loader2, color: "text-blue-500 animate-spin", label: "Running", labelAr: "جاري" },
  pending: { icon: Clock, color: "text-muted-foreground", label: "Pending", labelAr: "قيد الانتظار" },
};

export default function ValidationPage() {
  const { t, lang } = useLanguage();
  const isAr = lang === "ar";

  const [report, setReport] = useState<ValidationReport | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [currentTest, setCurrentTest] = useState("");
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [showDebug, setShowDebug] = useState(false);

  const handleRun = useCallback(async () => {
    setRunning(true);
    setReport(null);
    setProgress(0);

    const result = await runFullValidation((test, idx, tot) => {
      setProgress(idx);
      setTotal(tot);
      setCurrentTest(isAr ? test.nameAr : test.name);
    });

    setReport(result);
    setRunning(false);
    setExpandedCats(new Set(
      result.tests.filter(t => t.status === "fail" || t.status === "warn").map(t => t.category)
    ));
  }, [isAr]);

  const toggleCat = (cat: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const categories = report
    ? [...new Set(report.tests.map(t => t.category))]
    : [];

  const overallLabels = {
    ready: { en: "System Ready", ar: "النظام جاهز", color: "bg-emerald-500" },
    partially_ready: { en: "Partially Ready", ar: "جاهز جزئياً", color: "bg-amber-500" },
    not_ready: { en: "Not Ready", ar: "غير جاهز", color: "bg-red-500" },
  };

  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="page-header">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-primary" />
              {isAr ? "التحقق من جاهزية النظام" : "System Validation"}
            </h1>
            <p className="page-subtitle">
              {isAr
                ? "فحص شامل لجميع مكونات النظام وتوليد تقرير الجاهزية"
                : "Comprehensive system diagnostic and readiness report"}
            </p>
          </div>
          <Button onClick={handleRun} disabled={running} className="gap-2">
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {running
              ? (isAr ? "جاري الفحص..." : "Running...")
              : (isAr ? "تشغيل الفحص الشامل" : "Run Full Validation")}
          </Button>
        </div>

        {/* Progress */}
        {running && (
          <div className="stat-card mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">{currentTest}</span>
              <span className="text-xs text-muted-foreground">{progress}/{total}</span>
            </div>
            <Progress value={total > 0 ? (progress / total) * 100 : 0} className="h-2" />
          </div>
        )}

        {/* Report */}
        {report && !running && (
          <>
            {/* Overall Status */}
            <div className="stat-card mb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center", overallLabels[report.overallStatus].color)}>
                    <ShieldCheck className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">
                      {isAr ? overallLabels[report.overallStatus].ar : overallLabels[report.overallStatus].en}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {new Date(report.timestamp).toLocaleString(isAr ? "ar-SA" : "en-SA")}
                    </p>
                  </div>
                </div>
                <div className="flex gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-emerald-500">{report.totalPassed}</div>
                    <div className="text-xs text-muted-foreground">{isAr ? "ناجح" : "Passed"}</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-amber-500">{report.totalWarnings}</div>
                    <div className="text-xs text-muted-foreground">{isAr ? "تحذيرات" : "Warnings"}</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-red-500">{report.totalFailed}</div>
                    <div className="text-xs text-muted-foreground">{isAr ? "فشل" : "Failed"}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Score Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              {([
                { key: "functional" as const, en: "Functional", ar: "الوظائف" },
                { key: "dataIntegrity" as const, en: "Data Integrity", ar: "سلامة البيانات" },
                { key: "uiReliability" as const, en: "UI Reliability", ar: "موثوقية الواجهة" },
                { key: "pricingLogic" as const, en: "Pricing Logic", ar: "منطق التسعير" },
                { key: "performance" as const, en: "Performance", ar: "الأداء" },
              ]).map(s => {
                const score = report.scores[s.key];
                const color = score >= 80 ? "text-emerald-500" : score >= 50 ? "text-amber-500" : "text-red-500";
                return (
                  <div key={s.key} className="stat-card text-center">
                    <div className={cn("text-3xl font-bold", color)}>{score}%</div>
                    <div className="text-xs text-muted-foreground mt-1">{isAr ? s.ar : s.en}</div>
                  </div>
                );
              })}
            </div>

            {/* Detailed Results */}
            <div className="space-y-3">
              {categories.map(cat => {
                const catTests = report.tests.filter(t => t.category === cat);
                const expanded = expandedCats.has(cat);
                const Icon = categoryIcons[cat] || ShieldCheck;
                const catPassed = catTests.filter(t => t.status === "pass").length;
                const catFailed = catTests.filter(t => t.status === "fail").length;
                const catWarn = catTests.filter(t => t.status === "warn").length;

                return (
                  <div key={cat} className="stat-card">
                    <button
                      onClick={() => toggleCat(cat)}
                      className="w-full flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="w-5 h-5 text-primary" />
                        <span className="font-semibold text-sm">{cat}</span>
                        <div className="flex gap-1">
                          {catPassed > 0 && <Badge variant="outline" className="text-emerald-500 border-emerald-200 text-[10px]">{catPassed} ✓</Badge>}
                          {catWarn > 0 && <Badge variant="outline" className="text-amber-500 border-amber-200 text-[10px]">{catWarn} ⚠</Badge>}
                          {catFailed > 0 && <Badge variant="outline" className="text-red-500 border-red-200 text-[10px]">{catFailed} ✕</Badge>}
                        </div>
                      </div>
                      {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                    {expanded && (
                      <div className="mt-3 space-y-2 border-t pt-3">
                        {catTests.map(test => {
                          const sc = statusConfig[test.status];
                          const StatusIcon = sc.icon;
                          return (
                            <div key={test.id} className="flex items-start gap-3 py-2">
                              <StatusIcon className={cn("w-4 h-4 mt-0.5 flex-shrink-0", sc.color)} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium">{isAr ? test.nameAr : test.name}</span>
                                  {test.duration !== undefined && (
                                    <span className="text-[10px] text-muted-foreground">{test.duration}ms</span>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {isAr ? test.messageAr : test.message}
                                </p>
                                {showDebug && test.details && (
                                  <pre className="text-[10px] mt-1 p-2 rounded bg-muted font-mono">{test.details}</pre>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Debug Toggle */}
            <div className="mt-4 flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => setShowDebug(!showDebug)}>
                {showDebug
                  ? (isAr ? "إخفاء تفاصيل التصحيح" : "Hide Debug Details")
                  : (isAr ? "عرض تفاصيل التصحيح" : "Show Debug Details")}
              </Button>
            </div>
          </>
        )}

        {/* Empty State */}
        {!report && !running && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
              <ShieldCheck className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold mb-2">
              {isAr ? "اختبار جاهزية النظام" : "System Readiness Test"}
            </h2>
            <p className="text-muted-foreground max-w-md mb-6">
              {isAr
                ? "قم بتشغيل الفحص الشامل للتحقق من جميع مكونات النظام: المشاريع، المستندات، جداول الكميات، التسعير، الأداء، وأكثر."
                : "Run the full validation to check all system components: projects, documents, BoQ, pricing, performance, and more."}
            </p>
            <Button onClick={handleRun} className="gap-2">
              <Play className="w-4 h-4" />
              {isAr ? "تشغيل الفحص الشامل" : "Run Full Validation"}
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
