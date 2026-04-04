import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export interface ConsistencyResult {
  consistent: boolean;
  tableTotal: number;
  headerTotal: number;
  dbTotal: number;
  difference: number;
  message: string;
}

/**
 * Compare the sum of item totals against the stored project total_value.
 */
export function checkConsistency(
  items: Array<{ total_price?: number | null }>,
  projectTotalValue: number
): ConsistencyResult {
  const tableTotal = items.reduce((s, i) => s + (i.total_price || 0), 0);
  const headerTotal = tableTotal; // header always mirrors table in our UI
  const dbTotal = projectTotalValue ?? 0;

  // Allow tiny floating-point drift (< 1 SAR)
  const diff = Math.abs(tableTotal - dbTotal);
  const consistent = diff < 1;

  return {
    consistent,
    tableTotal,
    headerTotal,
    dbTotal,
    difference: diff,
    message: consistent
      ? ""
      : "Data inconsistency detected. Some totals do not match. Please revalidate before proceeding.",
  };
}

/**
 * Recalculate and sync the project total_value to match item totals.
 */
export async function fixConsistency(
  projectId: string,
  _boqFileId?: string | undefined
): Promise<number> {
  // Aggregate totals from ALL BoQ files under this project
  const { data: boqFiles, error: bfErr } = await supabase
    .from("boq_files")
    .select("id")
    .eq("project_id", projectId);

  if (bfErr) throw new Error(bfErr.message);
  if (!boqFiles || boqFiles.length === 0) {
    // No BoQ files — set total to 0
    await supabase.from("projects").update({ total_value: 0 }).eq("id", projectId);
    return 0;
  }

  const boqFileIds = boqFiles.map((f) => f.id);
  const { data: items, error } = await supabase
    .from("boq_items")
    .select("total_price")
    .in("boq_file_id", boqFileIds);

  if (error) throw new Error(error.message);

  const newTotal = (items || []).reduce((s, i) => s + (i.total_price || 0), 0);

  const { error: updateErr } = await supabase
    .from("projects")
    .update({ total_value: newTotal })
    .eq("id", projectId);

  if (updateErr) throw new Error(updateErr.message);

  return newTotal;
}
