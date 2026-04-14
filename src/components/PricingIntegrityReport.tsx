import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle, AlertTriangle, XCircle, Shield, Wrench, Loader2, ChevronDown, ChevronUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import type { IntegrityReport, IntegrityIssue, IssueType, FixAction, DeviationItem } from "@/lib/pricing/integrityChecker";
import { fixIntegrityIssues, runIntegrityCheck, findDeviationItems } from "@/lib/pricing/integrityChecker";
import { formatNumber } from "@/lib/mockData";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: IntegrityReport | null;
  boqFileId: string;
  onFixed: () => void;
}

const ISSUE_TYPE_LABELS: Record<IssueType, { label: string; icon: string }> = {
  rate_deviation:     { label: "انحراف عن سعر المكتبة", icon: "🔴" },
  breakdown_mismatch: { label: "مجموع التوزيع ≠ سعر الوحدة", icon: "⚠️" },
  low_confidence:     { label: "تطابق متوسط الثقة (50-69%)", icon: "🟡" },
  zero_price:         { label: "بنود بسعر صفر", icon: "🔴" },
  zero_breakdown:     { label: "توزيع تكلفة أصفار", icon: "⚠️" },
  dimension_mismatch: { label: "مقاسات مختلفة عن المكتبة", icon: "📐" },
};

