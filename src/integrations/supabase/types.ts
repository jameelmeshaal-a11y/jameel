export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      boq_files: {
        Row: {
          created_at: string
          file_path: string
          id: string
          name: string
          project_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          file_path: string
          id?: string
          name: string
          project_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          file_path?: string
          id?: string
          name?: string
          project_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "boq_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      boq_items: {
        Row: {
          boq_file_id: string
          confidence: number | null
          created_at: string
          description: string
          description_en: string
          equipment: number | null
          id: string
          item_no: string
          labor: number | null
          location_factor: number | null
          logistics: number | null
          materials: number | null
          notes: string | null
          profit: number | null
          quantity: number
          risk: number | null
          row_index: number
          source: string | null
          status: string
          total_price: number | null
          unit: string
          unit_rate: number | null
        }
        Insert: {
          boq_file_id: string
          confidence?: number | null
          created_at?: string
          description?: string
          description_en?: string
          equipment?: number | null
          id?: string
          item_no?: string
          labor?: number | null
          location_factor?: number | null
          logistics?: number | null
          materials?: number | null
          notes?: string | null
          profit?: number | null
          quantity?: number
          risk?: number | null
          row_index?: number
          source?: string | null
          status?: string
          total_price?: number | null
          unit?: string
          unit_rate?: number | null
        }
        Update: {
          boq_file_id?: string
          confidence?: number | null
          created_at?: string
          description?: string
          description_en?: string
          equipment?: number | null
          id?: string
          item_no?: string
          labor?: number | null
          location_factor?: number | null
          logistics?: number | null
          materials?: number | null
          notes?: string | null
          profit?: number | null
          quantity?: number
          risk?: number | null
          row_index?: number
          source?: string | null
          status?: string
          total_price?: number | null
          unit?: string
          unit_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "boq_items_boq_file_id_fkey"
            columns: ["boq_file_id"]
            isOneToOne: false
            referencedRelation: "boq_files"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_documents: {
        Row: {
          created_at: string
          doc_category: string
          file_path: string
          file_type: string
          id: string
          name: string
          project_id: string
          size: string
        }
        Insert: {
          created_at?: string
          doc_category?: string
          file_path: string
          file_type?: string
          id?: string
          name: string
          project_id: string
          size?: string
        }
        Update: {
          created_at?: string
          doc_category?: string
          file_path?: string
          file_type?: string
          id?: string
          name?: string
          project_id?: string
          size?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          boq_count: number
          cities: string[]
          created_at: string
          id: string
          name: string
          status: string
          total_value: number
          updated_at: string
        }
        Insert: {
          boq_count?: number
          cities?: string[]
          created_at?: string
          id?: string
          name: string
          status?: string
          total_value?: number
          updated_at?: string
        }
        Update: {
          boq_count?: number
          cities?: string[]
          created_at?: string
          id?: string
          name?: string
          status?: string
          total_value?: number
          updated_at?: string
        }
        Relationships: []
      }
      rate_library: {
        Row: {
          base_city: string
          base_rate: number
          category: string
          complexity: string
          created_at: string
          created_by: string | null
          equipment_pct: number
          id: string
          is_locked: boolean
          keywords: string[]
          labor_pct: number
          last_reviewed_at: string | null
          logistics_pct: number
          market_level: string
          materials_pct: number
          max_rate: number
          min_rate: number
          notes: string | null
          profit_pct: number
          risk_pct: number
          source_type: string
          standard_name_ar: string
          standard_name_en: string
          target_rate: number
          unit: string
          updated_at: string
          weight_class: string
        }
        Insert: {
          base_city?: string
          base_rate: number
          category: string
          complexity?: string
          created_at?: string
          created_by?: string | null
          equipment_pct?: number
          id?: string
          is_locked?: boolean
          keywords?: string[]
          labor_pct?: number
          last_reviewed_at?: string | null
          logistics_pct?: number
          market_level?: string
          materials_pct?: number
          max_rate: number
          min_rate: number
          notes?: string | null
          profit_pct?: number
          risk_pct?: number
          source_type?: string
          standard_name_ar: string
          standard_name_en?: string
          target_rate?: number
          unit: string
          updated_at?: string
          weight_class?: string
        }
        Update: {
          base_city?: string
          base_rate?: number
          category?: string
          complexity?: string
          created_at?: string
          created_by?: string | null
          equipment_pct?: number
          id?: string
          is_locked?: boolean
          keywords?: string[]
          labor_pct?: number
          last_reviewed_at?: string | null
          logistics_pct?: number
          market_level?: string
          materials_pct?: number
          max_rate?: number
          min_rate?: number
          notes?: string | null
          profit_pct?: number
          risk_pct?: number
          source_type?: string
          standard_name_ar?: string
          standard_name_en?: string
          target_rate?: number
          unit?: string
          updated_at?: string
          weight_class?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
