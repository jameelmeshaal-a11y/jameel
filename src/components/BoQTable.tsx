import { useState } from "react";
import { Eye, Download, CheckCircle, AlertTriangle, XCircle, ChevronDown, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { sampleBoQItems, formatNumber, formatCurrency } from "@/lib/mockData";
import type { BoQItem } from "@/lib/mockData";
import PriceBreakdownModal from "./PriceBreakdownModal";

type PricingMode = "review" | "smart" | "auto";

export default function BoQTable() {
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

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Pricing Mode:</span>
          {(["review", "smart", "auto"] as PricingMode[]).map((m) => (
            <Button
              key={m}
              variant={mode === m ? "default" : "outline"}
              size="sm"
              onClick={() => setMode(m)}
              className="capitalize"
            >
              {m}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Total: {formatCurrency(totalValue)}</span>
          <Button variant="outline" size="sm" className="gap-1">
            <Download className="w-3 h-3" /> Export
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-muted inline-block" /> Original (Protected)</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-accent inline-block" /> Pricing (System)</span>
        <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-success" /> Approved</span>
        <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-warning" /> Review</span>
        <span className="flex items-center gap-1"><XCircle className="w-3 h-3 text-destructive" /> Conflict</span>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-auto max-h-[65vh] scrollbar-thin bg-card">
        <table className="boq-table">
          <thead>
            <tr>
              <th className="w-8">#</th>
              <th className="protected-col">Item No</th>
              <th className="protected-col min-w-[280px]">Description (وصف البند)</th>
              <th className="protected-col w-16">Unit</th>
              <th className="protected-col w-24 text-right">Qty</th>
              <th className="pricing-col w-24 text-right">Unit Rate</th>
              <th className="pricing-col w-28 text-right">Total</th>
              <th className="pricing-col w-20 text-right">Mat.</th>
              <th className="pricing-col w-20 text-right">Labor</th>
              <th className="pricing-col w-20 text-right">Equip.</th>
              <th className="pricing-col w-20 text-right">Logis.</th>
              <th className="pricing-col w-16 text-right">Risk</th>
              <th className="pricing-col w-16 text-right">Profit</th>
              <th className="w-20 text-center">Conf.</th>
              <th className="w-12 text-center">Status</th>
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
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-7 h-7 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => setSelectedItem(item)}
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Price Breakdown Modal */}
      {selectedItem && (
        <PriceBreakdownModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  );
}
