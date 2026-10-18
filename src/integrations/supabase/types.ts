export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      contacts: {
        Row: {
          created_at: string;
          first_name: string;
          id: string;
          project_id: string;
          relation: string;
          source: string;
          stage: number;
          status: string;
          user_id: string;
          why: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          first_name: string;
          id?: string;
          project_id: string;
          relation?: string;
          source?: string;
          stage?: number;
          status?: string;
          user_id?: string;
          why?: string;
        };
        Update: {
          created_at?: string;
          first_name?: string;
          id?: string;
          project_id?: string;
          relation?: string;
          source?: string;
          stage?: number;
          status?: string;
          user_id?: string;
          why?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contacts_project_id_fkey";
            columns: ["project_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      experiments: {
        Row: {
          change: string;
          created_at: string;
          hypothesis: string;
          id: string;
          project_id: string;
          result: string;
          stage: number;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          change?: string;
          created_at?: string;
          hypothesis?: string;
          id?: string;
          project_id: string;
          result?: string;
          stage?: number;
          user_id?: string;
        };
        Update: {
          change?: string;
          created_at?: string;
          hypothesis?: string;
          id?: string;
          project_id?: string;
          result?: string;
          stage?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "experiments_project_id_fkey";
            columns: ["project_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      interviews: {
        Row: {
          answers: NonNullable<Json>;
          completed: boolean;
          contact_id: string | null;
          created_at: string;
          id: string;
          project_id: string;
          tags: string[];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          answers?: NonNullable<Json>;
          completed?: boolean;
          contact_id?: string | null;
          created_at?: string;
          id?: string;
          project_id: string;
          tags?: string[];
          user_id?: string;
        };
        Update: {
          answers?: NonNullable<Json>;
          completed?: boolean;
          contact_id?: string | null;
          created_at?: string;
          id?: string;
          project_id?: string;
          tags?: string[];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "interviews_contact_id_fkey";
            columns: ["contact_id", "project_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id", "project_id", "user_id"];
          },
          {
            foreignKeyName: "interviews_project_id_fkey";
            columns: ["project_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      learnings: {
        Row: {
          accepted: boolean;
          body: string;
          created_at: string;
          data: NonNullable<Json>;
          generation_origin_id: string | null;
          id: string;
          kind: string;
          project_id: string;
          stage: number;
          title: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          accepted?: boolean;
          body?: string;
          created_at?: string;
          data?: NonNullable<Json>;
          generation_origin_id?: string | null;
          id?: string;
          kind?: string;
          project_id: string;
          stage?: number;
          title?: string;
          user_id?: string;
        };
        Update: {
          accepted?: boolean;
          body?: string;
          created_at?: string;
          data?: NonNullable<Json>;
          generation_origin_id?: string | null;
          id?: string;
          kind?: string;
          project_id?: string;
          stage?: number;
          title?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "learnings_project_id_fkey";
            columns: ["project_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      marketing_plans: {
        Row: {
          created_at: string;
          document: NonNullable<Json>;
          history: NonNullable<Json>;
          id: string;
          last_mutation_hash: string;
          last_mutation_id: string;
          project_id: string;
          revision: number;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          document: NonNullable<Json>;
          history?: NonNullable<Json>;
          id?: string;
          last_mutation_hash: string;
          last_mutation_id: string;
          project_id: string;
          revision?: number;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          document?: NonNullable<Json>;
          history?: NonNullable<Json>;
          id?: string;
          last_mutation_hash?: string;
          last_mutation_id?: string;
          project_id?: string;
          revision?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "marketing_plans_project_id_fkey";
            columns: ["project_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      outreach: {
        Row: {
          body: string;
          created_at: string;
          generation_origin_id: string | null;
          id: string;
          kind: string;
          project_id: string;
          stage: number;
          title: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          body?: string;
          created_at?: string;
          generation_origin_id?: string | null;
          id?: string;
          kind?: string;
          project_id: string;
          stage?: number;
          title?: string;
          user_id?: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          generation_origin_id?: string | null;
          id?: string;
          kind?: string;
          project_id?: string;
          stage?: number;
          title?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "outreach_project_id_fkey";
            columns: ["project_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      project_members: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          project_id: string;
          revision: number;
          role: string;
          state: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by: string;
          id?: string;
          project_id: string;
          revision?: number;
          role: string;
          state?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          project_id?: string;
          revision?: number;
          role?: string;
          state?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_members_project_owner_fkey";
            columns: ["project_id", "created_by"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      projects: {
        Row: {
          archived_at: string | null;
          audience: string;
          checklist: NonNullable<Json>;
          created_at: string;
          description: string;
          id: string;
          lifecycle_revision: number;
          link: string;
          name: string;
          problem: string;
          questions: NonNullable<Json>;
          questions_origin_id: string | null;
          stage: number;
          survey: NonNullable<Json>;
          survey_origin_id: string | null;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          audience?: string;
          checklist?: NonNullable<Json>;
          created_at?: string;
          description?: string;
          id?: string;
          lifecycle_revision?: number;
          link?: string;
          name?: string;
          problem?: string;
          questions?: NonNullable<Json>;
          questions_origin_id?: string | null;
          stage?: number;
          survey?: NonNullable<Json>;
          survey_origin_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          archived_at?: string | null;
          audience?: string;
          checklist?: NonNullable<Json>;
          created_at?: string;
          description?: string;
          id?: string;
          lifecycle_revision?: number;
          link?: string;
          name?: string;
          problem?: string;
          questions?: NonNullable<Json>;
          questions_origin_id?: string | null;
          stage?: number;
          survey?: NonNullable<Json>;
          survey_origin_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      teacher_plans: {
        Row: {
          created_at: string;
          document: NonNullable<Json>;
          id: string;
          last_mutation_hash: string;
          last_mutation_id: string;
          project_id: string;
          revision: number;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          document: NonNullable<Json>;
          id?: string;
          last_mutation_hash: string;
          last_mutation_id: string;
          project_id: string;
          revision?: number;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          document?: NonNullable<Json>;
          id?: string;
          last_mutation_hash?: string;
          last_mutation_id?: string;
          project_id?: string;
          revision?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "teacher_plans_project_id_fkey";
            columns: ["project_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      create_owned_project: {
        Args: {
          p_audience: string;
          p_description: string;
          p_link?: string;
          p_name: string;
          p_problem: string;
          p_project_id: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      current_platform_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      current_project_role: { Args: { p_project_id: string }; Returns: string };
      get_ai_generation_origin: {
        Args: { p_origin_id: string; p_project_id: string };
        Returns: Json;
      };
      get_founding_partner_counts: { Args: Record<PropertyKey, never>; Returns: Json };
      get_member_project_summary: { Args: { p_project_id: string }; Returns: Json };
      get_platform_admin_authorization: { Args: Record<PropertyKey, never>; Returns: Json };
      list_project_members: { Args: { p_cursor?: string; p_project_id: string }; Returns: Json };
      project_collaboration_enabled: { Args: Record<PropertyKey, never>; Returns: boolean };
      record_ai_generation: { Args: { p_record: Json }; Returns: string };
      record_founding_partner: {
        Args: {
          p_email: string;
          p_ip_hash?: string;
          p_kind: string;
          p_note: string;
          p_school: string;
        };
        Returns: Json;
      };
      record_platform_admin_action: {
        Args: { p_operation: string; p_outcome: string; p_request_id: string };
        Returns: string;
      };
      reserve_demo_ai: { Args: { p_project_id: string; p_request_id: string }; Returns: Json };
      revoke_project_member: {
        Args: {
          p_expected_revision: number;
          p_project_id: string;
          p_request_id: string;
          p_target_user_id: string;
        };
        Returns: Json;
      };
      save_generated_outreach: {
        Args: {
          p_origin_id: string;
          p_project_id: string;
          p_rows: Json;
          p_stage: number;
          p_survey?: Json;
        };
        Returns: undefined;
      };
      save_marketing_plan: {
        Args: {
          p_complete_student_first: boolean;
          p_document: Json;
          p_expected_revision: number;
          p_mutation_id: string;
          p_project_id: string;
        };
        Returns: Json;
      };
      save_teacher_plan: {
        Args: {
          p_document: Json;
          p_expected_revision: number;
          p_mutation_id: string;
          p_project_id: string;
        };
        Returns: Json;
      };
      set_owned_project_archived: {
        Args: {
          p_archived: boolean;
          p_expected_revision: number;
          p_project_id: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      set_project_member: {
        Args: {
          p_expected_revision: number;
          p_project_id: string;
          p_request_id: string;
          p_role: string;
          p_target_user_id: string;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
