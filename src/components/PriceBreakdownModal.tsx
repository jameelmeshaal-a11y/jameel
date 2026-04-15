import { useState, useCallback, useEffect } from "react";
import { X, CheckCircle, MapPin, BookOpen, Cpu, Pencil, RotateCcw, Shield, AlertTriangle, Lock, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { formatNumber } from "@/lib/mockData";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  recalculateBreakdown, getUnitRate, distributeTotal,
  resolveRatiosFromValues, resolveRatiosFromLibrary,
  type BreakdownValues, type BreakdownField, type RatioSource, type RatioResolution,
} from "@/lib/pricing/smartRecalculator";
import { detectCategory } from "@/lib/pricingEngine";
// syncToRateLibrary is now handled atomically via save_manual_price RPC
import { useAuth } from "@/contexts/AuthContext";

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
  ownerMaterials?: boolean;
  onClose: () => void;
  onUpdated?: () => void;
}

const ALL_FIELDS: BreakdownField[] = ["materials", "labor", "equipment", "logistics", "risk", "profit"];

export default function PriceBreakdownModal({ item, projectId, ownerMaterials = false, onClose, onUpdated }: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [correctionNote, setCorrectionNote] = useState("");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState("");
  const { user } = useAuth();
  const [autoRebalance, setAutoRebalance] = useState(true);

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

  // Total Cost Distribution state
  const [totalCostInput, setTotalCostInput] = useState("");
  const [ratioSource, setRatioSource] = useState<RatioSource>("none");
  const [ratioResolution, setRatioResolution] = useState<RatioResolution | null>(null);
  const [ratioWarning, setRatioWarning] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const detected = detectCategory(item.description, item.description_en);

  // Resolve ratios on mount
  useEffect(() => {
    resolveRatios();
  }, []);

  async function resolveRatios() {
    // Priority 1: Current item's saved breakdown
    const fromItem = resolveRatiosFromValues(initial);
    if (fromItem) {
      setRatioResolution(fromItem);
      setRatioSource("current_item");
      if (fromItem.normalized) {
        setRatioWarning("تم تطبيع نسب التوزيع المحفوظة قبل التوزيع");
      }
      return;
    }

    // Priority 2: Linked rate library
    if (item.linked_rate_id) {
      try {
        const { data } = await supabase
          .from("rate_library")
          .select("materials_pct, labor_pct, equipment_pct, logistics_pct, risk_pct, profit_pct")
          .eq("id", item.linked_rate_id)
          .single();

        if (data) {
          const fromLib = resolveRatiosFromLibrary(data);
          if (fromLib) {
            setRatioResolution(fromLib);
            setRatioSource("linked_library");
            if (fromLib.normalized) {
              setRatioWarning("تم تطبيع نسب التوزيع المحفوظة قبل التوزيع");
            }
            return;
          }
        }
      } catch (e) {
        console.warn("[RatioResolve] Library fetch failed:", e);
      }
    }

    // Priority 3: Check if item has ai_generated source (previously generated)
    if (item.source === "ai_generated") {
      const fromItem2 = resolveRatiosFromValues(initial);
      if (fromItem2) {
        fromItem2.source = "ai_generated";
        setRatioResolution(fromItem2);
        setRatioSource("ai_generated");
        return;
      }
    }

    // No ratios found — will trigger AI on demand
    setRatioSource("none");
  }

  async function generateAiRatios(): Promise<RatioResolution | null> {
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-breakdown", {
        body: {
          description: item.description,
          description_en: item.description_en,
          unit: item.unit,
          category: detected.category,
        },
      });

      if (error || !data?.percentages) {
        console.error("[AI Breakdown] Error:", error || "No percentages returned");
        setRatioWarning("فشل توليد النسب — يمكنك الإدخال يدوياً");
        return null;
      }

      const pcts = data.percentages;
      const resolution = resolveRatiosFromLibrary(pcts);
      if (!resolution) return null;

      resolution.source = "ai_generated";

      // PERSIST AI ratios to item immediately (scaled to sum=100 as breakdown values)
      const scaledValues: BreakdownValues = {
        materials: Math.round(pcts.materials_pct * 100) / 100,
        labor: Math.round(pcts.labor_pct * 100) / 100,
        equipment: Math.round(pcts.equipment_pct * 100) / 100,
        logistics: Math.round(pcts.logistics_pct * 100) / 100,
        risk: Math.round(pcts.risk_pct * 100) / 100,
        profit: Math.round(pcts.profit_pct * 100) / 100,
      };

      await supabase
        .from("boq_items")
        .update({
          materials: scaledValues.materials,
          labor: scaledValues.labor,
          equipment: scaledValues.equipment,
          logistics: scaledValues.logistics,
          risk: scaledValues.risk,
          profit: scaledValues.profit,
          source: "ai_generated",
        })
        .eq("id", item.id);

      setRatioResolution(resolution);
      setRatioSource("ai_generated");
      setRatioWarning("لا توجد نسب محفوظة — تم استخدام توزيع الذكاء الاصطناعي");

      return resolution;
    } catch (e: any) {
      console.error("[AI Breakdown] Exception:", e);
      setRatioWarning("فشل توليد النسب — يمكنك الإدخال يدوياً");
      return null;
    } finally {
      setAiLoading(false);
    }
  }

  const handleTotalCostChange = useCallback(async (inputValue: string) => {
    setTotalCostInput(inputValue);
    const totalCost = parseFloat(inputValue);
    if (!totalCost || totalCost <= 0) return;

    let resolution = ratioResolution;

    // If no ratios resolved yet, trigger AI
    if (!resolution && ratioSource === "none") {
      resolution = await generateAiRatios();
      if (!resolution) return; // AI failed, user must enter manually
    }

    if (!resolution) return;

    const distributed = distributeTotal(totalCost, resolution.ratios);
    setValues(distributed);
  }, [ratioResolution, ratioSource]);

  const handleFieldChange = useCallback((field: BreakdownField, newValue: number) => {
    if (newValue < 0) return;
    setManualFields(prev => new Set([...prev, field]));
    setTotalCostInput(""); // Clear total cost input when manually editing

    if (autoRebalance) {
      const recalculated = recalculateBreakdown(values, field, newValue, detected.category, false);
      setValues(recalculated);
      toast.info("Cost breakdown recalculated based on new " + field.charAt(0).toUpperCase() + field.slice(1) + " value", { duration: 2000 });
    } else {
      setValues(prev => ({ ...prev, [field]: newValue }));
    }
  }, [values, autoRebalance, detected.category]);

  const total = getUnitRate(values);
  const hasChanges = JSON.stringify(values) !== JSON.stringify(initial);

  const allBreakdownItems: { key: BreakdownField; label: string; color: string }[] = [
    { key: "materials", label: "Materials", color: "hsl(var(--info))" },
    { key: "labor", label: "Labor", color: "hsl(var(--primary))" },
    { key: "equipment", label: "Equipment", color: "hsl(var(--warning))" },
    { key: "logistics", label: "Logistics", color: "hsl(210, 20%, 60%)" },
    { key: "risk", label: "Risk", color: "hsl(var(--destructive))" },
    { key: "profit", label: "Profit", color: "hsl(var(--success))" },
  ];

  const breakdownItems = ownerMaterials
    ? allBreakdownItems.filter(b => b.key !== "materials")
    : allBreakdownItems;

  const handleSave = async () => {
    if (!hasChanges) return;
    setSaving(true);
    try {
      const unitRate = getUnitRate(values);
      const totalPrice = +(unitRate * item.quantity).toFixed(2);

      const overridesObj: Record<string, boolean> = {};
      manualFields.forEach(f => { overridesObj[f] = true; });

      // Atomic save: updates boq_items + rate_library + rate_sources in one transaction
      const { data: rpcResult, error } = await supabase.rpc("save_manual_price", {
        p_item_id: item.id,
        p_boq_file_id: item.boq_file_id,
        p_materials: values.materials,
        p_labor: values.labor,
        p_equipment: values.equipment,
        p_logistics: values.logistics,
        p_risk: values.risk,
        p_profit: values.profit,
        p_unit_rate: unitRate,
        p_total_price: totalPrice,
        p_manual_overrides: overridesObj,
        p_correction_note: correctionNote || null,
        p_user_id: user?.id || null,
      });

      if (error) {
        console.error("[Save] Atomic save failed:", error);
        toast.error("فشل حفظ التعديل: " + error.message);
        return;
      }

      const result = rpcResult as any;
      console.log("[Save] Atomic save result:", result);

      // Auto-sync: fix any stale_price items that the RPC just flagged
      let syncedCount = 0;
      try {
        const { data: staleItems } = await supabase
          .from("boq_items")
          .select("id, linked_rate_id, item_no, description, unit_rate, location_factor, quantity, override_type")
          .eq("boq_file_id", item.boq_file_id)
          .eq("status", "stale_price");

        if (staleItems && staleItems.length > 0) {
          // Only sync non-manual items
          const toSync = staleItems.filter(si => si.override_type !== "manual");
          if (toSync.length > 0) {
            // Get library rates for these items
            const linkedIds = [...new Set(toSync.map(s => s.linked_rate_id).filter(Boolean))] as string[];
            const { data: libEntries } = await supabase
              .from("rate_library")
              .select("id, target_rate, materials_pct, labor_pct, equipment_pct, logistics_pct, risk_pct, profit_pct")
              .in("id", linkedIds);
            const libMap = new Map((libEntries || []).map(l => [l.id, l]));

            for (const si of toSync) {
              const lib = si.linked_rate_id ? libMap.get(si.linked_rate_id) : null;
              if (!lib) continue;
              const locFactor = si.location_factor || 1.0;
              const newRate = +(lib.target_rate * locFactor).toFixed(2);
              const totalPct = (lib.materials_pct || 0) + (lib.labor_pct || 0) + (lib.equipment_pct || 0) + (lib.logistics_pct || 0) + (lib.risk_pct || 0) + (lib.profit_pct || 0);
              const bd = totalPct > 0 ? {
                materials: +(newRate * (lib.materials_pct || 0) / totalPct).toFixed(2),
                labor: +(newRate * (lib.labor_pct || 0) / totalPct).toFixed(2),
                equipment: +(newRate * (lib.equipment_pct || 0) / totalPct).toFixed(2),
                logistics: +(newRate * (lib.logistics_pct || 0) / totalPct).toFixed(2),
                risk: +(newRate * (lib.risk_pct || 0) / totalPct).toFixed(2),
                profit: +(newRate * (lib.profit_pct || 0) / totalPct).toFixed(2),
              } : { materials: newRate, labor: 0, equipment: 0, logistics: 0, risk: 0, profit: 0 };

              await supabase.from("boq_items").update({
                unit_rate: newRate,
                total_price: +(newRate * si.quantity).toFixed(2),
                ...bd,
                status: "approved",
              }).eq("id", si.id);
              syncedCount++;
            }
          }
        }
      } catch (syncErr) {
        console.warn("[Save] Auto-sync stale items failed:", syncErr);
      }

      // Audit log with approval notes
      try {
        await supabase.from("pricing_audit_log").insert({
          item_id: item.id,
          project_id: projectId,
          action_type: "manual_approve",
          edit_type: "manual_override",
          change_scope: "item_and_linked",
          reason: approvalNotes || correctionNote || null,
          changed_by: user?.id || null,
          old_values: { unit_rate: item.unit_rate, total_price: item.total_price },
          new_values: { unit_rate: unitRate, total_price: totalPrice },
          changed_fields: overridesObj,
          affected_items_count: 1 + (result?.linked_items_count || 0),
          master_rate_updated: true,
        });
      } catch (auditErr) {
        console.warn("[Save] Audit log failed:", auditErr);
      }

      const libMsg = result?.is_new
        ? "تم إنشاء بند جديد في المكتبة"
        : "تم تحديث المكتبة";
      const syncMsg = syncedCount > 0 ? ` + مزامنة ${syncedCount} بند مرتبط` : "";
      toast.success(`✅ ${libMsg}${syncMsg} — سعر الوحدة: ${formatNumber(unitRate)} ريال`);

      setEditing(false);
      setShowConfirmDialog(false);
      setApprovalNotes("");
      onUpdated?.();
      onClose();
    } catch (err: any) {
      console.error("[Save] Exception:", err);
      toast.error("خطأ: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const isLocked = item.status === "approved";
  const overrideType = item.override_type;

  const ratioSourceLabel: Record<RatioSource, string> = {
    current_item: "من البند الحالي",
    linked_library: "من مكتبة الأسعار",
    ai_generated: "توزيع ذكاء اصطناعي",
    none: "غير متوفر",
  };

  const ratioSourceColor: Record<RatioSource, string> = {
    current_item: "default",
    linked_library: "secondary",
    ai_generated: "outline",
    none: "destructive",
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

          {/* Total Cost Distribution (editing only) */}
          {editing && (
            <div className="space-y-3 p-4 rounded-lg border-2 border-primary/30 bg-primary/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">التكلفة الإجمالية / Total Cost</span>
                  {aiLoading && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                </div>
                <Badge variant={ratioSourceColor[ratioSource] as any} className="text-[10px]">
                  {ratioSourceLabel[ratioSource]}
                </Badge>
              </div>

              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="أدخل التكلفة الإجمالية..."
                  className="flex-1 h-10 text-right font-mono text-base font-semibold"
                  value={totalCostInput}
                  onChange={(e) => handleTotalCostChange(e.target.value)}
                  disabled={aiLoading}
                  dir="ltr"
                />
                <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">SAR</span>
              </div>

              {/* Ratio source info + percentages */}
              {ratioResolution && (
                <div className="flex flex-wrap gap-1.5">
                  {ALL_FIELDS.map(f => (
                    <span key={f} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary font-mono">
                      {f.slice(0, 3)}: {(ratioResolution.ratios[f] * 100).toFixed(1)}%
                    </span>
                  ))}
                </div>
              )}

              {/* Warnings */}
              {ratioWarning && (
                <div className={`flex items-start gap-2 p-2.5 rounded-lg text-xs ${
                  ratioSource === "ai_generated"
                    ? "bg-warning/10 border border-warning/20 text-warning"
                    : ratioSource === "none"
                    ? "bg-destructive/10 border border-destructive/20 text-destructive"
                    : "bg-warning/10 border border-warning/20 text-warning"
                }`}>
                  {ratioSource === "ai_generated" ? (
                    <Sparkles className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  )}
                  <span dir="rtl">{ratioWarning}</span>
                </div>
              )}
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
                      <>
                        {ratioResolution && (
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {(ratioResolution.ratios[b.key] * 100).toFixed(1)}%
                          </span>
                        )}
                        <Input
                          type="number"
                          step="0.01"
                          className="w-28 h-7 text-right font-mono text-sm"
                          value={values[b.key]}
                          onChange={(e) => handleFieldChange(b.key, parseFloat(e.target.value) || 0)}
                        />
                      </>
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
              <div className="space-y-3 mt-3 pt-3 border-t">
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span>Unit Rate</span>
                  <span className="font-mono">SAR {formatNumber(total)}</span>
                </div>
                <div className="flex items-center justify-between text-sm font-semibold text-primary">
                  <span>Total Price (× {formatNumber(item.quantity, 0)})</span>
                  <span className="font-mono">SAR {formatNumber(total * item.quantity)}</span>
                </div>

                {/* Correction Note */}
                <div className="space-y-1.5 p-3 rounded-lg bg-warning/5 border border-warning/20">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-warning" />
                    <label className="text-xs font-semibold text-warning" dir="rtl">
                      سبب التعديل / ملاحظة للنظام
                    </label>
                  </div>
                  <textarea
                    className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    placeholder="مثال: هذا بند أنابيب UPVC وليس صمامات — النظام طابقه خطأ مع صمامات بوابة"
                    value={correctionNote}
                    onChange={(e) => setCorrectionNote(e.target.value)}
                    dir="rtl"
                  />
                  <p className="text-[10px] text-muted-foreground" dir="rtl">
                    هذه الملاحظة تُحفظ في مكتبة الأسعار وتساعد النظام على تجنب نفس الخطأ مستقبلاً
                  </p>
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
              <div className="flex gap-2">
                <Button className="flex-1 gap-2" onClick={() => setShowConfirmDialog(true)} disabled={saving || !hasChanges}>
                  <CheckCircle className="w-4 h-4" /> {saving ? "جاري الحفظ..." : "حفظ"}
                </Button>
                <Button variant="outline" onClick={() => { setValues(initial); setManualFields(new Set()); setTotalCostInput(""); setEditing(false); }}>
                  إلغاء
                </Button>
              </div>
            ) : (
              <Button variant="outline" className="flex-1 gap-2" onClick={() => setEditing(true)}>
                <Pencil className="w-4 h-4" /> Edit Price
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
