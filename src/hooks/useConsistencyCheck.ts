import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ConsistencyResult {
  consistent: boolean;
  tableTotal: number;
  headerTotal: number;
  dbTotal: number;
  difference: number;
  message: string;
}

const CONSISTENCY_TOLERANCE = 1;
const PAGE_SIZE = 1000;

/**
 * Build a consistency result for the saved project total against a live aggregate.
 */
export function checkConsistency(
  liveTotalValue: number,
  projectTotalValue: number
): ConsistencyResult {
  const tableTotal = liveTotalValue ?? 0;
  const headerTotal = projectTotalValue ?? 0;
  const dbTotal = projectTotalValue ?? 0;

  // Allow tiny floating-point drift (< 1 SAR)
  const diff = Math.abs(tableTotal - dbTotal);
  const consistent = diff < CONSISTENCY_TOLERANCE;

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

async function fetchLiveProjectTotal(projectId: string): Promise<number> {
  const { data: boqFiles, error: boqFilesError } = await supabase
    .from("boq_files")
    .select("id")
    .eq("project_id", projectId);

  if (boqFilesError) throw new Error(boqFilesError.message);

  const boqFileIds = (boqFiles ?? []).map((file) => file.id);
  if (boqFileIds.length === 0) return 0;

  let from = 0;
  let total = 0;

  while (true) {
    const { data, error } = await supabase
      .from("boq_items")
      .select("total_price")
      .in("boq_file_id", boqFileIds)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);

    const rows = data ?? [];
    total += rows.reduce((sum, row) => sum + (Number(row.total_price) || 0), 0);

    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return +total.toFixed(2);
}

export function useProjectConsistency(projectId: string | undefined, projectTotalValue: number) {
  const query = useQuery({
    queryKey: ["project-consistency", projectId],
    enabled: !!projectId,
    queryFn: async () => fetchLiveProjectTotal(projectId!),
    staleTime: 15_000,
  });

  const data = useMemo(() => {
    if (!projectId || query.data === undefined) {
      return checkConsistency(projectTotalValue ?? 0, projectTotalValue ?? 0);
    }

    return checkConsistency(query.data, projectTotalValue ?? 0);
  }, [projectId, projectTotalValue, query.data]);

  return {
    ...query,
    data,
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
