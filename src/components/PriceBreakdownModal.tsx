import { X, CheckCircle, AlertTriangle, MapPin, BookOpen, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { BoQItem } from "@/lib/mockData";
import { formatNumber } from "@/lib/mockData";

interface Props {
  item: BoQItem;
  onClose: () => void;
}

export default function PriceBreakdownModal({ item, onClose }: Props) {
  const breakdownItems = [
    { label: "Materials", value: item.materials || 0, color: "hsl(var(--info))" },
    { label: "Labor", value: item.labor || 0, color: "hsl(var(--primary))" },
    { label: "Equipment", value: item.equipment || 0, color: "hsl(var(--warning))" },
    { label: "Logistics", value: item.logistics || 0, color: "hsl(210, 20%, 60%)" },
    { label: "Risk", value: item.risk || 0, color: "hsl(var(--destructive))" },
    { label: "Profit", value: item.profit || 0, color: "hsl(var(--success))" },
  ];

  const total = breakdownItems.reduce((s, b) => s + b.value, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-card rounded-xl shadow-xl border w-full max-w-lg mx-4 max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h3 className="font-semibold">Price Breakdown</h3>
            <span className="text-xs text-muted-foreground">Item {item.itemNo}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="w-8 h-8">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-5 space-y-5">
          {/* Description */}
          <div>
            <div className="text-sm font-medium" dir="rtl">{item.description}</div>
            <div className="text-xs text-muted-foreground mt-1">{item.descriptionEn}</div>
          </div>

          {/* Meta */}
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 rounded-lg bg-secondary">
              <div className="text-xs text-muted-foreground">Source</div>
              <div className="flex items-center justify-center gap-1 mt-1">
                {item.source === "library" ? <BookOpen className="w-3 h-3" /> : <Cpu className="w-3 h-3" />}
                <span className="text-sm font-medium capitalize">{item.source}</span>
              </div>
            </div>
            <div className="text-center p-3 rounded-lg bg-secondary">
              <div className="text-xs text-muted-foreground">Location Factor</div>
              <div className="flex items-center justify-center gap-1 mt-1">
                <MapPin className="w-3 h-3" />
                <span className="text-sm font-medium">×{item.locationFactor}</span>
              </div>
            </div>
            <div className="text-center p-3 rounded-lg bg-secondary">
              <div className="text-xs text-muted-foreground">Confidence</div>
              <div className={`text-sm font-bold mt-1 ${
                (item.confidence || 0) >= 85 ? "text-success" : (item.confidence || 0) >= 60 ? "text-warning" : "text-destructive"
              }`}>
                {item.confidence}%
              </div>
            </div>
          </div>

          {/* Bar breakdown */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Cost Breakdown</span>
              <span className="text-sm font-bold">SAR {formatNumber(total)}</span>
            </div>
            <div className="flex h-3 rounded-full overflow-hidden mb-3">
              {breakdownItems.map((b) => (
                <div
                  key={b.label}
                  style={{ width: `${(b.value / total) * 100}%`, background: b.color }}
                  title={`${b.label}: ${formatNumber(b.value)}`}
                />
              ))}
            </div>
            <div className="space-y-2">
              {breakdownItems.map((b) => (
                <div key={b.label} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm" style={{ background: b.color }} />
                    <span>{b.label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground text-xs">{((b.value / total) * 100).toFixed(1)}%</span>
                    <span className="font-mono font-medium">{formatNumber(b.value)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          {item.notes && (
            <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-medium text-warning">Note</div>
                  <div className="text-sm mt-0.5">{item.notes}</div>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button className="flex-1 gap-2">
              <CheckCircle className="w-4 h-4" /> Approve
            </Button>
            <Button variant="outline" className="flex-1">
              Edit Price
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
