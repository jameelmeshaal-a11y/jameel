import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DuplicateGroup {
  normalized_name: string;
  unit: string;
  dup_count: number;
  variants: Array<{
    id: string;
    name_ar: string;
    base_rate: number;
    target_rate: number;
    updated_at: string;
    is_locked: boolean;
    approved_at: string | null;
  }>;
}

export interface DriftItem {
  item_id: string;
  item_no: string;
  description: string;
  boq_file_id: string;
  boq_file_name: string;
  current_unit_rate: number;
  library_target_rate: number;
  variance: number;
  linked_rate_id: string;
  library_name: string;
}

export function useDuplicateLibraryItems() {
  return useQuery({
    queryKey: ["price-sync-duplicates"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("find_duplicate_library_items");
      if (error) throw error;
      return (data || []) as DuplicateGroup[];
    },
    refetchOnWindowFocus: true,
    staleTime: 0,
    gcTime: 0,
  });
}

export function usePriceDrift() {
  return useQuery({
    queryKey: ["price-sync-drift"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("find_price_drift");
      if (error) throw error;
      return (data || []) as DriftItem[];
    },
    refetchOnWindowFocus: true,
    staleTime: 0,
    gcTime: 0,
  });
}

export function useForceResyncRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ rateId, newPrice, userId, mergeDuplicates = true }: {
      rateId: string;
      newPrice: number;
      userId?: string;
      mergeDuplicates?: boolean;
    }) => {
      const { data, error } = await (supabase.rpc as any)("force_resync_rate", {
        p_rate_id: rateId,
        p_new_price: newPrice,
        p_user_id: userId || null,
        p_merge_duplicates: mergeDuplicates,
      });
      if (error) throw error;
      return data as {
        success: boolean;
        rate_id: string;
        old_price: number;
        new_price: number;
        merged_duplicates: number;
        relinked_items: number;
        synced_boq_items: number;
        affected_boq_files: number;
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["price-library"] });
      qc.invalidateQueries({ queryKey: ["price-library-stats"] });
      qc.invalidateQueries({ queryKey: ["price-sync-duplicates"] });
      qc.invalidateQueries({ queryKey: ["price-sync-drift"] });
      qc.invalidateQueries({ queryKey: ["boq-items"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useBulkMergeDuplicates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId?: string) => {
      const { data, error } = await (supabase.rpc as any)("bulk_merge_duplicates", {
        p_user_id: userId || null,
      });
      if (error) throw error;
      return data as {
        success: boolean;
        groups_processed: number;
        duplicates_deleted: number;
        items_relinked: number;
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["price-library"] });
      qc.invalidateQueries({ queryKey: ["price-library-stats"] });
      qc.invalidateQueries({ queryKey: ["price-sync-duplicates"] });
      qc.invalidateQueries({ queryKey: ["price-sync-drift"] });
    },
  });
}
