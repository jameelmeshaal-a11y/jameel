import { useState } from "react";
import { Eye, Download, CheckCircle, AlertTriangle, XCircle, Upload, FileText, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { sampleBoQItems, formatNumber, formatCurrency } from "@/lib/mockData";
import type { BoQItem } from "@/lib/mockData";
import PriceBreakdownModal from "./PriceBreakdownModal";
import { useLanguage } from "@/contexts/LanguageContext";

type PricingMode = "review" | "smart" | "auto";

export default function BoQTable() {
  const { t } = useLanguage();
  const [mode, setMode] = useState<PricingMode>("review");
  const [selectedItem, setSelectedItem] = useState<BoQItem | null>(null);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "approved": return <CheckCircle className="w-4 h-4 text-success" />;
      case "review": return <AlertTriangle className="w-4 h-4 text-warning" />;
      case "conflict": return <XCircle className="w-4 h-4 text-destructive" />;
      default: return <Info className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getConfidenceClass = (confidence?: number) => {
    if (!confidence) return "confidence-low";
    if (confidence >= 85) return "confidence-high";
    if (confidence >= 60) return "confidence-medium";
    return "confidence-low";
  };

  const totalValue = sampleBoQItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);

  const modeLabels: Record<PricingMode, string> = {
    review: t("review"),
    smart: t("smart"),
    auto: t("auto"),
  };

  if (sampleBoQItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
          <FileText className="w-7 h-7 text-primary" />
        </div>
        <h3 className="text-lg font-semibold mb-2">{t("noBoQFiles")}</h3>
        <p className="text-muted-foreground max-w-sm mb-5">{t("noBoQDesc")}</p>
        <Button variant="outline" className="gap-2">
          <Upload className="w-4 h-4" /> {t("uploadBoQFile")}
        </Button>
      </div>
    );
  }

  return (
    <div>
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
          <span className="text-sm font-semibold">{t("total")} {formatCurrency(totalValue)}</span>
          <Button variant="outline" size="sm" className="gap-1">
            <Download className="w-3 h-3" /> {t("export")}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-muted inline-block" /> {t("originalProtected")}</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-accent inline-block" /> {t("pricingSystem")}</span>
        <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-success" /> {t("approved")}</span>
        <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-warning" /> {t("reviewNeeded")}</span>
        <span className="flex items-center gap-1"><XCircle className="w-3 h-3 text-destructive" /> {t("conflict")}</span>
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
            {sampleBoQItems.map((item, index) => (
              <tr key={item.id} className="group">
                <td className="text-muted-foreground">{index + 1}</td>
                <td className="protected-col font-mono text-xs">{item.itemNo}</td>
                <td className="protected-col" dir="rtl">
                  <div className="text-sm leading-relaxed">{item.description}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{item.descriptionEn}</div>
                </td>
                <td className="protected-col text-center text-xs" dir="rtl">{item.unit}</td>
                <td className="protected-col text-right font-mono text-xs">{formatNumber(item.quantity, 0)}</td>
                <td className="pricing-col text-right font-mono text-xs font-medium">{item.unitRate ? formatNumber(item.unitRate) : "—"}</td>
                <td className="pricing-col text-right font-mono text-xs font-semibold">{item.totalPrice ? formatCurrency(item.totalPrice) : "—"}</td>
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
            ))}
          </tbody>
        </table>
      </div>

      {selectedItem && <PriceBreakdownModal item={selectedItem} onClose={() => setSelectedItem(null)} />}
    </div>
  );
}
