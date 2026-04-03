import { useState } from "react";
import { X, CheckCircle, MapPin, BookOpen, Cpu, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatNumber } from "@/lib/mockData";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface BoQItemRow {
  id: string;
  item_no: string;
  description: string;
  description_en: string;
  unit: string;
  quantity: number;
  unit_rate?: number | null;
  total_price?: number | null;
  materials?: number | null;
  labor?: number | null;
  equipment?: number | null;
  logistics?: number | null;
  risk?: number | null;
  profit?: number | null;
  confidence?: number | null;
  location_factor?: number | null;
  source?: string | null;
  notes?: string | null;
  status: string;
}

interface Props {
  item: BoQItemRow;
  onClose: () => void;
  onUpdated?: () => void;
}

export default function PriceBreakdownModal({ item, onClose, onUpdated }: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState({
    materials: item.materials || 0,
    labor: item.labor || 0,
    equipment: item.equipment || 0,
    logistics: item.logistics || 0,
    risk: item.risk || 0,
    profit: item.profit || 0,
  });

  const breakdownItems = [
    { key: "materials" as const, label: "Materials", color: "hsl(var(--info))" },
    { key: "labor" as const, label: "Labor", color: "hsl(var(--primary))" },
    { key: "equipment" as const, label: "Equipment", color: "hsl(var(--warning))" },
    { key: "logistics" as const, label: "Logistics", color: "hsl(210, 20%, 60%)" },
    { key: "risk" as const, label: "Risk", color: "hsl(var(--destructive))" },
    { key: "profit" as const, label: "Profit", color: "hsl(var(--success))" },
  ];

  const total = Object.values(values).reduce((s, v) => s + v, 0);

  const handleSave = async () => {
    setSaving(true);
    const unitRate = +(total).toFixed(2);
    const totalPrice = +(unitRate * item.quantity).toFixed(2);

    const { error } = await supabase
      .from("boq_items")
      .update({
        materials: values.materials,
        labor: values.labor,
        equipment: values.equipment,
        logistics: values.logistics,
        risk: values.risk,
        profit: values.profit,
        unit_rate: unitRate,
        total_price: totalPrice,
        source: "manual",
      })
      .eq("id", item.id);

    setSaving(false);
    if (error) {
      toast.error("فشل حفظ التعديل: " + error.message);
    } else {
      toast.success("تم تحديث السعر بنجاح");
      setEditing(false);
      onUpdated?.();
      onClose();
    }
  };

  const handleApprove = async () => {
    const { error } = await supabase
      .from("boq_items")
      .update({ status: "approved" })
      .eq("id", item.id);

    if (error) {
      toast.error("فشل الاعتماد");
    } else {
      toast.success("تم اعتماد البند");
      onUpdated?.();
      onClose();
    }
  };

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
            <span className="text-xs text-muted-foreground">Item {item.item_no}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="w-8 h-8">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-5 space-y-5">
          {/* Description */}
          <div>
            <div className="text-sm font-medium" dir="rtl">{item.description}</div>
            <div className="text-xs text-muted-foreground mt-1">{item.description_en}</div>
          </div>

          {/* Meta */}
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 rounded-lg bg-secondary">
              <div className="text-xs text-muted-foreground">Source</div>
              <div className="flex items-center justify-center gap-1 mt-1">
                {item.source === "library" ? <BookOpen className="w-3 h-3" /> : <Cpu className="w-3 h-3" />}
                <span className="text-sm font-medium capitalize">{item.source || "ai"}</span>
              </div>
            </div>
            <div className="text-center p-3 rounded-lg bg-secondary">
              <div className="text-xs text-muted-foreground">Location Factor</div>
              <div className="flex items-center justify-center gap-1 mt-1">
                <MapPin className="w-3 h-3" />
                <span className="text-sm font-medium">×{item.location_factor || 1}</span>
              </div>
            </div>
            <div className="text-center p-3 rounded-lg bg-secondary">
              <div className="text-xs text-muted-foreground">Confidence</div>
              <div className={`text-sm font-bold mt-1 ${
                (item.confidence || 0) >= 85 ? "text-success" : (item.confidence || 0) >= 60 ? "text-warning" : "text-destructive"
              }`}>
                {item.confidence || 0}%
              </div>
            </div>
          </div>

          {/* Bar breakdown */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Cost Breakdown</span>
              <span className="text-sm font-bold">SAR {formatNumber(total)}</span>
            </div>
            {!editing && (
              <div className="flex h-3 rounded-full overflow-hidden mb-3">
                {breakdownItems.map((b) => (
                  <div
                    key={b.key}
                    style={{ width: total > 0 ? `${(values[b.key] / total) * 100}%` : "0%", background: b.color }}
                    title={`${b.label}: ${formatNumber(values[b.key])}`}
                  />
                ))}
              </div>
            )}
            <div className="space-y-2">
              {breakdownItems.map((b) => (
                <div key={b.key} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm" style={{ background: b.color }} />
                    <span>{b.label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {editing ? (
                      <Input
                        type="number"
                        step="0.01"
                        className="w-28 h-7 text-right font-mono text-sm"
                        value={values[b.key]}
                        onChange={(e) => setValues(prev => ({ ...prev, [b.key]: parseFloat(e.target.value) || 0 }))}
                      />
                    ) : (
                      <>
                        <span className="text-muted-foreground text-xs">
                          {total > 0 ? ((values[b.key] / total) * 100).toFixed(1) : "0.0"}%
                        </span>
                        <span className="font-mono font-medium">{formatNumber(values[b.key])}</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {editing && (
              <div className="flex items-center justify-between mt-3 pt-3 border-t text-sm font-semibold">
                <span>Unit Rate</span>
                <span className="font-mono">SAR {formatNumber(total)}</span>
              </div>
            )}
          </div>

          {/* Pricing Explanation */}
          {item.notes && !editing && (
            <div className="p-3 rounded-lg bg-info/10 border border-info/20">
              <div className="flex items-start gap-2">
                <Cpu className="w-4 h-4 text-info flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-medium text-info">Price Explanation</div>
                  <div className="text-xs mt-1 font-mono text-muted-foreground leading-relaxed">
                    {item.notes.split(" | ").map((part, i) => (
                      <div key={i}>{part}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            {editing ? (
              <>
                <Button className="flex-1 gap-2" onClick={handleSave} disabled={saving}>
                  <CheckCircle className="w-4 h-4" /> {saving ? "جاري الحفظ..." : "حفظ التعديل"}
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => {
                  setValues({
                    materials: item.materials || 0,
                    labor: item.labor || 0,
                    equipment: item.equipment || 0,
                    logistics: item.logistics || 0,
                    risk: item.risk || 0,
                    profit: item.profit || 0,
                  });
                  setEditing(false);
                }}>
                  إلغاء
                </Button>
              </>
            ) : (
              <>
                <Button className="flex-1 gap-2" onClick={handleApprove}>
                  <CheckCircle className="w-4 h-4" /> Approve
                </Button>
                <Button variant="outline" className="flex-1 gap-2" onClick={() => setEditing(true)}>
                  <Pencil className="w-4 h-4" /> Edit Price
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
