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
  boqFileId: string | undefined
): Promise<number> {
  if (!boqFileId) throw new Error("No BoQ file to recalculate");

  const { data: items, error } = await supabase
    .from("boq_items")
    .select("total_price")
    .eq("boq_file_id", boqFileId);

  if (error) throw new Error(error.message);

  const newTotal = (items || []).reduce((s, i) => s + (i.total_price || 0), 0);

  const { error: updateErr } = await supabase
    .from("projects")
    .update({ total_value: newTotal })
    .eq("id", projectId);

  if (updateErr) throw new Error(updateErr.message);

  return newTotal;
}
