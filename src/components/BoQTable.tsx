import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Eye, Download, CheckCircle, AlertTriangle, XCircle, FileText, Info, Loader2, Play, RefreshCw, ListX, ShieldAlert, Wrench, RotateCcw, Pencil, Shield, Filter, X, Lock, BadgeCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useBoQItems, useProject, useBoQFiles } from "@/hooks/useSupabase";
import { exportBoQExcel } from "@/lib/boqParser";
import { exportStyledBoQ } from "@/lib/boqExcelExport";
import { exportEtemad } from "@/lib/export/etemadExporter";
import { runPricingEngine, detectCategory, isPriceableItem, repriceUnpricedItems, resetBoQPricing, calculateBMSCost, repriceSingleItem, type OnItemPricedCallback, type BMSCalculationResult } from "@/lib/pricingEngine";
import { formatNumber, formatCurrency } from "@/lib/mockData";
import PriceBreakdownModal from "./PriceBreakdownModal";
import { useLanguage } from "@/contexts/LanguageContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { buildBoQExportSummary, classifyBoQRow } from "@/lib/boqRowClassification";
import BoQBlockingRowsDialog from "./BoQBlockingRowsDialog";
import { fixConsistency, useProjectConsistency } from "@/hooks/useConsistencyCheck";
import BudgetDistributionPanel from "./BudgetDistributionPanel";
import { supabase } from "@/integrations/supabase/client";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import PricingIntegrityReport from "./PricingIntegrityReport";
import { runIntegrityCheck, type IntegrityReport } from "@/lib/pricing/integrityChecker";
import BMSAnalysisPanel from "./BMSAnalysisPanel";

type PricingMode = "review" | "smart" | "auto";

interface BoQTableProps {
  boqFileId: string;
  projectId: string;
  cities: string[];
  ownerMaterials?: boolean;
  isArchived?: boolean;
}

