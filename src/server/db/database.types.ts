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
      activity_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          actor_number: string | null
          created_at: string
          detail: string | null
          id: string
          ip: string | null
          target: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          actor_number?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          ip?: string | null
          target?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          actor_number?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          ip?: string | null
          target?: string | null
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string
          id: string
          id_number: string
          password_hash: string
          role: string
        }
        Insert: {
          created_at?: string
          id?: string
          id_number: string
          password_hash: string
          role: string
        }
        Update: {
          created_at?: string
          id?: string
          id_number?: string
          password_hash?: string
          role?: string
        }
        Relationships: []
      }
      dtr_entries: {
        Row: {
          day: number
          id: string
          record_id: string
          remarks: string
          schedule: string
          time_in: string
          time_out: string
        }
        Insert: {
          day: number
          id?: string
          record_id: string
          remarks?: string
          schedule?: string
          time_in?: string
          time_out?: string
        }
        Update: {
          day?: number
          id?: string
          record_id?: string
          remarks?: string
          schedule?: string
          time_in?: string
          time_out?: string
        }
        Relationships: [
          {
            foreignKeyName: "dtr_entries_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "dtr_records"
            referencedColumns: ["id"]
          },
        ]
      }
      dtr_records: {
        Row: {
          area: string
          attachment_name: string | null
          attachment_path: string | null
          certified_by: string
          created_at: string
          designation: string
          emp_no: string
          employee_signature: string
          id: string
          month: number
          name: string
          owner_id: string | null
          period: string
          updated_at: string
          year: number
        }
        Insert: {
          area?: string
          attachment_name?: string | null
          attachment_path?: string | null
          certified_by?: string
          created_at?: string
          designation?: string
          emp_no?: string
          employee_signature?: string
          id?: string
          month?: number
          name?: string
          owner_id?: string | null
          period?: string
          updated_at?: string
          year?: number
        }
        Update: {
          area?: string
          attachment_name?: string | null
          attachment_path?: string | null
          certified_by?: string
          created_at?: string
          designation?: string
          emp_no?: string
          employee_signature?: string
          id?: string
          month?: number
          name?: string
          owner_id?: string | null
          period?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "dtr_records_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          access_code_id: string
          area: string
          designation: string
          emp_no: string
          full_name: string
          signature: string
          updated_at: string
        }
        Insert: {
          access_code_id: string
          area?: string
          designation?: string
          emp_no?: string
          full_name?: string
          signature?: string
          updated_at?: string
        }
        Update: {
          access_code_id?: string
          area?: string
          designation?: string
          emp_no?: string
          full_name?: string
          signature?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_access_code_id_fkey"
            columns: ["access_code_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ob_forms: {
        Row: {
          approved_by: string
          approved_via_viber: boolean
          attachment_approved: boolean
          attachment_name: string | null
          attachment_path: string | null
          created_at: string
          date_filed: string
          date_of_ob: string
          department: string
          employee_name: string
          employee_signature: string
          id: string
          id_number: string
          owner_id: string | null
          position: string
          updated_at: string
        }
        Insert: {
          approved_by?: string
          approved_via_viber?: boolean
          attachment_approved?: boolean
          attachment_name?: string | null
          attachment_path?: string | null
          created_at?: string
          date_filed?: string
          date_of_ob?: string
          department?: string
          employee_name?: string
          employee_signature?: string
          id?: string
          id_number?: string
          owner_id?: string | null
          position?: string
          updated_at?: string
        }
        Update: {
          approved_by?: string
          approved_via_viber?: boolean
          attachment_approved?: boolean
          attachment_name?: string | null
          attachment_path?: string | null
          created_at?: string
          date_filed?: string
          date_of_ob?: string
          department?: string
          employee_name?: string
          employee_signature?: string
          id?: string
          id_number?: string
          owner_id?: string | null
          position?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ob_forms_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ob_entries: {
        Row: {
          form_id: string
          from_place: string
          id: string
          idx: number
          purpose: string
          time_departure: string
          time_return: string
          to_place: string
        }
        Insert: {
          form_id: string
          from_place?: string
          id?: string
          idx: number
          purpose?: string
          time_departure?: string
          time_return?: string
          to_place?: string
        }
        Update: {
          form_id?: string
          from_place?: string
          id?: string
          idx?: number
          purpose?: string
          time_departure?: string
          time_return?: string
          to_place?: string
        }
        Relationships: [
          {
            foreignKeyName: "ob_entries_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "ob_forms"
            referencedColumns: ["id"]
          },
        ]
      }
      dtr_template: {
        Row: {
          certified_by_label: string
          certifier_signature_label: string
          columns: Json
          default_period: string
          default_schedule: string
          employee_signature_label: string
          id: number
          org_name: string
          title: string
          updated_at: string
        }
        Insert: {
          certified_by_label?: string
          certifier_signature_label?: string
          columns?: Json
          default_period?: string
          default_schedule?: string
          employee_signature_label?: string
          id?: number
          org_name?: string
          title?: string
          updated_at?: string
        }
        Update: {
          certified_by_label?: string
          certifier_signature_label?: string
          columns?: Json
          default_period?: string
          default_schedule?: string
          employee_signature_label?: string
          id?: number
          org_name?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
