// Generated from the Supabase schema. Regenerate with:
//   supabase gen types typescript --project-id <ref> > lib/database.types.ts
// Do not edit by hand.

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
      ai_briefings: {
        Row: {
          cached_tokens: number | null
          content: Json
          cost_cents: number | null
          generated_at: string | null
          generated_by: string | null
          id: string
          input_tokens: number | null
          latency_ms: number | null
          model: string | null
          output_tokens: number | null
          week_start: string
        }
        Insert: {
          cached_tokens?: number | null
          content: Json
          cost_cents?: number | null
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string | null
          output_tokens?: number | null
          week_start: string
        }
        Update: {
          cached_tokens?: number | null
          content?: Json
          cost_cents?: number | null
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string | null
          output_tokens?: number | null
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_briefings_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      bug_reports: {
        Row: {
          created_at: string | null
          description: string
          id: string
          page: string
          screenshot_path: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description: string
          id?: string
          page: string
          screenshot_path?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string
          id?: string
          page?: string
          screenshot_path?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bug_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_attachments: {
        Row: {
          created_at: string | null
          file_name: string
          file_path: string | null
          file_size: number | null
          id: string
          type: string
          url: string | null
          user_id: string
          week_start: string
        }
        Insert: {
          created_at?: string | null
          file_name: string
          file_path?: string | null
          file_size?: number | null
          id?: string
          type: string
          url?: string | null
          user_id: string
          week_start: string
        }
        Update: {
          created_at?: string | null
          file_name?: string
          file_path?: string | null
          file_size?: number | null
          id?: string
          type?: string
          url?: string | null
          user_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_attachments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_notes: {
        Row: {
          id: string
          notes: string | null
          updated_at: string | null
          updated_by: string | null
          user_id: string
          week_start: string
        }
        Insert: {
          id?: string
          notes?: string | null
          updated_at?: string | null
          updated_by?: string | null
          user_id: string
          week_start: string
        }
        Update: {
          id?: string
          notes?: string | null
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_notes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      microsoft_tokens: {
        Row: {
          access_token: string
          created_at: string | null
          expires_at: string
          refresh_token: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string | null
          expires_at: string
          refresh_token: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string | null
          expires_at?: string
          refresh_token?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "microsoft_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      objective_opportunities: {
        Row: {
          created_at: string | null
          customer: string | null
          estimated_value_number: number | null
          estimated_value_text: string | null
          id: string
          objective_id: string
          project_description: string | null
          segment: string | null
          sort_order: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          customer?: string | null
          estimated_value_number?: number | null
          estimated_value_text?: string | null
          id?: string
          objective_id: string
          project_description?: string | null
          segment?: string | null
          sort_order?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          customer?: string | null
          estimated_value_number?: number | null
          estimated_value_text?: string | null
          id?: string
          objective_id?: string
          project_description?: string | null
          segment?: string | null
          sort_order?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objective_opportunities_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "strategic_objectives"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_objectives: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          pending_user_email: string
          sort_order: number | null
          target_date: string | null
          title: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          pending_user_email: string
          sort_order?: number | null
          target_date?: string | null
          title: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          pending_user_email?: string
          sort_order?: number | null
          target_date?: string | null
          title?: string
        }
        Relationships: []
      }
      pending_sub_objectives: {
        Row: {
          created_at: string | null
          id: string
          pending_objective_id: string
          sort_order: number | null
          title: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          pending_objective_id: string
          sort_order?: number | null
          title: string
        }
        Update: {
          created_at?: string | null
          id?: string
          pending_objective_id?: string
          sort_order?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_sub_objectives_pending_objective_id_fkey"
            columns: ["pending_objective_id"]
            isOneToOne: false
            referencedRelation: "pending_objectives"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_users: {
        Row: {
          created_at: string | null
          email: string
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name?: string | null
          id?: string
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      reminder_log: {
        Row: {
          email_type: string
          id: string
          meeting_subject: string | null
          sent_at: string | null
          user_id: string
          week_start: string
        }
        Insert: {
          email_type?: string
          id?: string
          meeting_subject?: string | null
          sent_at?: string | null
          user_id: string
          week_start: string
        }
        Update: {
          email_type?: string
          id?: string
          meeting_subject?: string | null
          sent_at?: string | null
          user_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      smartsheet_snapshots: {
        Row: {
          description: string | null
          external_id: string
          id: string
          latest_update: string | null
          previous_status: string | null
          snapshot_at: string | null
          status: string | null
          topic: string | null
          user_id: string
          week_start: string
        }
        Insert: {
          description?: string | null
          external_id: string
          id?: string
          latest_update?: string | null
          previous_status?: string | null
          snapshot_at?: string | null
          status?: string | null
          topic?: string | null
          user_id: string
          week_start: string
        }
        Update: {
          description?: string | null
          external_id?: string
          id?: string
          latest_update?: string | null
          previous_status?: string | null
          snapshot_at?: string | null
          status?: string | null
          topic?: string | null
          user_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "smartsheet_snapshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      strategic_objectives: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          opportunity_target: number | null
          owner_id: string
          short_title: string | null
          sort_order: number | null
          target_date: string | null
          title: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          opportunity_target?: number | null
          owner_id: string
          short_title?: string | null
          sort_order?: number | null
          target_date?: string | null
          title: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          opportunity_target?: number | null
          owner_id?: string
          short_title?: string | null
          sort_order?: number | null
          target_date?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategic_objectives_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sub_objectives: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_implicit: boolean | null
          objective_id: string
          short_title: string | null
          sort_order: number | null
          title: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_implicit?: boolean | null
          objective_id: string
          short_title?: string | null
          sort_order?: number | null
          title: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_implicit?: boolean | null
          objective_id?: string
          short_title?: string | null
          sort_order?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "sub_objectives_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "strategic_objectives"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string | null
          email: string
          full_name: string
          id: string
          role: string
          timezone: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name: string
          id: string
          role: string
          timezone?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          role?: string
          timezone?: string | null
        }
        Relationships: []
      }
      weekly_checkins: {
        Row: {
          comments: string | null
          discuss_in_meeting: boolean | null
          id: string
          progress_this_week: string | null
          status: string
          sub_objective_id: string
          submitted_at: string | null
          submitted_by: string
          support_needed: string | null
          week_start: string
        }
        Insert: {
          comments?: string | null
          discuss_in_meeting?: boolean | null
          id?: string
          progress_this_week?: string | null
          status: string
          sub_objective_id: string
          submitted_at?: string | null
          submitted_by: string
          support_needed?: string | null
          week_start: string
        }
        Update: {
          comments?: string | null
          discuss_in_meeting?: boolean | null
          id?: string
          progress_this_week?: string | null
          status?: string
          sub_objective_id?: string
          submitted_at?: string | null
          submitted_by?: string
          support_needed?: string | null
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_checkins_sub_objective_id_fkey"
            columns: ["sub_objective_id"]
            isOneToOne: false
            referencedRelation: "sub_objectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_checkins_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
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
    Enums: {},
  },
} as const
