import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect, useCallback } from "react";

// Fetch all rate_library items with optional search/category filter
export function usePriceLibrary(search: string = "", category: string = "all") {
  return useQuery({
    queryKey: ["price-library", search, category],
    queryFn: async () => {
      let q = supabase.from("rate_library").select("*").order("created_at", { ascending: false });
      if (category !== "all") q = q.eq("category", category);
      if (search) {
        q = q.or(`standard_name_ar.ilike.%${search}%,standard_name_en.ilike.%${search}%,item_code.ilike.%${search}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });
}

// Fetch distinct categories
export function usePriceLibraryCategories() {
  return useQuery({
    queryKey: ["price-library-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("rate_library").select("category");
      if (error) throw error;
      const cats = [...new Set((data || []).map((r: any) => r.category))].filter(Boolean).sort();
      return cats;
    },
  });
}

// Update a price library item (inline edit)
export function useUpdatePriceItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates, oldPrice, newPrice, userId }: {
      id: string;
      updates: Record<string, any>;
      oldPrice?: number;
      newPrice?: number;
      userId?: string;
    }) => {
      const { error } = await supabase.from("rate_library").update(updates).eq("id", id);
      if (error) throw error;
      // Log price change if price changed
      if (oldPrice !== undefined && newPrice !== undefined && oldPrice !== newPrice && userId) {
        await supabase.from("price_change_log").insert({
          rate_library_id: id,
          old_price: oldPrice,
          new_price: newPrice,
          changed_by: userId,
          change_reason: "Inline edit",
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["price-library"] });
    },
  });
}

// Approve a price item
export function useApprovePriceItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, userId }: { id: string; userId: string }) => {
      const { error } = await supabase.from("rate_library").update({
        approved_by: userId,
        approved_at: new Date().toISOString(),
        source_type: "Approved",
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["price-library"] });
    },
  });
}

// Delete a price item
export function useDeletePriceItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rate_library").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["price-library"] });
    },
  });
}

// Add new price item
export function useAddPriceItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: {
      standard_name_ar: string;
      standard_name_en?: string;
      category: string;
      unit: string;
      base_rate: number;
      min_rate: number;
      max_rate: number;
      item_code?: string;
      item_name_aliases?: string[];
    }) => {
      const { data, error } = await supabase.from("rate_library").insert({
        ...item,
        target_rate: item.base_rate,
      }).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["price-library"] });
    },
  });
}

// Budget distribution hooks
export function useBudgetDistribution(projectId: string | undefined) {
  return useQuery({
    queryKey: ["budget-distribution", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_budget_distribution")
        .select("*")
        .eq("project_id", projectId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertBudgetDistribution() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      id?: string;
      project_id: string;
      user_id: string;
      total_amount: number;
      materials_percentage: number;
      labor_percentage: number;
      equipment_percentage: number;
      other_percentage: number;
    }) => {
      const amounts = {
        materials_amount: +(params.total_amount * params.materials_percentage / 100).toFixed(2),
        labor_amount: +(params.total_amount * params.labor_percentage / 100).toFixed(2),
        equipment_amount: +(params.total_amount * params.equipment_percentage / 100).toFixed(2),
        other_amount: +(params.total_amount * params.other_percentage / 100).toFixed(2),
      };
      const payload = { ...params, ...amounts, updated_at: new Date().toISOString() };
      if (params.id) {
        const { error } = await supabase.from("project_budget_distribution").update(payload).eq("id", params.id);
        if (error) throw error;
      } else {
        const { id: _, ...rest } = payload;
        const { error } = await supabase.from("project_budget_distribution").insert(rest);
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["budget-distribution", vars.project_id] });
    },
  });
}

// Bulk upsert for Excel import
export function useBulkUpsertPriceItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (items: Array<{
      id?: string;
      standard_name_ar: string;
      standard_name_en?: string;
      category: string;
      unit: string;
      base_rate: number;
      min_rate: number;
      max_rate: number;
      item_code?: string;
      item_name_aliases?: string[];
      isUpdate?: boolean;
    }>) => {
      const toUpdate = items.filter(i => i.isUpdate && i.id);
      const toInsert = items.filter(i => !i.isUpdate);

      for (const item of toUpdate) {
        const { id, isUpdate, ...rest } = item;
        await supabase.from("rate_library").update({ ...rest, target_rate: rest.base_rate }).eq("id", id!);
      }

      if (toInsert.length > 0) {
        const inserts = toInsert.map(({ isUpdate, id, ...rest }) => ({
          ...rest,
          target_rate: rest.base_rate,
        }));
        const { error } = await supabase.from("rate_library").insert(inserts);
        if (error) throw error;
      }

      return { updated: toUpdate.length, inserted: toInsert.length };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["price-library"] });
    },
  });
}

// Match price item hook with debounce
export function useMatchPriceItem() {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const match = useCallback(async (itemName: string, unit?: string) => {
    if (!itemName || itemName.length < 3) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("match-price-item", {
        body: { item_name: itemName, unit },
      });
      if (error) throw error;
      setResults(data?.matches || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { results, loading, match };
}
