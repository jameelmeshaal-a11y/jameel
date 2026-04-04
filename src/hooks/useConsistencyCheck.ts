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
  // Use server-side aggregation to avoid row-limit issues
  const { data, error } = await supabase.rpc("recalculate_project_total", {
    p_project_id: projectId,
  });

  if (error) throw new Error(error.message);

  return (data as number) ?? 0;
}
