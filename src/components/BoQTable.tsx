import { useState, useRef, useCallback, useMemo } from "react";
import { Eye, Download, CheckCircle, AlertTriangle, XCircle, Upload, FileText, Info, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useBoQFiles, useBoQItems } from "@/hooks/useSupabase";
import { uploadAndParseBoQ, exportBoQExcel } from "@/lib/boqParser";
import { runPricingEngine, detectCategory, isPriceableItem } from "@/lib/pricingEngine";
import { formatNumber, formatCurrency } from "@/lib/mockData";
import PriceBreakdownModal from "./PriceBreakdownModal";
import { useLanguage } from "@/contexts/LanguageContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type PricingMode = "review" | "smart" | "auto";

interface BoQTableProps {
  projectId: string;
  cities: string[];
}

export default function BoQTable({ projectId, cities }: BoQTableProps) {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const [mode, setMode] = useState<PricingMode>("review");
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [pricing, setPricing] = useState(false);
  const [pricingProgress, setPricingProgress] = useState({ current: 0, total: 0 });
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: boqFiles = [], isLoading: filesLoading } = useBoQFiles(projectId);
  const activeFile = boqFiles[0]; // Use first/latest BoQ file
  const { data: items = [], isLoading: itemsLoading } = useBoQItems(activeFile?.id);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const result = await uploadAndParseBoQ(projectId, file, setUploadMsg);
      toast.success(`${result.rowCount} items parsed successfully`);
      qc.invalidateQueries({ queryKey: ["boq-files", projectId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
      setUploadMsg("");
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handlePricing = useCallback(async () => {
    if (!activeFile) return;
    setPricing(true);
    setPricingProgress({ current: 0, total: 0 });
    try {
      const result = await runPricingEngine(activeFile.id, cities, (current, total) => {
        setPricingProgress({ current, total });
      });
      toast.success(`Priced ${result.itemCount} items — Total: ${formatCurrency(result.totalValue)}`);
      qc.invalidateQueries({ queryKey: ["boq-items", activeFile.id] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setPricing(false);
    }
  }, [activeFile, cities, qc]);

  const handleExport = async () => {
    if (items.length === 0) return;
    try {
      await exportBoQExcel(items, `Priced_BoQ_${Date.now()}.xlsx`, activeFile?.id);
      toast.success("Excel file downloaded");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

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

  const isLoading = filesLoading || itemsLoading;
  const hasItems = items.length > 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  // Upload progress overlay
  if (uploading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
        <h3 className="text-lg font-semibold mb-2">{uploadMsg || "Processing..."}</h3>
        <p className="text-sm text-muted-foreground">Please wait while the file is being processed</p>
      </div>
    );
  }

  // Empty state
  if (!hasItems && boqFiles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
          <FileText className="w-7 h-7 text-primary" />
        </div>
        <h3 className="text-lg font-semibold mb-2">{t("noBoQFiles")}</h3>
        <p className="text-muted-foreground max-w-sm mb-5">{t("noBoQDesc")}</p>
        <Button variant="outline" className="gap-2" onClick={() => fileRef.current?.click()}>
          <Upload className="w-4 h-4" /> {t("uploadBoQFile")}
        </Button>
        <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} accept=".xlsx,.xls" />
      </div>
    );
  }

  return (
    <div>
      <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} accept=".xlsx,.xls" />

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
          <Button variant="outline" size="sm" className="gap-1" onClick={() => fileRef.current?.click()}>
            <Upload className="w-3 h-3" /> {t("uploadBoQ")}
          </Button>
          <Button size="sm" className="gap-1" onClick={handlePricing} disabled={pricing || !hasItems}>
            <Play className="w-3 h-3" /> {t("priceAll")}
          </Button>
          {hasItems && (
            <Button variant="outline" size="sm" className="gap-1" onClick={handleExport}>
              <Download className="w-3 h-3" /> {t("export")}
            </Button>
          )}
        </div>
      </div>

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
              const detected = detectCategory(item.description, item.description_en);
              const catLabel = detected.category.replace(/_/g, " ");
              return (
              <tr key={item.id} className="group">
                <td className="text-muted-foreground">{index + 1}</td>
                <td className="protected-col font-mono text-xs">{item.item_no}</td>
                <td className="protected-col" dir="rtl">
                  <div className="text-sm leading-relaxed">{item.description}</div>
                  {item.description_en && <div className="text-[11px] text-muted-foreground mt-0.5">{item.description_en}</div>}
                </td>
                <td className="protected-col text-center text-xs" dir="rtl">{item.unit}</td>
                <td className="protected-col text-right font-mono text-xs">{formatNumber(item.quantity, 0)}</td>
                <td className="pricing-col">
                  <Badge variant="secondary" className="text-[10px] font-normal capitalize whitespace-nowrap">
                    {catLabel}
                  </Badge>
                </td>
                <td className="pricing-col text-right font-mono text-xs font-medium">{item.unit_rate ? formatNumber(item.unit_rate) : "—"}</td>
                <td className="pricing-col text-right font-mono text-xs font-semibold">{item.total_price ? formatCurrency(item.total_price) : "—"}</td>
                <td className="pricing-col text-right font-mono text-[11px]">{item.materials ? formatNumber(item.materials) : "—"}</td>
                <td className="pricing-col text-right font-mono text-[11px]">{item.labor ? formatNumber(item.labor) : "—"}</td>
                <td className="pricing-col text-right font-mono text-[11px]">{item.equipment ? formatNumber(item.equipment) : "—"}</td>
                <td className="pricing-col text-right font-mono text-[11px]">{item.logistics ? formatNumber(item.logistics) : "—"}</td>
                <td className="pricing-col text-right font-mono text-[11px]">{item.risk ? formatNumber(item.risk) : "—"}</td>
                <td className="pricing-col text-right font-mono text-[11px]">{item.profit ? formatNumber(item.profit) : "—"}</td>
                <td className="text-center">
                  {item.confidence && (
                    <span className={`confidence-badge ${getConfidenceClass(item.confidence)}`}>
                      {item.confidence}%
                    </span>
                  )}
                </td>
                <td className="text-center">{getStatusIcon(item.status)}</td>
                <td>
                  <Button variant="ghost" size="icon" className="w-7 h-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setSelectedItem(item)}>
                    <Eye className="w-3.5 h-3.5" />
                  </Button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedItem && <PriceBreakdownModal item={selectedItem} projectId={projectId} onClose={() => setSelectedItem(null)} onUpdated={() => {
        if (activeFile) qc.invalidateQueries({ queryKey: ["boq-items", activeFile.id] });
        qc.invalidateQueries({ queryKey: ["projects"] });
      }} />}
    </div>
  );
}
