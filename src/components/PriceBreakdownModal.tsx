import { useState, useCallback } from "react";
import { X, CheckCircle, MapPin, BookOpen, Cpu, Pencil, RotateCcw, Shield, AlertTriangle, Lock, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { formatNumber } from "@/lib/mockData";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { recalculateBreakdown, getUnitRate, type BreakdownValues, type BreakdownField } from "@/lib/pricing/smartRecalculator";
import { propagateChanges, type ChangeScope, type EditType } from "@/lib/pricing/propagationService";
import type { SimilarItem } from "@/lib/pricing/similarItemMatcher";
import { detectCategory } from "@/lib/pricingEngine";
import PropagationScopeModal from "./PropagationScopeModal";

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
  boq_file_id: string;
  override_type?: string | null;
  override_reason?: string | null;
  manual_overrides?: Record<string, boolean> | null;
  linked_rate_id?: string | null;
}

interface Props {
  item: BoQItemRow;
  projectId: string;
  onClose: () => void;
  onUpdated?: () => void;
}

export default function PriceBreakdownModal({ item, projectId, onClose, onUpdated }: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoRebalance, setAutoRebalance] = useState(true);
  const [showPropagation, setShowPropagation] = useState(false);

  const initial: BreakdownValues = {
    materials: item.materials || 0,
    labor: item.labor || 0,
    equipment: item.equipment || 0,
    logistics: item.logistics || 0,
    risk: item.risk || 0,
    profit: item.profit || 0,
  };

  const [values, setValues] = useState<BreakdownValues>(initial);
  const [manualFields, setManualFields] = useState<Set<BreakdownField>>(
    new Set(Object.keys(item.manual_overrides || {}) as BreakdownField[])
  );

  const detected = detectCategory(item.description, item.description_en);

  const handleFieldChange = useCallback((field: BreakdownField, newValue: number) => {
    if (newValue < 0) return; // prevent negative values
    setManualFields(prev => new Set([...prev, field]));

    if (autoRebalance) {
      const recalculated = recalculateBreakdown(values, field, newValue, detected.category, false);
      console.log(`[SmartRecalc] Field: ${field}, New: ${newValue}, Category: ${detected.category}`, {
        previous: { ...values },
        recalculated,
        unitRate: getUnitRate(recalculated),
      });
      setValues(recalculated);
      toast.info("Cost breakdown recalculated based on new " + field.charAt(0).toUpperCase() + field.slice(1) + " value", { duration: 2000 });
    } else {
      setValues(prev => ({ ...prev, [field]: newValue }));
    }
  }, [values, autoRebalance, detected.category]);

  const handleResetAuto = () => {
    setValues(initial);
    setManualFields(new Set());
  };

  const total = getUnitRate(values);
  const hasChanges = JSON.stringify(values) !== JSON.stringify(initial);

  const breakdownItems: { key: BreakdownField; label: string; color: string }[] = [
    { key: "materials", label: "Materials", color: "hsl(var(--info))" },
    { key: "labor", label: "Labor", color: "hsl(var(--primary))" },
    { key: "equipment", label: "Equipment", color: "hsl(var(--warning))" },
    { key: "logistics", label: "Logistics", color: "hsl(210, 20%, 60%)" },
    { key: "risk", label: "Risk", color: "hsl(var(--destructive))" },
    { key: "profit", label: "Profit", color: "hsl(var(--success))" },
  ];

  // Quick save — just this item, no propagation modal
  const handleQuickSave = async () => {
    if (!hasChanges) return;
    setSaving(true);
    try {
      const unitRate = getUnitRate(values);
      const totalPrice = +(unitRate * item.quantity).toFixed(2);

      const overridesObj: Record<string, boolean> = {};
      manualFields.forEach(f => { overridesObj[f] = true; });

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
          manual_overrides: overridesObj,
          override_at: new Date().toISOString(),
        })
        .eq("id", item.id);

      if (error) {
        console.error("[QuickSave] Error:", error);
        toast.error("فشل حفظ التعديل: " + error.message);
      } else {
        toast.success(`تم تعديل البند — سعر الوحدة: ${formatNumber(unitRate)} ريال`);
        setEditing(false);
        onUpdated?.();
        onClose();
      }
    } catch (err: any) {
      console.error("[QuickSave] Exception:", err);
      toast.error("خطأ: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveWithScope = () => {
    if (!hasChanges) return;
    setShowPropagation(true);
  };

  const handlePropagationConfirm = async (
    scope: ChangeScope,
    editType: EditType,
    reason: string,
    targets: SimilarItem[],
    updateMaster: boolean,
  ) => {
    setSaving(true);
    setShowPropagation(false);

    try {
      const result = await propagateChanges({
        sourceItemId: item.id,
        projectId,
        boqFileId: item.boq_file_id,
        newValues: values,
        scope,
        editType,
        reason,
        targetItems: targets,
        linkedRateId: item.linked_rate_id,
        updateMasterRate: updateMaster,
      });

      // Save manual overrides metadata
      const overridesObj: Record<string, boolean> = {};
      manualFields.forEach(f => { overridesObj[f] = true; });
      await supabase.from("boq_items")
        .update({ manual_overrides: overridesObj })
        .eq("id", item.id);

      if (result.errors.length > 0) {
        toast.error(`Updated ${result.updatedCount} items with ${result.errors.length} errors`);
      } else {
        const scopeLabel = scope === "item_only" ? "item" : scope === "project" ? "project" : "globally";
        toast.success(`Updated ${result.updatedCount} item(s) — ${editType === "master_update" ? "Master rate" : "Project override"} (${scopeLabel})`);
      }

      setEditing(false);
      onUpdated?.();
      onClose();
    } catch (err: any) {
      toast.error("Failed: " + err.message);
    } finally {
      setSaving(false);
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

  const isLocked = item.status === "approved";
  const overrideType = item.override_type;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-sm" onClick={onClose}>
        <div
          className="bg-card rounded-xl shadow-xl border w-full max-w-lg mx-4 max-h-[90vh] overflow-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">Price Breakdown</h3>
                {isLocked && <Lock className="w-4 h-4 text-warning" />}
                {overrideType && (
                  <Badge variant={overrideType === "project_override" ? "secondary" : "default"} className="text-[10px]">
                    {overrideType === "project_override" ? "Project Override" : "Master Update"}
                  </Badge>
                )}
              </div>
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
                <div className="text-xs text-muted-foreground">Location</div>
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

            {/* Auto-rebalance toggle (editing only) */}
            {editing && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                <div className="flex items-center gap-2 text-sm">
                  <RotateCcw className="w-4 h-4 text-primary" />
                  <span>Auto-rebalance breakdown</span>
                </div>
                <Switch checked={autoRebalance} onCheckedChange={setAutoRebalance} />
              </div>
            )}

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
                      {manualFields.has(b.key) && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 text-warning border-warning/30">
                          Manual
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {editing ? (
                        <Input
                          type="number"
                          step="0.01"
                          className="w-28 h-7 text-right font-mono text-sm"
                          value={values[b.key]}
                          onChange={(e) => handleFieldChange(b.key, parseFloat(e.target.value) || 0)}
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
                <div className="space-y-2 mt-3 pt-3 border-t">
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>Unit Rate</span>
                    <span className="font-mono">SAR {formatNumber(total)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm font-semibold text-primary">
                    <span>Total Price (× {formatNumber(item.quantity, 0)})</span>
                    <span className="font-mono">SAR {formatNumber(total * item.quantity)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Override reason display */}
            {item.override_reason && !editing && (
              <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
                <div className="flex items-start gap-2">
                  <Shield className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-medium text-warning">Override Reason</div>
                    <div className="text-xs mt-1 text-muted-foreground">{item.override_reason}</div>
                  </div>
                </div>
              </div>
            )}

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
            <div className="flex flex-col gap-2 pt-2">
              {editing ? (
                <>
                  <div className="flex gap-2">
                    <Button className="flex-1 gap-2" onClick={handleQuickSave} disabled={saving || !hasChanges}>
                      <CheckCircle className="w-4 h-4" /> {saving ? "جاري الحفظ..." : "حفظ التعديل"}
                    </Button>
                    <Button variant="outline" onClick={() => { setValues(initial); setManualFields(new Set()); setEditing(false); }}>
                      إلغاء
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" className="flex-1 gap-1 text-xs" onClick={handleSaveWithScope} disabled={saving || !hasChanges}>
                      <Globe className="w-3 h-3" /> حفظ مع نشر التعديل
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleResetAuto} className="gap-1 text-xs">
                      <RotateCcw className="w-3 h-3" /> إعادة تعيين
                    </Button>
                  </div>
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

      {/* Propagation Scope Modal */}
      {showPropagation && (
        <PropagationScopeModal
          item={item}
          newValues={values}
          newUnitRate={total}
          boqFileId={item.boq_file_id}
          projectId={projectId}
          onConfirm={handlePropagationConfirm}
          onCancel={() => setShowPropagation(false)}
        />
      )}
    </>
  );
}
