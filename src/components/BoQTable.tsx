import { useState, useCallback, useMemo } from "react";
import { Eye, Download, CheckCircle, AlertTriangle, XCircle, FileText, Info, Loader2, Play, RefreshCw, ListX, ShieldAlert, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useBoQItems, useProject } from "@/hooks/useSupabase";
import { exportBoQExcel } from "@/lib/boqParser";
import { runPricingEngine, detectCategory, isPriceableItem } from "@/lib/pricingEngine";
import { formatNumber, formatCurrency } from "@/lib/mockData";
import PriceBreakdownModal from "./PriceBreakdownModal";
import { useLanguage } from "@/contexts/LanguageContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { buildBoQExportSummary, classifyBoQRow } from "@/lib/boqRowClassification";
import BoQBlockingRowsDialog from "./BoQBlockingRowsDialog";
import { checkConsistency, fixConsistency } from "@/hooks/useConsistencyCheck";

type PricingMode = "review" | "smart" | "auto";

interface BoQTableProps {
  boqFileId: string;
  projectId: string;
  cities: string[];
}

export default function BoQTable({ boqFileId, projectId, cities }: BoQTableProps) {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const [mode, setMode] = useState<PricingMode>("review");
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [pricing, setPricing] = useState(false);
  const [pricingProgress, setPricingProgress] = useState({ current: 0, total: 0 });
  const [blockingRowsOpen, setBlockingRowsOpen] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  const [fixing, setFixing] = useState(false);

  const { data: items = [], isLoading: itemsLoading } = useBoQItems(boqFileId);
  const { data: project } = useProject(projectId);

  // Upload is now handled by CreateBoQDialog at project level

  const handlePricing = useCallback(async () => {
    if (!boqFileId) return;
    setPricing(true);
    setPricingProgress({ current: 0, total: 0 });
    try {
      const result = await runPricingEngine(boqFileId, cities, (current, total) => {
        setPricingProgress({ current, total });
      });
      toast.success(`Priced ${result.itemCount} items — Total: ${formatCurrency(result.totalValue)}`);
      qc.invalidateQueries({ queryKey: ["boq-items", boqFileId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["projects", projectId] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setPricing(false);
    }
  }, [boqFileId, cities, qc]);

  const handleExport = async () => {
    if (items.length === 0) return;
    if (!consistency.consistent) {
      toast.error("Data inconsistency detected. Fix totals before exporting.");
      return;
    }
    if (!exportSummary.canExport) {
      if (exportSummary.blockingRows.length > 0) setBlockingRowsOpen(true);
      toast.error(exportSummary.errorMessage);
      return;
    }
    try {
      if (exportSummary.warningMessage) toast.warning(exportSummary.warningMessage);
      await exportBoQExcel(items, `Priced_BoQ_${Date.now()}.xlsx`, boqFileId);
      toast.success("Excel file downloaded");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleRevalidate = useCallback(async () => {
    if (!boqFileId) return;
    setRevalidating(true);
    try {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["boq-items", boqFileId] }),
        qc.invalidateQueries({ queryKey: ["boq-files", projectId] }),
        qc.invalidateQueries({ queryKey: ["projects"] }),
      ]);
      toast.success("Project revalidated");
    } catch (err: any) {
      toast.error(err.message || "Revalidation failed");
    } finally {
      setRevalidating(false);
    }
  }, [boqFileId, projectId, qc]);

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
  const consistency = useMemo(() => checkConsistency(items, project?.total_value ?? 0), [items, project?.total_value]);

  const canExport = exportSummary.canExport && consistency.consistent;

  const handleFixNow = useCallback(async () => {
    if (!boqFileId) return;
    setFixing(true);
    try {
      const newTotal = await fixConsistency(projectId, boqFileId);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["boq-items", boqFileId] }),
        qc.invalidateQueries({ queryKey: ["projects"] }),
        qc.invalidateQueries({ queryKey: ["projects", projectId] }),
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

  return (
    <div>
      

      {/* Pricing progress */}
      {pricing && (
        <div className="stat-card mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Pricing items...
            </span>
            <span className="text-xs text-muted-foreground">{pricingProgress.current}/{pricingProgress.total}</span>
          </div>
          <Progress value={pricingProgress.total > 0 ? (pricingProgress.current / pricingProgress.total) * 100 : 0} className="h-2" />
        </div>
      )}

      {/* Inconsistency alert banner */}
      {hasItems && !consistency.consistent && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-3 mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-destructive shrink-0" />
            <div>
              <div className="text-sm font-medium text-destructive">Data inconsistency detected</div>
              <div className="text-xs text-muted-foreground">
                Table total: {formatCurrency(consistency.tableTotal)} · Database total: {formatCurrency(consistency.dbTotal)} · Difference: {formatCurrency(consistency.difference)}
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
          <Button size="sm" className="gap-1" onClick={handlePricing} disabled={pricing || !hasItems}>
            <Play className="w-3 h-3" /> {t("priceAll")}
          </Button>
          {hasItems && (
            <Button variant="outline" size="sm" className="gap-1" onClick={handleExport} disabled={!canExport}>
              <Download className="w-3 h-3" /> {t("export")}
            </Button>
          )}
        </div>
      </div>

      {hasItems && (
        <div className="rounded-lg border bg-muted/30 p-3 mb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">Export readiness summary</div>
              <div className="text-xs text-muted-foreground">Valid priced items: {exportSummary.pricedItemsCount} · Descriptive rows skipped: {exportSummary.descriptiveRowsSkippedCount} · Invalid payable rows: {exportSummary.invalidRowsCount}</div>
            </div>
            <Badge variant={exportSummary.exportStatus === "blocked" ? "destructive" : exportSummary.exportStatus === "warning" ? "secondary" : "default"}>
              {exportSummary.exportStatus === "ready" ? "Ready" : exportSummary.exportStatus === "warning" ? "Warning" : "Blocked"}
            </Badge>
          </div>
          {exportSummary.warningMessage && (
            <div className="text-xs text-muted-foreground mt-2">{exportSummary.warningMessage}</div>
          )}
          {exportSummary.errorMessage && (
            <div className="text-xs mt-2">{exportSummary.errorMessage}</div>
          )}
          {exportSummary.blockingRows.length > 0 && (
            <div className="mt-3 rounded-md border bg-background/70 p-3">
              <div className="text-xs font-medium mb-2">Blocking reasons</div>
              <div className="space-y-2">
                {exportSummary.blockingRows.slice(0, 3).map((row, index) => (
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
                  <ListX className="w-3.5 h-3.5" /> View Blocking Rows
                </Button>
                <Button variant="outline" size="sm" className="gap-1" onClick={handleRevalidate} disabled={revalidating}>
                  <RefreshCw className={`w-3.5 h-3.5 ${revalidating ? "animate-spin" : ""}`} /> Revalidate Project
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-4 mb-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-muted inline-block" /> {t("originalProtected")}</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-accent inline-block" /> {t("pricingSystem")}</span>
        <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-emerald-500" /> {t("approved")}</span>
        <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-amber-500" /> {t("reviewNeeded")}</span>
        <span className="flex items-center gap-1"><XCircle className="w-3 h-3 text-red-500" /> {t("conflict")}</span>
      </div>

      <div className="border rounded-lg overflow-auto max-h-[65vh] scrollbar-thin bg-card">
        <table className="boq-table">
          <thead>
            <tr>
              <th className="w-8">#</th>
              <th className="protected-col">{t("itemNo")}</th>
              <th className="protected-col min-w-[280px]">{t("description")} (وصف البند)</th>
              <th className="protected-col w-16">{t("unit")}</th>
              <th className="protected-col w-24 text-right">{t("qty")}</th>
              <th className="pricing-col w-28">الفئة</th>
              <th className="pricing-col w-24 text-right">{t("unitRate")}</th>
              <th className="pricing-col w-28 text-right">{t("total")}</th>
              <th className="pricing-col w-20 text-right">{t("mat")}</th>
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
            {items.map((item, index) => {
              const rowClassification = classifyBoQRow(item);
              const isPriced = rowClassification.type === "priced";
              const isDescriptive = rowClassification.type === "descriptive";
              const isInvalid = rowClassification.type === "invalid";
              const detected = isPriced ? detectCategory(item.description, item.description_en) : null;
              const catLabel = detected?.category.replace(/_/g, " ") || "";
              return (
              <tr key={item.id} className={`group ${!isPriced ? "opacity-50 bg-muted/30" : ""}`}>
                <td className="text-muted-foreground">{index + 1}</td>
                <td className="protected-col font-mono text-xs">{item.item_no}</td>
                <td className="protected-col" dir="rtl">
                  <div className="text-sm leading-relaxed">{item.description}</div>
                  {item.description_en && <div className="text-[11px] text-muted-foreground mt-0.5">{item.description_en}</div>}
                  {isDescriptive && <Badge variant="outline" className="text-[9px] mt-1 text-muted-foreground">وصف / Description</Badge>}
                  {isInvalid && <Badge variant="destructive" className="text-[9px] mt-1">Invalid</Badge>}
                </td>
                <td className="protected-col text-center text-xs" dir="rtl">{item.unit}</td>
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
                <td className="pricing-col text-right font-mono text-[11px]">{isPriced && item.materials ? formatNumber(item.materials) : "—"}</td>
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
                <td className="text-center">{isPriced ? getStatusIcon(item.status) : <span className="text-[10px] text-muted-foreground">—</span>}</td>
                <td>
                  {isPriced && (
                    <Button variant="ghost" size="icon" className="w-7 h-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setSelectedItem(item)}>
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedItem && <PriceBreakdownModal item={selectedItem} projectId={projectId} onClose={() => setSelectedItem(null)} onUpdated={() => {
        qc.invalidateQueries({ queryKey: ["boq-items", boqFileId] });
        qc.invalidateQueries({ queryKey: ["projects"] });
      }} />}

      <BoQBlockingRowsDialog
        open={blockingRowsOpen}
        onOpenChange={setBlockingRowsOpen}
        rows={exportSummary.blockingRows}
        onRevalidate={handleRevalidate}
        revalidating={revalidating}
      />
    </div>
  );
}
