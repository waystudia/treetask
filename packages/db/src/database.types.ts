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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      areas: {
        Row: {
          color: string
          created_at: string
          description: string
          id: string
          name: string
          owner_id: string
          position: number
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string
          id?: string
          name: string
          owner_id: string
          position?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string
          id?: string
          name?: string
          owner_id?: string
          position?: number
          updated_at?: string
        }
        Relationships: []
      }
      activity_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: number
          payload: Json
          project_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: never
          payload?: Json
          project_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: never
          payload?: Json
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      canvas_documents: {
        Row: {
          created_at: string
          id: string
          name: string
          project_id: string
          snapshot_version: number
          updated_at: string
          updated_by: string | null
          yjs_snapshot: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string
          project_id: string
          snapshot_version?: number
          updated_at?: string
          updated_by?: string | null
          yjs_snapshot?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          project_id?: string
          snapshot_version?: number
          updated_at?: string
          updated_by?: string | null
          yjs_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "canvas_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          kind: string
          project_id: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          kind: string
          project_id?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          project_id?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      outcome_evidence: {
        Row: {
          comment: string | null
          created_at: string
          created_by: string
          external_url: string | null
          id: string
          kind: Database["public"]["Enums"]["evidence_kind"]
          metadata: Json
          outcome_id: string
          storage_path: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          created_by: string
          external_url?: string | null
          id?: string
          kind: Database["public"]["Enums"]["evidence_kind"]
          metadata?: Json
          outcome_id: string
          storage_path?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          created_by?: string
          external_url?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["evidence_kind"]
          metadata?: Json
          outcome_id?: string
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outcome_evidence_outcome_id_fkey"
            columns: ["outcome_id"]
            isOneToOne: false
            referencedRelation: "outcomes"
            referencedColumns: ["id"]
          },
        ]
      }
      outcomes: {
        Row: {
          created_at: string
          created_by: string
          description: string
          id: string
          project_id: string
          review_comment: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          status: Database["public"]["Enums"]["outcome_status"]
          submitted_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string
          id?: string
          project_id: string
          review_comment?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["outcome_status"]
          submitted_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          project_id?: string
          review_comment?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["outcome_status"]
          submitted_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outcomes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      photo_annotations: {
        Row: {
          annotation_data: Json
          created_at: string
          created_by: string
          id: string
          project_id: string
          source_file_id: string
          source_sha256: string
          task_id: string | null
          updated_at: string
        }
        Insert: {
          annotation_data?: Json
          created_at?: string
          created_by: string
          id?: string
          project_id: string
          source_file_id: string
          source_sha256: string
          task_id?: string | null
          updated_at?: string
        }
        Update: {
          annotation_data?: Json
          created_at?: string
          created_by?: string
          id?: string
          project_id?: string
          source_file_id?: string
          source_sha256?: string
          task_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "photo_annotations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_annotations_source_file_id_fkey"
            columns: ["source_file_id"]
            isOneToOne: false
            referencedRelation: "project_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_annotations_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          created_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_path: string | null
          bio: string
          created_at: string
          department: string
          display_name: string
          id: string
          job_title: string
          skills: string[]
          timezone: string
          updated_at: string
          weekly_capacity_hours: number
          work_status: Database["public"]["Enums"]["profile_work_status"]
        }
        Insert: {
          avatar_path?: string | null
          bio?: string
          created_at?: string
          department?: string
          display_name: string
          id: string
          job_title?: string
          skills?: string[]
          timezone?: string
          updated_at?: string
          weekly_capacity_hours?: number
          work_status?: Database["public"]["Enums"]["profile_work_status"]
        }
        Update: {
          avatar_path?: string | null
          bio?: string
          created_at?: string
          department?: string
          display_name?: string
          id?: string
          job_title?: string
          skills?: string[]
          timezone?: string
          updated_at?: string
          weekly_capacity_hours?: number
          work_status?: Database["public"]["Enums"]["profile_work_status"]
        }
        Relationships: []
      }
      project_files: {
        Row: {
          created_at: string
          folder: string
          id: string
          mime_type: string
          name: string
          project_id: string
          size_bytes: number
          storage_path: string
          task_id: string | null
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          folder?: string
          id?: string
          mime_type: string
          name: string
          project_id: string
          size_bytes: number
          storage_path: string
          task_id?: string | null
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          folder?: string
          id?: string
          mime_type?: string
          name?: string
          project_id?: string
          size_bytes?: number
          storage_path?: string
          task_id?: string | null
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_files_task_project_id_fkey"
            columns: ["task_id", "project_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id", "project_id"]
          },
        ]
      }
      project_join_attempts: {
        Row: {
          attempted_at: string
          code_hash: string
          id: string
          succeeded: boolean
          user_id: string
        }
        Insert: {
          attempted_at?: string
          code_hash: string
          id?: string
          succeeded?: boolean
          user_id: string
        }
        Update: {
          attempted_at?: string
          code_hash?: string
          id?: string
          succeeded?: boolean
          user_id?: string
        }
        Relationships: []
      }
      project_join_claims: {
        Row: {
          code_hash: string
          created_at: string
          id: string
          invite_id: string
          joined_role: Database["public"]["Enums"]["project_role"]
          project_id: string
          status: string
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          id?: string
          invite_id: string
          joined_role: Database["public"]["Enums"]["project_role"]
          project_id: string
          status: string
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          id?: string
          invite_id?: string
          joined_role?: Database["public"]["Enums"]["project_role"]
          project_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_join_claims_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "project_join_invites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_join_claims_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_join_invites: {
        Row: {
          allocation_percent: number
          code_hash: string
          created_at: string
          created_by: string
          expires_at: string
          id: string
          project_id: string
          responsibility: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["project_role"]
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          allocation_percent?: number
          code_hash: string
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          project_id: string
          responsibility?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["project_role"]
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          allocation_percent?: number
          code_hash?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          project_id?: string
          responsibility?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["project_role"]
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_join_invites_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          allocation_percent: number
          invited_by: string | null
          joined_at: string
          project_id: string
          responsibility: string
          role: Database["public"]["Enums"]["project_role"]
          user_id: string
        }
        Insert: {
          allocation_percent?: number
          invited_by?: string | null
          joined_at?: string
          project_id: string
          responsibility?: string
          role?: Database["public"]["Enums"]["project_role"]
          user_id: string
        }
        Update: {
          allocation_percent?: number
          invited_by?: string | null
          joined_at?: string
          project_id?: string
          responsibility?: string
          role?: Database["public"]["Enums"]["project_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          area_id: string | null
          archived_at: string | null
          color: string
          created_at: string
          current_stage: string
          description: string
          enabled_views: Database["public"]["Enums"]["project_module"][]
          goal: string
          icon: string
          id: string
          name: string
          outcome_ratio: number
          owner_id: string
          plan: string
          space_type: Database["public"]["Enums"]["project_space_type"]
          task_ratio: number
          updated_at: string
          wip_limit: number
        }
        Insert: {
          area_id?: string | null
          archived_at?: string | null
          color?: string
          created_at?: string
          current_stage?: string
          description?: string
          enabled_views?: Database["public"]["Enums"]["project_module"][]
          goal?: string
          icon?: string
          id?: string
          name: string
          outcome_ratio?: number
          owner_id: string
          plan?: string
          space_type?: Database["public"]["Enums"]["project_space_type"]
          task_ratio?: number
          updated_at?: string
          wip_limit?: number
        }
        Update: {
          area_id?: string | null
          archived_at?: string | null
          color?: string
          created_at?: string
          current_stage?: string
          description?: string
          enabled_views?: Database["public"]["Enums"]["project_module"][]
          goal?: string
          icon?: string
          id?: string
          name?: string
          outcome_ratio?: number
          owner_id?: string
          plan?: string
          space_type?: Database["public"]["Enums"]["project_space_type"]
          task_ratio?: number
          updated_at?: string
          wip_limit?: number
        }
        Relationships: [
          {
            foreignKeyName: "projects_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
        ]
      }
      task_checklist_items: {
        Row: {
          completed: boolean
          created_at: string
          id: string
          position: number
          task_id: string
          title: string
          updated_at: string
        }
        Insert: {
          completed?: boolean
          created_at?: string
          id?: string
          position?: number
          task_id: string
          title: string
          updated_at?: string
        }
        Update: {
          completed?: boolean
          created_at?: string
          id?: string
          position?: number
          task_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_checklist_items_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          description: string
          due_at: string | null
          id: string
          manual_progress: number
          parent_task_id: string | null
          position: number
          progress_mode: Database["public"]["Enums"]["task_progress_mode"]
          project_id: string
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
          weight: number
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          description?: string
          due_at?: string | null
          id?: string
          manual_progress?: number
          parent_task_id?: string | null
          position?: number
          progress_mode?: Database["public"]["Enums"]["task_progress_mode"]
          project_id: string
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
          weight?: number
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string
          due_at?: string | null
          id?: string
          manual_progress?: number
          parent_task_id?: string | null
          position?: number
          progress_mode?: Database["public"]["Enums"]["task_progress_mode"]
          project_id?: string
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_platform_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      purge_my_data: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
    }
    Enums: {
      evidence_kind:
        | "photo"
        | "file"
        | "link"
        | "document"
        | "screenshot"
        | "review_comment"
      outcome_status:
        | "not_started"
        | "in_progress"
        | "submitted"
        | "confirmed"
        | "rejected"
      project_role: "owner" | "admin" | "reviewer" | "member" | "viewer"
      profile_work_status: "available" | "focused" | "busy" | "away"
      project_module: "tasks" | "canvas" | "calendar"
      project_space_type: "personal" | "team"
      task_progress_mode: "binary" | "checklist" | "manual"
      task_status:
        | "backlog"
        | "planned"
        | "in_progress"
        | "blocked"
        | "done"
        | "archived"
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
      evidence_kind: [
        "photo",
        "file",
        "link",
        "document",
        "screenshot",
        "review_comment",
      ],
      outcome_status: [
        "not_started",
        "in_progress",
        "submitted",
        "confirmed",
        "rejected",
      ],
      project_role: ["owner", "admin", "reviewer", "member", "viewer"],
      profile_work_status: ["available", "focused", "busy", "away"],
      project_module: ["tasks", "canvas", "calendar"],
      project_space_type: ["personal", "team"],
      task_progress_mode: ["binary", "checklist", "manual"],
      task_status: [
        "backlog",
        "planned",
        "in_progress",
        "blocked",
        "done",
        "archived",
      ],
    },
  },
} as const