export default function BoQTable({ boqFileId, projectId, cities, ownerMaterials = false, isArchived = false }: BoQTableProps) {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const [mode, setMode] = useState<PricingMode>("review");
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [pricing, setPricing] = useState(false);
  const [pricingProgress, setPricingProgress] = useState({ current: 0, total: 0 });
  const [blockingRowsOpen, setBlockingRowsOpen] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  const [fixing, setFixing] = useState(false);
  const autoFixAttempted = useRef(false);
  const [autoFixFailed, setAutoFixFailed] = useState(false);
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [editingUnitValue, setEditingUnitValue] = useState("");
  const [integrityReportOpen, setIntegrityReportOpen] = useState(false);
  const [integrityReport, setIntegrityReport] = useState<IntegrityReport | null>(null);
  const [checkingIntegrity, setCheckingIntegrity] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [runningTotal, setRunningTotal] = useState<number | null>(null);
  const [currentItemName, setCurrentItemName] = useState<string>("");
  const [bmsResult, setBmsResult] = useState<BMSCalculationResult | null>(null);
  const [repricingItemId, setRepricingItemId] = useState<string | null>(null);

  // Real-time cache updater callback
  const makeOnItemPriced = useCallback((): OnItemPricedCallback => {
    return (itemId: string, update: Record<string, any>) => {
      // Update the specific row in React Query cache
      qc.setQueryData(["boq-items", boqFileId], (old: any[] | undefined) => {
        if (!old) return old;
        return old.map(item => item.id === itemId ? { ...item, ...update } : item);
      });
      // Update running total
      if (update.total_price && update.total_price > 0) {
        setRunningTotal(prev => (prev || 0) + update.total_price);
      }
      // Show current item name
      if (update.notes) {
        const match = update.notes.match(/[""]([^""]+)[""]/);
        if (match) setCurrentItemName(match[1].slice(0, 50));
      }
    };
  }, [boqFileId, qc]);

  const { data: items = [], isLoading: itemsLoading } = useBoQItems(boqFileId);
  const { data: project } = useProject(projectId);
  const { data: boqFiles = [] } = useBoQFiles(projectId);
  const boqFileName = useMemo(() => boqFiles.find(f => f.id === boqFileId)?.name || "BoQ", [boqFiles, boqFileId]);

  // Upload is now handled by CreateBoQDialog at project level

  const handleIntegrityCheck = useCallback(async () => {
    if (!boqFileId) return;
    setCheckingIntegrity(true);
    try {
      const report = await runIntegrityCheck(boqFileId);
      setIntegrityReport(report);
      setIntegrityReportOpen(true);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCheckingIntegrity(false);
    }
  }, [boqFileId]);

  const handlePricing = useCallback(async () => {
    if (!boqFileId) return;
    setPricing(true);
    setPricingProgress({ current: 0, total: 0 });
    setRunningTotal(0);
    setCurrentItemName("");
    try {
      const onItemPricedCb = makeOnItemPriced();
      const result = await runPricingEngine(boqFileId, cities, (current, total) => {
        setPricingProgress({ current, total });
      }, "government_civil", onItemPricedCb);
      toast.success(`Priced ${result.itemCount} items — Total: ${formatCurrency(result.totalValue)}`);
      // Calculate BMS points after pricing
      const latestItems = qc.getQueryData<any[]>(["boq-items", boqFileId]) || items;
      const bms = calculateBMSCost({ items: latestItems });
      setBmsResult(bms.hasBMSItems ? bms : null);
      await Promise.all([
        qc.refetchQueries({ queryKey: ["boq-items", boqFileId], type: "active" }),
        qc.refetchQueries({ queryKey: ["projects", projectId], type: "active" }),
        qc.refetchQueries({ queryKey: ["project-consistency", projectId], type: "active" }),
        qc.invalidateQueries({ queryKey: ["projects"] }),
      ]);
      // Auto-run integrity check after pricing
      const report = await runIntegrityCheck(boqFileId);
      setIntegrityReport(report);
      setIntegrityReportOpen(true);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setPricing(false);
      setRunningTotal(null);
      setCurrentItemName("");
    }
  }, [boqFileId, cities, qc, makeOnItemPriced]);

  const handleRePrice = useCallback(async () => {
    if (!boqFileId) return;
    setPricing(true);
    setPricingProgress({ current: 0, total: 0 });
    setRunningTotal(0);
    setCurrentItemName("");
    try {
      // 1. Snapshot current prices for audit trail
      const pricedItems = items.filter(i => i.unit_rate && i.unit_rate > 0);
      const { data: { user } } = await supabase.auth.getUser();
      if (user && pricedItems.length > 0) {
        const snapshots = pricedItems.map(item => ({
          item_id: item.id,
          old_price: item.unit_rate,
          new_price: null,
          changed_by: user.id,
          change_reason: "إعادة تسعير المشروع",
        }));
        for (let i = 0; i < snapshots.length; i += 100) {
          await supabase.from("price_change_log").insert(snapshots.slice(i, i + 100));
        }
      }

      // 2. CLEAN STATE — zero out all pricing data before re-pricing
      const resetCount = await resetBoQPricing(boqFileId);
      console.log(`🧹 Reset ${resetCount} items to clean state`);

      // 3. Clear query cache to prevent stale data
      qc.removeQueries({ queryKey: ["boq-items", boqFileId] });

      // 4. Run pricing engine on clean data
      const onItemPricedCb = makeOnItemPriced();
      const result = await runPricingEngine(boqFileId, cities, (current, total) => {
        setPricingProgress({ current, total });
      }, "government_civil", onItemPricedCb);

      // 5. Update audit trail with new prices
      if (user) {
        const { data: updatedItems } = await supabase
          .from("boq_items")
          .select("id, unit_rate")
          .eq("boq_file_id", boqFileId);
        
        if (updatedItems) {
          const updates = pricedItems
            .map(old => {
              const updated = updatedItems.find(u => u.id === old.id);
              if (updated && updated.unit_rate !== old.unit_rate) {
                return supabase.from("price_change_log")
                  .update({ new_price: updated.unit_rate })
                  .eq("item_id", old.id)
                  .eq("changed_by", user.id)
                  .eq("change_reason", "إعادة تسعير المشروع")
                  .is("new_price", null);
              }
              return null;
            })
            .filter(Boolean);
          if (updates.length > 0) await Promise.all(updates);
        }
      }

      toast.success(`تم إعادة التسعير: ${result.itemCount} بند — الإجمالي: ${formatCurrency(result.totalValue)}`);
      
      await Promise.all([
        qc.refetchQueries({ queryKey: ["boq-items", boqFileId], type: "active" }),
        qc.refetchQueries({ queryKey: ["projects", projectId], type: "active" }),
        qc.refetchQueries({ queryKey: ["project-consistency", projectId], type: "active" }),
        qc.invalidateQueries({ queryKey: ["projects"] }),
      ]);
      // Auto-run integrity check after re-pricing
      const report = await runIntegrityCheck(boqFileId);
      setIntegrityReport(report);
      setIntegrityReportOpen(true);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setPricing(false);
      setRunningTotal(null);
      setCurrentItemName("");
    }
  }, [boqFileId, cities, items, qc, projectId, makeOnItemPriced]);

  const handleRepriceUnpriced = useCallback(async () => {
    if (!boqFileId) return;
    setPricing(true);
    setPricingProgress({ current: 0, total: 0 });
    setRunningTotal(0);
    setCurrentItemName("");
    try {
      const onItemPricedCb = makeOnItemPriced();
      const result = await repriceUnpricedItems(boqFileId, cities, (current, total) => {
        setPricingProgress({ current, total });
      }, onItemPricedCb);
      if (result.pricedCount > 0) {
        toast.success(`تم تسعير ${result.pricedCount} بند — ${result.stillUnpricedCount} بند لا يزال بدون سعر`);
      } else {
        toast.info("لم يتم العثور على تطابقات جديدة للبنود غير المسعّرة");
      }
      await Promise.all([
        qc.refetchQueries({ queryKey: ["boq-items", boqFileId], type: "active" }),
        qc.refetchQueries({ queryKey: ["projects", projectId], type: "active" }),
        qc.refetchQueries({ queryKey: ["project-consistency", projectId], type: "active" }),
        qc.invalidateQueries({ queryKey: ["projects"] }),
      ]);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setPricing(false);
      setRunningTotal(null);
      setCurrentItemName("");
    }
  }, [boqFileId, cities, qc, projectId, makeOnItemPriced]);

  const handleExport = async () => {
    if (items.length === 0) return;

    const unmatchedCount = items.filter(i => i.status === "unmatched" || i.source === "no_match").length;
    const reviewCount = items.filter(i => i.status === "needs_review").length;

    if (unmatchedCount > 0) {
      toast.warning(`${unmatchedCount} بند غير مطابق 🔴 — مضمّن في التصدير للمراجعة اليدوية`);
    }
    if (reviewCount > 0) {
      toast.warning(`${reviewCount} بند يحتاج مراجعة 🟡`);
    }

    try {
      const projectName = project?.name || "Project";
      await exportStyledBoQ(items as any, projectName, boqFileName || "BoQ");
      toast.success("تم تنزيل ملف Excel بنجاح");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleEtemadExport = async () => {
    if (items.length === 0) return;
    try {
      const boqFile = boqFiles.find(f => f.id === boqFileId);
      if (!boqFile?.file_path) {
        toast.error("لا يوجد ملف أصلي مرتبط بهذا الـ BoQ");
        return;
      }
      await exportEtemad(boqFileId, items as any, boqFile.file_path, boqFile.name);
      toast.success("تم تصدير ملف الاعتماد بنجاح ✅");
    } catch (err: any) {
      toast.error(err.message || "فشل تصدير الاعتماد");
    }
  };

  const handleExportUnpriced = async () => {
    const unpricedItems = items.filter(i => !i.unit_rate || i.unit_rate === 0);
    if (unpricedItems.length === 0) {
      toast.info("لا توجد بنود غير مسعّرة للتصدير");
      return;
    }
    try {
      const projectName = project?.name || "Project";
      const date = new Date().toISOString().split("T")[0];
      await exportStyledBoQ(unpricedItems as any, `${projectName}_unpriced_${date}`, boqFileName || "BoQ");
      toast.success(`تم تصدير ${unpricedItems.length} بند غير مسعّر`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleRevalidate = useCallback(async () => {
    if (!boqFileId) return;
    setRevalidating(true);
    try {
      await Promise.all([
        qc.refetchQueries({ queryKey: ["boq-items", boqFileId], type: "active" }),
        qc.refetchQueries({ queryKey: ["boq-files", projectId], type: "active" }),
        qc.refetchQueries({ queryKey: ["projects", projectId], type: "active" }),
        qc.refetchQueries({ queryKey: ["project-consistency", projectId], type: "active" }),
        qc.invalidateQueries({ queryKey: ["projects"] }),
      ]);
      toast.success("Project revalidated");
    } catch (err: any) {
      toast.error(err.message || "Revalidation failed");
    } finally {
      setRevalidating(false);
    }
  }, [boqFileId, projectId, qc]);

  const handleSaveUnit = useCallback(async (item: any) => {
    const newUnit = editingUnitValue.trim();
    setEditingUnitId(null);
    if (!newUnit || newUnit === item.unit) return;
    try {
      const { error } = await supabase.from("boq_items").update({ unit: newUnit }).eq("id", item.id);
      if (error) throw error;
      // Sync to linked rate library
      if (item.linked_rate_id) {
        await supabase.from("rate_library").update({ unit: newUnit, updated_at: new Date().toISOString() }).eq("id", item.linked_rate_id);
        toast.success("تم تعديل الوحدة — تم تحديث مكتبة الأسعار");
      } else {
        toast.success("تم تعديل الوحدة");
      }
      qc.invalidateQueries({ queryKey: ["boq-items", boqFileId] });
      qc.invalidateQueries({ queryKey: ["price-library"] });
    } catch (err: any) {
      toast.error("فشل تعديل الوحدة: " + (err.message || ""));
    }
  }, [editingUnitValue, boqFileId, qc]);
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "approved": return <CheckCircle className="w-4 h-4 text-emerald-500" />;
      case "review": return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case "conflict": return <XCircle className="w-4 h-4 text-red-500" />;
      default: return <Info className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getConfidenceClass = (confidence?: number | null) => {
    if (!confidence) return "confidence-low";
    if (confidence >= 85) return "confidence-high";
    if (confidence >= 60) return "confidence-medium";
    return "confidence-low";
  };

  const totalValue = items.reduce((sum, item) => sum + (item.total_price || 0), 0);
  const modeLabels: Record<PricingMode, string> = { review: t("review"), smart: t("smart"), auto: t("auto") };
  const exportSummary = useMemo(() => buildBoQExportSummary(items), [items]);
  const { data: consistency } = useProjectConsistency(projectId, project?.total_value ?? 0);

  // ─── Advanced Filtering (UI-level only) ───
  const toggleFilter = useCallback((f: string) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f); else next.add(f);
      return next;
    });
  }, []);

  const filteredItems = useMemo(() => {
    if (activeFilters.size === 0) return items;

    let result = [...items];

    // Build top-20 sets if needed
    const top20UnitRate = activeFilters.has("top_unit_rate")
      ? new Set(
          [...items]
            .filter(i => i.unit_rate && i.unit_rate > 0)
            .sort((a, b) => (b.unit_rate || 0) - (a.unit_rate || 0))
            .slice(0, 20)
            .map(i => i.id)
        )
      : null;

    const top20Total = activeFilters.has("top_total")
      ? new Set(
          [...items]
            .filter(i => i.total_price && i.total_price > 0)
            .sort((a, b) => (b.total_price || 0) - (a.total_price || 0))
            .slice(0, 20)
            .map(i => i.id)
        )
      : null;

    result = result.filter(item => {
      if (top20UnitRate && !top20UnitRate.has(item.id)) return false;
      if (top20Total && !top20Total.has(item.id)) return false;
      if (activeFilters.has("low_confidence") && !(item.confidence !== null && item.confidence < 70)) return false;
      if (activeFilters.has("unapproved") && !(item.status !== "approved" && item.status !== "descriptive" && isPriceableItem(item))) return false;
      if (activeFilters.has("unpriced") && !(!item.unit_rate || item.unit_rate === 0)) return false;
      if (activeFilters.has("manual_override") && item.override_type !== "manual") return false;
      if (activeFilters.has("approved_library") && item.source !== "approved_library") return false;
      if (activeFilters.has("pending") && item.status !== "pending") return false;
      return true;
    });

    return result;
  }, [items, activeFilters]);

  const canExport = exportSummary.canExport;

  // Auto-calculate BMS result when items load
  useEffect(() => {
    if (items.length > 0) {
      const bms = calculateBMSCost({ items });
      setBmsResult(bms.hasBMSItems ? bms : null);
    }
  }, [items]);

  useEffect(() => {
    if (!consistency || consistency.consistent) {
      autoFixAttempted.current = false;
      setAutoFixFailed(false);
      return;
    }
    if (autoFixAttempted.current) return;
    autoFixAttempted.current = true;
    fixConsistency(projectId, boqFileId)
      .then(() => {
        qc.invalidateQueries({ queryKey: ["projects", projectId] });
        qc.invalidateQueries({ queryKey: ["project-consistency", projectId] });
        qc.invalidateQueries({ queryKey: ["projects"] });
      })
      .catch(() => setAutoFixFailed(true));
  }, [consistency?.consistent, projectId, boqFileId, qc]);

  const handleFixNow = useCallback(async () => {
    if (!boqFileId) return;
    setFixing(true);
    try {
      const newTotal = await fixConsistency(projectId, boqFileId);
      await Promise.all([
        qc.refetchQueries({ queryKey: ["boq-items", boqFileId], type: "active" }),
        qc.refetchQueries({ queryKey: ["projects", projectId], type: "active" }),
        qc.refetchQueries({ queryKey: ["project-consistency", projectId], type: "active" }),
        qc.invalidateQueries({ queryKey: ["projects"] }),
      ]);
      toast.success(`Totals synced: ${formatCurrency(newTotal)}`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setFixing(false);
    }
  }, [boqFileId, projectId, qc]);

  const isLoading = itemsLoading;
  const hasItems = items.length > 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }


  // Empty state — no items for this specific BoQ file
  if (!hasItems) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
          <FileText className="w-7 h-7 text-primary" />
        </div>
        <h3 className="text-lg font-semibold mb-2">{t("noBoQFiles")}</h3>
        <p className="text-muted-foreground max-w-sm mb-5">{t("noBoQDesc")}</p>
      </div>
    );
  }

  // Pricing progress stats
  const pricedCount = items.filter(i => classifyBoQRow(i).type === "priced" && i.unit_rate && i.unit_rate > 0).length;
  const priceableCount = items.filter(i => classifyBoQRow(i).type === "priced").length;
  const pricingPercent = priceableCount > 0 ? Math.round((pricedCount / priceableCount) * 100) : 0;

  return (
    <div>
      <BudgetDistributionPanel projectId={projectId} />

      {/* Pricing progress bar */}
      {priceableCount > 0 && (
        <div className="mb-4 p-3 border rounded-lg bg-card">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium">نسبة التسعير: {pricedCount}/{priceableCount} بند</span>
            <span className="text-xs font-semibold">{pricingPercent}%</span>
          </div>
          <Progress value={pricingPercent} className="h-2" />
          <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">✅ مسعّر: {pricedCount}</span>
            <span className="flex items-center gap-1">🔴 غير مسعّر: {priceableCount - pricedCount}</span>
          </div>
        </div>
      )}

      {/* Pricing progress */}
      {pricing && (
        <div className="stat-card mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              جاري التسعير...
            </span>
            <div className="flex items-center gap-3">
              {runningTotal !== null && runningTotal > 0 && (
                <span className="text-xs font-semibold text-primary">
                  الإجمالي: {formatCurrency(runningTotal)}
                </span>
              )}
              <span className="text-xs text-muted-foreground">{pricingProgress.current}/{pricingProgress.total}</span>
            </div>
          </div>
          <Progress value={pricingProgress.total > 0 ? (pricingProgress.current / pricingProgress.total) * 100 : 0} className="h-2" />
          {currentItemName && (
            <div className="text-[11px] text-muted-foreground mt-1.5 truncate" dir="rtl">
              ⏳ {currentItemName}
            </div>
          )}
        </div>
      )}

      {/* BMS Points Analysis */}
      {bmsResult && bmsResult.hasBMSItems && (
        <BMSAnalysisPanel bmsResult={bmsResult} />
      )}

      {hasItems && autoFixFailed && !consistency.consistent && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-3 mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-destructive shrink-0" />
            <div>
              <div className="text-sm font-medium text-destructive">Data inconsistency detected</div>
              <div className="text-xs text-muted-foreground">
                Aggregated BoQ total: {formatCurrency(consistency.tableTotal)} · Saved project total: {formatCurrency(consistency.dbTotal)} · Difference: {formatCurrency(consistency.difference)}
              </div>
            </div>
          </div>
          <Button variant="destructive" size="sm" className="gap-1" onClick={handleFixNow} disabled={fixing}>
            <Wrench className={`w-3.5 h-3.5 ${fixing ? "animate-spin" : ""}`} />
            {fixing ? "Fixing..." : "Fix Now"}
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">{t("pricingMode")}</span>
          {(["review", "smart", "auto"] as PricingMode[]).map((m) => (
            <Button key={m} variant={mode === m ? "default" : "outline"} size="sm" onClick={() => setMode(m)}>
              {modeLabels[m]}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {totalValue > 0 && <span className="text-sm font-semibold">{t("total")} {formatCurrency(totalValue)}</span>}
          {!isArchived && (
            <>
              <Button size="sm" className="gap-1" onClick={handlePricing} disabled={pricing || !hasItems}>
                <Play className="w-3 h-3" /> {t("priceAll")}
              </Button>
              {pricedCount > 0 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1" disabled={pricing}>
                      <RotateCcw className="w-3 h-3" /> إعادة التسعير
                    </Button>
                  </AlertDialogTrigger>
                    <AlertDialogContent dir="rtl">
                    <AlertDialogHeader>
                      <AlertDialogTitle>إعادة تسعير شاملة (تصفير كامل)</AlertDialogTitle>
                      <AlertDialogDescription>
                        ⚠️ سيتم تصفير جميع الأسعار والتوزيعات والتعديلات اليدوية أولاً، ثم إعادة التسعير من مكتبة الأسعار الحالية بحالة نظيفة تماماً.
                        سيتم تسجيل جميع التغييرات في سجل المراجعة.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>إلغاء</AlertDialogCancel>
                      <AlertDialogAction onClick={handleRePrice}>تأكيد إعادة التسعير</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              {priceableCount - pricedCount > 0 && (
                <Button variant="secondary" size="sm" className="gap-1" onClick={handleRepriceUnpriced} disabled={pricing}>
                  <Play className="w-3 h-3" /> تسعير غير المسعّرة ({priceableCount - pricedCount})
                </Button>
              )}
              {pricedCount > 0 && (
                <Button variant="outline" size="sm" className="gap-1" onClick={handleIntegrityCheck} disabled={checkingIntegrity || pricing}>
                  {checkingIntegrity ? <Loader2 className="w-3 h-3 animate-spin" /> : <Shield className="w-3 h-3" />}
                  🛡️ فحص السلامة
                </Button>
              )}
            </>
          )}
          {hasItems && (
            <>
              <Button variant="outline" size="sm" className="gap-1" onClick={handleExport} disabled={items.length === 0}>
                <Download className="w-3 h-3" /> {t("export")}
              </Button>
              <Button variant="outline" size="sm" className="gap-1" onClick={handleExportUnpriced}>
                <ListX className="w-3 h-3" /> تصدير غير المسعّر
              </Button>
              <Button variant="outline" size="sm" className="gap-1 border-emerald-600 text-emerald-600 hover:bg-emerald-50" onClick={handleEtemadExport}>
                <Shield className="w-3 h-3" /> تصدير اعتماد
              </Button>
            </>
          )}
        </div>
      </div>

      {hasItems && (
        <div className="rounded-lg border bg-muted/30 p-3 mb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">Export readiness summary</div>
              <div className="text-xs text-muted-foreground">Valid priced items: {exportSummary.pricedItemsCount} · Descriptive rows skipped: {exportSummary.descriptiveRowsSkippedCount} · Rows with warnings: {exportSummary.warningRowsCount}</div>
            </div>
            <Badge variant={exportSummary.exportStatus === "warning" ? "secondary" : "default"}>
              {exportSummary.exportStatus === "ready" ? "Ready" : "Warning"}
            </Badge>
          </div>
          {exportSummary.warningMessage && (
            <div className="text-xs text-muted-foreground mt-2">{exportSummary.warningMessage}</div>
          )}
          {exportSummary.errorMessage && (
            <div className="text-xs mt-2">{exportSummary.errorMessage}</div>
          )}
          {exportSummary.warningRows.length > 0 && (
            <div className="mt-3 rounded-md border bg-background/70 p-3">
              <div className="text-xs font-medium mb-2">Warnings</div>
              <div className="space-y-2">
                {exportSummary.warningRows.slice(0, 3).map((row, index) => (
                  <div key={`${row.rowNumber ?? "row"}-${row.itemCode}-${index}`} className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Row {row.rowNumber ?? "—"}</span>
                    {row.itemCode ? ` · ${row.itemCode}` : ""}
                    {row.description ? ` · ${row.description}` : ""}
                    {` · ${row.reason}`}
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="gap-1" onClick={() => setBlockingRowsOpen(true)}>
                  <ListX className="w-3.5 h-3.5" /> View Warnings
                </Button>
                <Button variant="outline" size="sm" className="gap-1" onClick={handleRevalidate} disabled={revalidating}>
                  <RefreshCw className={`w-3.5 h-3.5 ${revalidating ? "animate-spin" : ""}`} /> Revalidate Project
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Advanced Filter Bar */}
      {hasItems && (
        <div className="flex flex-wrap items-center gap-2 mb-3 p-2 rounded-lg border bg-muted/20">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground ml-1">فلترة:</span>
          {[
            { key: "top_unit_rate", label: "الأعلى سعر وحدة", color: "bg-primary/10 text-primary border-primary/30" },
            { key: "top_total", label: "الأعلى إجمالي", color: "bg-primary/10 text-primary border-primary/30" },
            { key: "low_confidence", label: "موثوقية منخفضة", color: "bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-700" },
            { key: "unapproved", label: "غير معتمد", color: "bg-orange-50 text-orange-700 border-orange-300 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-700" },
            { key: "unpriced", label: "غير مسعّر", color: "bg-destructive/10 text-destructive border-destructive/30" },
            { key: "manual_override", label: "🔒 يدوي معتمد", color: "bg-warning/10 text-warning border-warning/30" },
            { key: "approved_library", label: "✅ مكتبة معتمدة", color: "bg-success/10 text-success border-success/30" },
            { key: "pending", label: "⏳ pending", color: "bg-muted text-muted-foreground border-border" },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => toggleFilter(f.key)}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-all ${
                activeFilters.has(f.key)
                  ? f.color + " font-medium shadow-sm"
                  : "bg-background text-muted-foreground border-border hover:bg-muted"
              }`}
            >
              {f.label}
            </button>
          ))}
          {activeFilters.size > 0 && (
            <>
              <span className="text-[11px] text-muted-foreground mx-1">
                عرض {filteredItems.length} من {items.length} بند
              </span>
              <button
                onClick={() => setActiveFilters(new Set())}
                className="text-[11px] px-2 py-1 rounded-full border border-border bg-background text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all flex items-center gap-1"
              >
                <X className="w-3 h-3" /> مسح
              </button>
            </>
          )}
        </div>
      )}

      <div className="flex items-center gap-4 mb-3 text-xs text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-muted inline-block" /> {t("originalProtected")}</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-accent inline-block" /> {t("pricingSystem")}</span>
        <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-emerald-500" /> {t("approved")}</span>
        <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-amber-500" /> {t("reviewNeeded")}</span>
        <span className="flex items-center gap-1"><XCircle className="w-3 h-3 text-red-500" /> {t("conflict")}</span>
        <span className="flex items-center gap-1"><Lock className="w-3 h-3 text-warning" /> يدوي مقفل</span>
        <span className="flex items-center gap-1"><BadgeCheck className="w-3 h-3 text-success" /> مكتبة معتمدة</span>
      </div>

      <div className="border rounded-lg overflow-auto max-h-[65vh] scrollbar-thin bg-card">
        <table className="boq-table">
          <thead>
            <tr>
              <th className="w-8">#</th>
              {items.some(i => i.section_no && i.section_no !== "") && <th className="protected-col w-20">رقم القسم</th>}
              <th className="protected-col">{t("itemNo")}</th>
              <th className="protected-col min-w-[280px]">{t("description")} (وصف البند)</th>
              <th className="w-16 text-center">المطابقة</th>
              <th className="protected-col w-16">{t("unit")}</th>
              <th className="protected-col w-24 text-right">{t("qty")}</th>
              <th className="pricing-col w-28">الفئة</th>
              <th className="pricing-col w-24 text-right">{t("unitRate")}</th>
              <th className="pricing-col w-28 text-right">{t("total")}</th>
              <th className="w-10"></th>
              {!ownerMaterials && <th className="pricing-col w-20 text-right">{t("mat")}</th>}
              <th className="pricing-col w-20 text-right">{t("labor")}</th>
              <th className="pricing-col w-20 text-right">{t("equip")}</th>
              <th className="pricing-col w-20 text-right">{t("logis")}</th>
              <th className="pricing-col w-16 text-right">{t("risk")}</th>
              <th className="pricing-col w-16 text-right">{t("profit")}</th>
              <th className="w-20 text-center">{t("conf")}</th>
              <th className="w-12 text-center">{t("status")}</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item, index) => {
              const rowClassification = classifyBoQRow(item);
              const isPriced = rowClassification.type === "priced";
              const isDescriptive = rowClassification.type === "descriptive";
              const hasWarnings = rowClassification.warnings && rowClassification.warnings.length > 0;
              const detected = isPriced ? detectCategory(item.description, item.description_en) : null;
              const catLabel = detected?.category.replace(/_/g, " ") || "";
              return (
              <tr key={item.id} className={`group ${!isPriced ? "opacity-50 bg-muted/30" : ""}`}>
                <td className="text-muted-foreground">{index + 1}</td>
                {items.some(i => i.section_no && i.section_no !== "") && <td className="protected-col font-mono text-xs">{item.section_no}</td>}
                <td className="protected-col font-mono text-xs">{item.item_no}</td>
                <td className="protected-col" dir="rtl">
                  <div className="text-sm leading-relaxed">{item.description}</div>
                  {item.description_en && <div className="text-[11px] text-muted-foreground mt-0.5">{item.description_en}</div>}
                  {isDescriptive && <Badge variant="outline" className="text-[9px] mt-1 text-muted-foreground">وصف / Description</Badge>}
                  {hasWarnings && <Badge variant="secondary" className="text-[9px] mt-1">Needs Review</Badge>}
                  {item.status === "unmatched" && (
                    <div className="text-[10px] mt-1 text-destructive font-medium">🔴 غير موجود في المكتبة — أدخل السعر يدوياً</div>
                  )}
                </td>
                <td className="text-center">
                  {isPriced && (
                    item.linked_rate_id && item.source === "library-high" ? (
                      <span title="موجود في المكتبة — معتمد">✅</span>
                    ) : item.linked_rate_id && item.source === "library-medium" ? (
                      <span title="اقتراح — يحتاج مراجعة">🟡</span>
                    ) : item.source === "no_match" || item.status === "unmatched" ? (
                      <span title="غير موجود في المكتبة — أدخل السعر يدوياً">🔴</span>
                    ) : item.unit_rate && item.unit_rate > 0 ? (
                      <span title="مسعّر">🟢</span>
                    ) : (
                      <span title="غير مسعّر">🔴</span>
                    )
                  )}
                </td>
                <td className="protected-col text-center text-xs" dir="rtl">
                  {editingUnitId === item.id ? (
                    <Input
                      className="h-7 w-20 text-xs text-center"
                      value={editingUnitValue}
                      onChange={(e) => setEditingUnitValue(e.target.value)}
                      onBlur={() => handleSaveUnit(item)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveUnit(item);
                        if (e.key === "Escape") setEditingUnitId(null);
                      }}
                      autoFocus
                    />
                  ) : (
                    <span
                      className="cursor-pointer group/unit inline-flex items-center gap-1"
                      onDoubleClick={() => {
                        if (!isArchived && isPriced) {
                          setEditingUnitId(item.id);
                          setEditingUnitValue(item.unit);
                        }
                      }}
                    >
                      {item.unit}
                      {!isArchived && isPriced && (
                        <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover/unit:opacity-100 transition-opacity" />
                      )}
                    </span>
                  )}
                </td>
                <td className="protected-col text-right font-mono text-xs">{formatNumber(item.quantity, 0)}</td>
                <td className="pricing-col">
                  {isPriced && (
                    <Badge variant="secondary" className="text-[10px] font-normal capitalize whitespace-nowrap">
                      {catLabel}
                    </Badge>
                  )}
                </td>
                <td className="pricing-col text-right font-mono text-xs font-medium">{isPriced && item.unit_rate ? formatNumber(item.unit_rate) : "—"}</td>
                <td className="pricing-col text-right font-mono text-xs font-semibold">{isPriced && item.total_price ? formatCurrency(item.total_price) : "—"}</td>
                <td className="text-center">
                  {isPriced && (
                    <Button variant="ghost" size="icon" className="w-7 h-7 text-foreground" onClick={() => setSelectedItem(item)}>
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </td>
                {!ownerMaterials && <td className="pricing-col text-right font-mono text-[11px]">{isPriced && item.materials ? formatNumber(item.materials) : "—"}</td>}
                <td className="pricing-col text-right font-mono text-[11px]">{isPriced && item.labor ? formatNumber(item.labor) : "—"}</td>
                <td className="pricing-col text-right font-mono text-[11px]">{isPriced && item.equipment ? formatNumber(item.equipment) : "—"}</td>
                <td className="pricing-col text-right font-mono text-[11px]">{isPriced && item.logistics ? formatNumber(item.logistics) : "—"}</td>
                <td className="pricing-col text-right font-mono text-[11px]">{isPriced && item.risk ? formatNumber(item.risk) : "—"}</td>
                <td className="pricing-col text-right font-mono text-[11px]">{isPriced && item.profit ? formatNumber(item.profit) : "—"}</td>
                <td className="text-center">
                  {isPriced && item.confidence && (
                    <span className={`confidence-badge ${getConfidenceClass(item.confidence)}`}>
                      {item.confidence}%
                    </span>
                  )}
                </td>
                <td className="text-center">
                  {isPriced ? (
                    <div className="flex items-center justify-center gap-1">
                      {item.override_type === "manual" && (
                        <span title={`معتمد بواسطة ${item.override_by || '—'} بتاريخ ${item.override_at ? new Date(item.override_at).toLocaleDateString('ar-SA') : '—'} — مقفل`}>
                          <Lock className="w-3.5 h-3.5 text-warning" />
                        </span>
                      )}
                      {item.source === "approved_library" && (
                        <span title="سعر معتمد من مكتبة مقفلة — لن يتغير تلقائياً">
                          <BadgeCheck className="w-3.5 h-3.5 text-success" />
                        </span>
                      )}
                      {getStatusIcon(item.status)}
                    </div>
                  ) : <span className="text-[10px] text-muted-foreground">—</span>}
                </td>
                <td>
                  <div className="flex items-center gap-0.5">
                    {isPriced && !isArchived && (
                      <Button
                        variant="ghost" size="icon"
                        className="w-7 h-7 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="إعادة تسعير هذا البند"
                        disabled={repricingItemId === item.id}
                        onClick={async () => {
                          setRepricingItemId(item.id);
                          try {
                            const result = await repriceSingleItem(boqFileId, item.id, cities);
                            if (result.success) {
                              // Immediately update cache with the new price
                              qc.setQueryData(["boq-items", boqFileId], (old: any[] | undefined) => {
                                if (!old) return old;
                                return old.map(row => row.id === item.id ? {
                                  ...row,
                                  unit_rate: result.unitRate,
                                  total_price: result.totalPrice,
                                  confidence: result.confidence,
                                  source: result.source,
                                  status: result.confidence >= 70 ? "approved" : "needs_review",
                                } : row);
                              });
                              toast.success(`✅ تم التسعير: ${result.matchedName} — ${formatCurrency(result.totalPrice || 0)} (🎯 ${result.confidence}%)`);
                            } else {
                              toast.warning("🔴 لم يتم العثور على تطابق في المكتبة");
                            }
                            // Refetch to get full server state
                            await qc.refetchQueries({ queryKey: ["boq-items", boqFileId] });
                            await qc.refetchQueries({ queryKey: ["projects", projectId] });
                            qc.invalidateQueries({ queryKey: ["projects"] });
                            // Recalculate BMS after refetch completes
                            const latestItems = qc.getQueryData<any[]>(["boq-items", boqFileId]) || items;
                            const bms = calculateBMSCost({ items: latestItems });
                            setBmsResult(bms.hasBMSItems ? bms : null);
                          } catch (err: any) {
                            toast.error(err.message);
                          } finally {
                            setRepricingItemId(null);
                          }
                        }}
                      >
                        {repricingItemId === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedItem && <PriceBreakdownModal item={selectedItem} projectId={projectId} ownerMaterials={ownerMaterials} onClose={() => setSelectedItem(null)} onUpdated={() => {
        qc.invalidateQueries({ queryKey: ["boq-items", boqFileId] });
        qc.invalidateQueries({ queryKey: ["projects"] });
      }} />}

      <BoQBlockingRowsDialog
        open={blockingRowsOpen}
        onOpenChange={setBlockingRowsOpen}
        rows={exportSummary.warningRows}
        onRevalidate={handleRevalidate}
        revalidating={revalidating}
      />

      <PricingIntegrityReport
        open={integrityReportOpen}
        onOpenChange={setIntegrityReportOpen}
        report={integrityReport}
        boqFileId={boqFileId}
        onFixed={() => {
          qc.invalidateQueries({ queryKey: ["boq-items", boqFileId] });
          qc.invalidateQueries({ queryKey: ["projects"] });
        }}
      />
    </div>
  );
}