export default function PricingIntegrityReport({ open, onOpenChange, report, boqFileId, onFixed }: Props) {
  const [fixing, setFixing] = useState(false);
  const [fixingGroup, setFixingGroup] = useState<IssueType | null>(null);
  const [fixingItem, setFixingItem] = useState<string | null>(null);
  const [currentReport, setCurrentReport] = useState<IntegrityReport | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<IssueType>>(new Set());
  const [deviationItems, setDeviationItems] = useState<DeviationItem[]>([]);
  const [loadingDeviations, setLoadingDeviations] = useState(false);
  const [activeTab, setActiveTab] = useState("integrity");

  const activeReport = currentReport || report;

  const groupedIssues = useMemo(() => {
    if (!activeReport) return new Map<IssueType, IntegrityIssue[]>();
    const map = new Map<IssueType, IntegrityIssue[]>();
    for (const issue of activeReport.issues) {
      const group = map.get(issue.issueType) || [];
      group.push(issue);
      map.set(issue.issueType, group);
    }
    return map;
  }, [activeReport]);

  const autoFixableCount = useMemo(() => {
    if (!activeReport) return 0;
    return activeReport.issues.filter(i => i.fixAction !== "manual").length;
  }, [activeReport]);

  const toggleGroup = (type: IssueType) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const refreshReport = async () => {
    const newReport = await runIntegrityCheck(boqFileId);
    setCurrentReport(newReport);
    onFixed();
  };

  const handleFixAll = async () => {
    if (!activeReport) return;
    const fixable = activeReport.issues.filter(i => i.fixAction !== "manual");
    if (fixable.length === 0) return;

    setFixing(true);
    try {
      const result = await fixIntegrityIssues(fixable, boqFileId);
      toast.success(`تم إصلاح ${result.fixed} مشكلة${result.failed > 0 ? ` — ${result.failed} فشل` : ""}`);
      await refreshReport();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setFixing(false);
    }
  };

  const handleFixGroup = async (type: IssueType) => {
    if (!activeReport) return;
    const groupIssues = activeReport.issues.filter(i => i.issueType === type && i.fixAction !== "manual");
    if (groupIssues.length === 0) {
      toast.info("هذه المجموعة تحتاج مراجعة يدوية");
      return;
    }

    setFixingGroup(type);
    try {
      const result = await fixIntegrityIssues(groupIssues, boqFileId);
      toast.success(`تم إصلاح ${result.fixed} بند${result.failed > 0 ? ` — ${result.failed} فشل` : ""}`);
      await refreshReport();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setFixingGroup(null);
    }
  };

  const handleFixSingle = async (issue: IntegrityIssue) => {
    if (issue.fixAction === "manual") {
      toast.info("هذا البند يحتاج مراجعة يدوية");
      return;
    }

    setFixingItem(issue.itemId);
    try {
      const result = await fixIntegrityIssues([issue], boqFileId);
      if (result.fixed > 0) toast.success("تم الإصلاح");
      else toast.error("فشل الإصلاح");
      await refreshReport();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setFixingItem(null);
    }
  };

  const handleLoadDeviations = async () => {
    setLoadingDeviations(true);
    try {
      const items = await findDeviationItems(boqFileId);
      setDeviationItems(items);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoadingDeviations(false);
    }
  };

  if (!activeReport) return null;

  const healthPct = activeReport.totalChecked > 0
    ? Math.round((activeReport.healthyCount / activeReport.totalChecked) * 100)
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            تقرير سلامة الأسعار
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0 flex flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="integrity">🛡️ سلامة الأسعار</TabsTrigger>
            <TabsTrigger value="deviation" onClick={() => { if (deviationItems.length === 0 && !loadingDeviations) handleLoadDeviations(); }}>
              📊 انحراف &gt;30%
              {deviationItems.length > 0 && <Badge variant="secondary" className="mr-1 text-[10px]">{deviationItems.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="integrity" className="flex-1 min-h-0 flex flex-col gap-2 mt-2">
            {/* Summary Bar */}
            <div className="grid grid-cols-4 gap-3 py-2">
              <div className="rounded-lg border bg-muted/30 p-2 text-center">
                <div className="text-xl font-bold">{activeReport.totalChecked}</div>
                <div className="text-xs text-muted-foreground">بند تم فحصه</div>
              </div>
              <div className="rounded-lg border bg-emerald-50 dark:bg-emerald-950/30 p-2 text-center">
                <div className="text-xl font-bold text-emerald-600">{activeReport.healthyCount}</div>
                <div className="text-xs text-muted-foreground">سليم ✅</div>
              </div>
              <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/30 p-2 text-center">
                <div className="text-xl font-bold text-amber-600">{activeReport.summary.warning}</div>
                <div className="text-xs text-muted-foreground">تحذير ⚠️</div>
              </div>
              <div className="rounded-lg border bg-red-50 dark:bg-red-950/30 p-2 text-center">
                <div className="text-xl font-bold text-red-600">{activeReport.summary.critical}</div>
                <div className="text-xs text-muted-foreground">حرج 🔴</div>
              </div>
            </div>

            {/* Health bar */}
            <div className="flex items-center gap-3 px-1">
              <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${healthPct >= 90 ? "bg-emerald-500" : healthPct >= 70 ? "bg-amber-500" : "bg-red-500"}`}
                  style={{ width: `${healthPct}%` }}
                />
              </div>
              <span className="text-sm font-medium">{healthPct}%</span>
            </div>

            {activeReport.summary.totalDeviation > 0 && (
              <div className="text-sm text-muted-foreground px-1">
                إجمالي الانحراف: <span className="font-semibold text-destructive">{formatNumber(activeReport.summary.totalDeviation)} ريال</span>
              </div>
            )}

            {autoFixableCount > 0 && (
              <div className="flex gap-2 px-1">
                <Button onClick={handleFixAll} disabled={fixing} className="gap-1.5">
                  {fixing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
                  إصلاح الكل ({autoFixableCount} مشكلة)
                </Button>
              </div>
            )}

            {activeReport.issues.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <CheckCircle className="w-12 h-12 text-emerald-500" />
                <p className="text-lg font-semibold">جميع الأسعار سليمة ✅</p>
                <p className="text-sm text-muted-foreground">لا توجد مشاكل في التسعير</p>
              </div>
            )}

            <ScrollArea className="flex-1 min-h-0">
              <div className="space-y-3 pb-4">
                {Array.from(groupedIssues.entries()).map(([type, typeIssues]) => {
                  const meta = ISSUE_TYPE_LABELS[type];
                  const isExpanded = expandedGroups.has(type);
                  const groupFixable = typeIssues.filter(i => i.fixAction !== "manual").length;

                  return (
                    <div key={type} className="rounded-lg border">
                      <div
                        className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => toggleGroup(type)}
                      >
                        <div className="flex items-center gap-2">
                          <span>{meta.icon}</span>
                          <span className="font-medium text-sm">{meta.label}</span>
                          <Badge variant="secondary" className="text-xs">{typeIssues.length}</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          {groupFixable > 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1 text-xs h-7"
                              disabled={fixingGroup === type}
                              onClick={(e) => { e.stopPropagation(); handleFixGroup(type); }}
                            >
                              {fixingGroup === type ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wrench className="w-3 h-3" />}
                              إصلاح المجموعة
                            </Button>
                          )}
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t divide-y">
                          {typeIssues.slice(0, 50).map((issue) => (
                            <div key={issue.itemId + issue.issueType} className="flex items-center justify-between px-3 py-2 text-xs hover:bg-muted/30">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-muted-foreground">{issue.itemNo || "—"}</span>
                                  {issue.severity === "critical" ? (
                                    <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                  ) : (
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                  )}
                                </div>
                                <div className="text-muted-foreground truncate mt-0.5" dir="rtl">{issue.description?.slice(0, 60)}</div>
                                <div className="text-muted-foreground/70 mt-0.5">{issue.detail}</div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="gap-1 text-xs h-7 shrink-0 mr-2"
                                disabled={fixingItem === issue.itemId}
                                onClick={() => handleFixSingle(issue)}
                              >
                                {fixingItem === issue.itemId ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : issue.fixAction === "manual" ? (
                                  "مراجعة"
                                ) : (
                                  <>
                                    <Wrench className="w-3 h-3" /> إصلاح
                                  </>
                                )}
                              </Button>
                            </div>
                          ))}
                          {typeIssues.length > 50 && (
                            <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                              و {typeIssues.length - 50} بند آخر...
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="deviation" className="flex-1 min-h-0 flex flex-col gap-2 mt-2">
            {loadingDeviations ? (
              <div className="flex items-center justify-center py-8 gap-2">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="text-sm">جاري تحليل الانحرافات...</span>
              </div>
            ) : deviationItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <CheckCircle className="w-12 h-12 text-emerald-500" />
                <p className="text-lg font-semibold">لا توجد انحرافات كبيرة ✅</p>
                <p className="text-sm text-muted-foreground">جميع البنود ضمن هامش 30% من أسعار المكتبة</p>
              </div>
            ) : (
              <ScrollArea className="flex-1 min-h-0">
                <div className="space-y-2 pb-4">
                  <div className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
                    <TrendingDown className="w-4 h-4" />
                    <span>{deviationItems.length} بند بانحراف &gt;30%</span>
                  </div>
                  {deviationItems.map((dev) => (
                    <div key={dev.itemId} className="rounded-lg border p-3 text-xs hover:bg-muted/30">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-muted-foreground">{dev.itemNo || "—"}</span>
                          <Badge variant={
                            dev.classification === "likely_mislink" ? "destructive" :
                            dev.classification === "spec_difference" ? "secondary" : "outline"
                          } className="text-[10px]">
                            {dev.classification === "likely_mislink" ? "🔴 ربط خاطئ محتمل" :
                             dev.classification === "spec_difference" ? "🟡 اختلاف مواصفات" : "⚪ يحتاج مراجعة"}
                          </Badge>
                        </div>
                        <span className="font-semibold text-destructive">{dev.deviationPct}%</span>
                      </div>
                      <div className="text-muted-foreground truncate" dir="rtl">{dev.description?.slice(0, 80)}</div>
                      <div className="flex items-center gap-4 mt-1 text-muted-foreground/70">
                        <span>سعر البند: {formatNumber(dev.unitRate)}</span>
                        <span>سعر المكتبة: {formatNumber(dev.libraryRate)}</span>
                      </div>
                      <div className="text-muted-foreground/60 mt-0.5 truncate" dir="rtl">مربوط بـ: {dev.libraryName}</div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
