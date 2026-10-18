export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      assignments: {
        Row: {
          class_id: string;
          created_at: string;
          due_at: string | null;
          id: string;
          instructions: string;
          last_editor_id: string;
          revision: number;
          state: string;
          title: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          class_id: string;
          created_at?: string;
          due_at?: string | null;
          id?: string;
          instructions?: string;
          last_editor_id: string;
          revision?: number;
          state: string;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          class_id?: string;
          created_at?: string;
          due_at?: string | null;
          id?: string;
          instructions?: string;
          last_editor_id?: string;
          revision?: number;
          state?: string;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assignments_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
        ];
      };
      class_guest_principals: {
        Row: {
          alias: string;
          class_id: string;
          created_at: string;
          id: string;
          issued_by: string;
          revoked_at: string | null;
          team_id: string;
        };
        ComputedFields: never;
        Insert: {
          alias: string;
          class_id: string;
          created_at?: string;
          id?: string;
          issued_by: string;
          revoked_at?: string | null;
          team_id: string;
        };
        Update: {
          alias?: string;
          class_id?: string;
          created_at?: string;
          id?: string;
          issued_by?: string;
          revoked_at?: string | null;
          team_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "class_guest_principals_class_id_issued_by_fkey";
            columns: ["class_id", "issued_by"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "class_guest_principals_team_id_class_id_fkey";
            columns: ["team_id", "class_id"];
            isOneToOne: false;
            referencedRelation: "class_teams";
            referencedColumns: ["id", "class_id"];
          },
        ];
      };
      class_members: {
        Row: {
          class_id: string;
          created_at: string;
          created_by: string;
          display_label: string;
          id: string;
          revision: number;
          role: string;
          state: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          class_id: string;
          created_at?: string;
          created_by: string;
          display_label: string;
          id?: string;
          revision?: number;
          role: string;
          state?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          class_id?: string;
          created_at?: string;
          created_by?: string;
          display_label?: string;
          id?: string;
          revision?: number;
          role?: string;
          state?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "class_members_class_id_created_by_fkey";
            columns: ["class_id", "created_by"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      class_project_links: {
        Row: {
          active: boolean;
          class_id: string;
          created_at: string;
          id: string;
          project_id: string;
          revision: number;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          class_id: string;
          created_at?: string;
          id?: string;
          project_id: string;
          revision?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          active?: boolean;
          class_id?: string;
          created_at?: string;
          id?: string;
          project_id?: string;
          revision?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "class_project_links_class_id_user_id_fkey";
            columns: ["class_id", "user_id"];
            isOneToOne: true;
            referencedRelation: "class_members";
            referencedColumns: ["class_id", "user_id"];
          },
          {
            foreignKeyName: "class_project_links_project_id_user_id_fkey";
            columns: ["project_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      class_teams: {
        Row: {
          alias: string;
          archived_at: string | null;
          class_id: string;
          created_at: string;
          id: string;
          issued_by: string;
        };
        ComputedFields: never;
        Insert: {
          alias: string;
          archived_at?: string | null;
          class_id: string;
          created_at?: string;
          id?: string;
          issued_by: string;
        };
        Update: {
          alias?: string;
          archived_at?: string | null;
          class_id?: string;
          created_at?: string;
          id?: string;
          issued_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "class_teams_class_id_issued_by_fkey";
            columns: ["class_id", "issued_by"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      classes: {
        Row: {
          access_expires_at: string;
          ai_enabled: boolean;
          archived_at: string | null;
          created_at: string;
          id: string;
          instructions: string;
          mode: string;
          name: string;
          retention_days: number;
          revision: number;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          access_expires_at: string;
          ai_enabled?: boolean;
          archived_at?: string | null;
          created_at?: string;
          id?: string;
          instructions?: string;
          mode: string;
          name: string;
          retention_days?: number;
          revision?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          access_expires_at?: string;
          ai_enabled?: boolean;
          archived_at?: string | null;
          created_at?: string;
          id?: string;
          instructions?: string;
          mode?: string;
          name?: string;
          retention_days?: number;
          revision?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
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
      discovery_workspaces: {
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
          revision: number;
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
            foreignKeyName: "discovery_workspaces_project_id_user_id_fkey";
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
      interview_drafts: {
        Row: {
          completed_at: string | null;
          completed_interview_id: string | null;
          completion_request_id: string;
          contact_id: string | null;
          create_hash: string;
          created_at: string;
          document: Json | null;
          id: string;
          last_mutation_hash: string | null;
          last_mutation_id: string | null;
          project_id: string;
          questions_origin_id: string | null;
          questions_snapshot: NonNullable<Json>;
          revision: number;
          status: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          completed_at?: string | null;
          completed_interview_id?: string | null;
          completion_request_id?: string;
          contact_id?: string | null;
          create_hash: string;
          created_at?: string;
          document?: Json | null;
          id: string;
          last_mutation_hash?: string | null;
          last_mutation_id?: string | null;
          project_id: string;
          questions_origin_id?: string | null;
          questions_snapshot: NonNullable<Json>;
          revision?: number;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          completed_at?: string | null;
          completed_interview_id?: string | null;
          completion_request_id?: string;
          contact_id?: string | null;
          create_hash?: string;
          created_at?: string;
          document?: Json | null;
          id?: string;
          last_mutation_hash?: string | null;
          last_mutation_id?: string | null;
          project_id?: string;
          questions_origin_id?: string | null;
          questions_snapshot?: NonNullable<Json>;
          revision?: number;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "interview_drafts_project_id_user_id_fkey";
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
      processing_consents: {
        Row: {
          ai_status: string;
          evidence_invalidated: boolean;
          note_status: string;
          policy_version: number;
          project_id: string;
          reported_at: string;
          revision: number;
          sharing_status: string;
          target_id: string;
          target_kind: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          ai_status: string;
          evidence_invalidated?: boolean;
          note_status: string;
          policy_version: number;
          project_id: string;
          reported_at?: string;
          revision: number;
          sharing_status: string;
          target_id: string;
          target_kind: string;
          user_id: string;
        };
        Update: {
          ai_status?: string;
          evidence_invalidated?: boolean;
          note_status?: string;
          policy_version?: number;
          project_id?: string;
          reported_at?: string;
          revision?: number;
          sharing_status?: string;
          target_id?: string;
          target_kind?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "processing_consents_project_id_user_id_fkey";
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
      accept_class_invitation: {
        Args: { p_display_label: string; p_token: string };
        Returns: Json;
      };
      accept_project_invitation: {
        Args: { p_target_type: string; p_token: string };
        Returns: Json;
      };
      adopt_discovery_script: {
        Args: {
          p_expected_origin_id: string;
          p_expected_questions: Json;
          p_expected_revision: number;
          p_project_id: string;
          p_script_id: string;
        };
        Returns: Json;
      };
      associate_class_project: {
        Args: {
          p_class_id: string;
          p_expected_revision: number;
          p_project_id: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      claim_ai_usage: { Args: { p_attempt_id: string; p_operation_id: string }; Returns: Json };
      claim_ai_usage_with_context: {
        Args: { p_attempt_id: string; p_manifest: Json; p_operation_id: string };
        Returns: Json;
      };
      complete_interview_draft: {
        Args: { p_draft_id: string; p_expected_revision: number; p_project_id: string };
        Returns: Json;
      };
      create_class: {
        Args: { p_class_id: string; p_document: Json; p_request_id: string };
        Returns: Json;
      };
      create_class_invitation: {
        Args: { p_class_id: string; p_days: number; p_recipient_id: string; p_request_id: string };
        Returns: Json;
      };
      create_guest_entry: {
        Args: { p_class_id: string; p_days: number; p_max_uses: number; p_request_id: string };
        Returns: Json;
      };
      create_interview_draft: {
        Args: {
          p_contact_id: string;
          p_draft_id: string;
          p_expected_origin_id: string;
          p_expected_questions: Json;
          p_note_status: string;
          p_project_id: string;
        };
        Returns: Json;
      };
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
      create_project_invitation: {
        Args: {
          p_days?: number;
          p_project_id: string;
          p_recipient_id: string;
          p_request_id?: string;
          p_role: string;
          p_target_type: string;
        };
        Returns: Json;
      };
      current_platform_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      current_project_role: { Args: { p_project_id: string }; Returns: string };
      exchange_guest_entry: {
        Args: {
          p_client_hash: string;
          p_kind: string;
          p_principal_alias: string;
          p_team_alias: string;
          p_token: string;
        };
        Returns: Json;
      };
      finish_ai_usage: {
        Args: {
          p_action: string;
          p_attempt_id: string;
          p_generation_id?: string;
          p_operation_id: string;
        };
        Returns: Json;
      };
      get_ai_generation_origin: {
        Args: { p_origin_id: string; p_project_id: string };
        Returns: Json;
      };
      get_ai_processing_context: { Args: { p_kind: string; p_project_id: string }; Returns: Json };
      get_ai_processing_context_v2: {
        Args: { p_kind: string; p_project_id: string };
        Returns: Json;
      };
      get_class: { Args: { p_class_id: string }; Returns: Json };
      get_founding_partner_counts: { Args: Record<PropertyKey, never>; Returns: Json };
      get_guest_session: { Args: { p_session: string }; Returns: Json };
      get_member_project_summary: { Args: { p_project_id: string }; Returns: Json };
      get_platform_admin_authorization: { Args: Record<PropertyKey, never>; Returns: Json };
      get_processing_consent: {
        Args: { p_project_id: string; p_target_id: string; p_target_kind: string };
        Returns: Json;
      };
      leave_class: {
        Args: { p_class_id: string; p_expected_revision: number; p_request_id: string };
        Returns: Json;
      };
      list_class_assignments: { Args: { p_class_id: string; p_cursor?: string }; Returns: Json };
      list_class_invitations: { Args: { p_class_id: string; p_cursor?: string }; Returns: Json };
      list_class_members: { Args: { p_class_id: string; p_cursor?: string }; Returns: Json };
      list_guest_entries: { Args: { p_class_id: string }; Returns: Json };
      list_guest_teams: { Args: { p_class_id: string; p_cursor?: string }; Returns: Json };
      list_interview_drafts: { Args: { p_project_id: string }; Returns: Json };
      list_my_classes: { Args: { p_cursor?: string }; Returns: Json };
      list_project_invitations: {
        Args: { p_cursor?: string; p_project_id: string };
        Returns: Json;
      };
      list_project_members: { Args: { p_cursor?: string; p_project_id: string }; Returns: Json };
      load_discovery_workspace: { Args: { p_project_id: string }; Returns: Json };
      load_interview_draft: { Args: { p_draft_id: string; p_project_id: string }; Returns: Json };
      manage_guest_session: { Args: { p_operation: string; p_session: string }; Returns: Json };
      project_collaboration_enabled: { Args: Record<PropertyKey, never>; Returns: boolean };
      record_ai_generation: { Args: { p_record: Json }; Returns: string };
      record_ai_generation_v2: {
        Args: { p_grounding: Json; p_operation_id: string; p_record: Json };
        Returns: string;
      };
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
      remove_class_student: {
        Args: {
          p_class_id: string;
          p_expected_revision: number;
          p_membership_id: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      reserve_ai_usage: {
        Args: {
          p_context_sha256: string;
          p_input_bytes: number;
          p_kind: string;
          p_operation_id: string;
          p_project_id: string;
          p_user_id: string;
        };
        Returns: Json;
      };
      reserve_demo_ai: { Args: { p_project_id: string; p_request_id: string }; Returns: Json };
      revoke_class_invitation: {
        Args: { p_class_id: string; p_invitation_id: string; p_request_id: string };
        Returns: Json;
      };
      revoke_class_teacher: {
        Args: {
          p_class_id: string;
          p_expected_revision: number;
          p_membership_id: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      revoke_guest_entry: { Args: { p_class_id: string; p_entry_id: string }; Returns: Json };
      revoke_guest_scope: {
        Args: { p_class_id: string; p_principal_id?: string; p_team_id: string };
        Returns: Json;
      };
      revoke_project_invitation: {
        Args: { p_invitation_id: string; p_project_id: string; p_request_id: string };
        Returns: Json;
      };
      revoke_project_member: {
        Args: {
          p_expected_revision: number;
          p_project_id: string;
          p_request_id: string;
          p_target_user_id: string;
        };
        Returns: Json;
      };
      save_class_assignment: {
        Args: {
          p_assignment_id: string;
          p_class_id: string;
          p_document: Json;
          p_expected_revision: number;
          p_request_id: string;
        };
        Returns: Json;
      };
      save_discovery_workspace: {
        Args: {
          p_document: Json;
          p_expected_revision: number;
          p_mutation_id: string;
          p_project_id: string;
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
      save_interview_draft: {
        Args: {
          p_contact_id: string;
          p_document: Json;
          p_draft_id: string;
          p_expected_revision: number;
          p_mutation_id: string;
          p_project_id: string;
        };
        Returns: Json;
      };
      save_interview_with_consent: {
        Args: {
          p_ai_status: string;
          p_answers: Json;
          p_contact_id: string;
          p_note_status: string;
          p_policy_version: number;
          p_project_id: string;
          p_request_id: string;
          p_sharing_status: string;
          p_tags: string[];
        };
        Returns: Json;
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
      set_class_archived: {
        Args: {
          p_archived: boolean;
          p_class_id: string;
          p_expected_revision: number;
          p_request_id: string;
        };
        Returns: Json;
      };
      set_class_teacher: {
        Args: {
          p_active: boolean;
          p_class_id: string;
          p_display_label: string;
          p_expected_revision: number;
          p_request_id: string;
          p_target_user_id: string;
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
      set_processing_consent: {
        Args: {
          p_ai_status: string;
          p_expected_revision: number;
          p_note_status: string;
          p_policy_version: number;
          p_project_id: string;
          p_sharing_status: string;
          p_target_id: string;
          p_target_kind: string;
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
      settle_ai_usage: {
        Args: {
          p_attempt_id: string;
          p_completion_tokens: number;
          p_cost_usd: number;
          p_generation_id: string;
          p_model: string;
          p_operation_id: string;
          p_output_valid: boolean;
          p_prompt_tokens: number;
          p_provider: string;
        };
        Returns: Json;
      };
      update_class: {
        Args: {
          p_class_id: string;
          p_document: Json;
          p_expected_revision: number;
          p_request_id: string;
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
