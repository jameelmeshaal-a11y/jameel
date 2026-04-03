/**
 * Propagation service — applies price changes to similar items
 * and optionally updates the master rate library.
 */

import { supabase } from "@/integrations/supabase/client";
import type { BreakdownValues } from "./smartRecalculator";
import { getUnitRate } from "./smartRecalculator";
import type { SimilarItem } from "./similarItemMatcher";

export type ChangeScope = "item_only" | "project" | "global";
export type EditType = "project_override" | "master_update";

export interface PropagationRequest {
  sourceItemId: string;
  projectId: string;
  boqFileId: string;
  newValues: BreakdownValues;
  scope: ChangeScope;
  editType: EditType;
  reason: string;
  targetItems: SimilarItem[];
  linkedRateId?: string | null;
  updateMasterRate: boolean;
}

export interface PropagationResult {
  updatedCount: number;
  masterUpdated: boolean;
  errors: string[];
}

export async function propagateChanges(req: PropagationRequest): Promise<PropagationResult> {
  const errors: string[] = [];
  let updatedCount = 0;
  const unitRate = getUnitRate(req.newValues);

  const statusValue = req.editType === "master_update" ? "approved" : "review";
  const noteValue = req.reason?.trim() || "Pricing logic updated";

  // 1. Update the source item
  const { error: srcErr } = await supabase
    .from("boq_items")
    .update({
      materials: req.newValues.materials,
      labor: req.newValues.labor,
      equipment: req.newValues.equipment,
      logistics: req.newValues.logistics,
      risk: req.newValues.risk,
      profit: req.newValues.profit,
      unit_rate: unitRate,
      total_price: 0,
      source: req.editType === "project_override" ? "project_override" : "master_update",
      status: statusValue,
      notes: noteValue,
      override_type: req.editType,
      override_reason: req.reason,
      override_at: new Date().toISOString(),
    })
    .eq("id", req.sourceItemId);

  if (srcErr) {
    errors.push(`Source item: ${srcErr.message}`);
  } else {
    updatedCount++;
    const { data: srcItem } = await supabase
      .from("boq_items")
      .select("quantity")
      .eq("id", req.sourceItemId)
      .single();
    if (srcItem) {
      await supabase
        .from("boq_items")
        .update({ total_price: +(unitRate * srcItem.quantity).toFixed(2) })
        .eq("id", req.sourceItemId);
    }
  }

  // 2. Propagate to similar items if scope > item_only
  if (req.scope !== "item_only" && req.targetItems.length > 0) {
    for (const target of req.targetItems) {
      const newTargetRate = unitRate;
      const newTotalPrice = +(newTargetRate * target.quantity).toFixed(2);

      const { error } = await supabase
        .from("boq_items")
        .update({
          materials: req.newValues.materials,
          labor: req.newValues.labor,
          equipment: req.newValues.equipment,
          logistics: req.newValues.logistics,
          risk: req.newValues.risk,
          profit: req.newValues.profit,
          unit_rate: newTargetRate,
          total_price: newTotalPrice,
          source: req.editType === "project_override" ? "project_override" : "master_update",
          status: statusValue,
          notes: noteValue,
          override_type: req.editType,
          override_reason: req.reason,
          override_at: new Date().toISOString(),
        })
        .eq("id", target.id);

      if (error) {
        errors.push(`Item ${target.item_no}: ${error.message}`);
      } else {
        updatedCount++;
      }
    }
  }

  // 3. Update master rate library if requested
  let masterUpdated = false;
  if (req.updateMasterRate && req.linkedRateId) {
    const { error: masterErr } = await supabase
      .from("rate_library")
      .update({
        base_rate: unitRate,
        materials_pct: unitRate > 0 ? +((req.newValues.materials / unitRate) * 100).toFixed(1) : 0,
        labor_pct: unitRate > 0 ? +((req.newValues.labor / unitRate) * 100).toFixed(1) : 0,
        equipment_pct: unitRate > 0 ? +((req.newValues.equipment / unitRate) * 100).toFixed(1) : 0,
        logistics_pct: unitRate > 0 ? +((req.newValues.logistics / unitRate) * 100).toFixed(1) : 0,
        risk_pct: unitRate > 0 ? +((req.newValues.risk / unitRate) * 100).toFixed(1) : 0,
        profit_pct: unitRate > 0 ? +((req.newValues.profit / unitRate) * 100).toFixed(1) : 0,
        source_type: "Revised",
      })
      .eq("id", req.linkedRateId);

    if (masterErr) {
      errors.push(`Master rate: ${masterErr.message}`);
    } else {
      masterUpdated = true;
    }
  }

  // 4. Log audit trail
  await supabase.from("pricing_audit_log").insert({
    item_id: req.sourceItemId,
    rate_library_id: req.linkedRateId || null,
    project_id: req.projectId,
    action_type: "price_update",
    change_scope: req.scope,
    edit_type: req.editType,
    changed_fields: Object.keys(req.newValues),
    old_values: {},
    new_values: req.newValues as any,
    reason: req.reason,
    affected_items_count: updatedCount,
    master_rate_updated: masterUpdated,
  });

  return { updatedCount, masterUpdated, errors };
}
