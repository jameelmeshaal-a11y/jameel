import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─── Projects ───

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: ["projects", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; cities: string[] }) => {
      const { data, error } = await supabase
        .from("projects")
        .insert({ name: input.name, cities: input.cities, status: "draft" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; updates: Record<string, any> }) => {
      const { error } = await supabase
        .from("projects")
        .update(input.updates)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

// ─── Documents ───

export function useProjectDocuments(projectId: string | undefined) {
  return useQuery({
    queryKey: ["documents", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_documents")
        .select("*")
        .eq("project_id", projectId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useUploadDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      projectId: string;
      file: File;
      category: "core" | "technical" | "other";
    }) => {
      const ext = input.file.name.split(".").pop() || "bin";
      const safeName = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
      const filePath = `${input.projectId}/${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, input.file);
      if (uploadError) throw uploadError;

      const ext = input.file.name.split(".").pop()?.toUpperCase() || "";
      const sizeStr = input.file.size < 1024 * 1024
        ? `${Math.round(input.file.size / 1024)} KB`
        : `${(input.file.size / (1024 * 1024)).toFixed(1)} MB`;

      const { error: dbError } = await supabase
        .from("project_documents")
        .insert({
          project_id: input.projectId,
          name: input.file.name,
          file_path: filePath,
          file_type: ext,
          size: sizeStr,
          doc_category: input.category,
        });
      if (dbError) throw dbError;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["documents", vars.projectId] });
    },
  });
}

// ─── BoQ Files ───

export function useBoQFiles(projectId: string | undefined) {
  return useQuery({
    queryKey: ["boq-files", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("boq_files")
        .select("*")
        .eq("project_id", projectId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

// ─── BoQ Items ───

export function useBoQItems(boqFileId: string | undefined) {
  return useQuery({
    queryKey: ["boq-items", boqFileId],
    enabled: !!boqFileId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("boq_items")
        .select("*")
        .eq("boq_file_id", boqFileId!)
        .order("row_index", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}
