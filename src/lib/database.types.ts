export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
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
  public: {
    Tables: {
      activation_events: {
        Row: {
          created_at: string;
          event: string;
          event_date: string;
          id: number;
          metadata: Json;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          event: string;
          event_date?: string;
          id?: never;
          metadata?: Json;
          user_id: string;
        };
        Update: {
          created_at?: string;
          event?: string;
          event_date?: string;
          id?: never;
          metadata?: Json;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "activation_events_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      agreement_parties: {
        Row: {
          adhered_at: string | null;
          adhered_by: string | null;
          agreement_id: string;
          community_id: string;
          poll_id: string | null;
        };
        Insert: {
          adhered_at?: string | null;
          adhered_by?: string | null;
          agreement_id: string;
          community_id: string;
          poll_id?: string | null;
        };
        Update: {
          adhered_at?: string | null;
          adhered_by?: string | null;
          agreement_id?: string;
          community_id?: string;
          poll_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "agreement_parties_adhered_by_fkey";
            columns: ["adhered_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agreement_parties_agreement_id_fkey";
            columns: ["agreement_id"];
            isOneToOne: false;
            referencedRelation: "agreements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agreement_parties_community_id_fkey";
            columns: ["community_id"];
            isOneToOne: false;
            referencedRelation: "communities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agreement_parties_poll_id_fkey";
            columns: ["poll_id"];
            isOneToOne: true;
            referencedRelation: "polls";
            referencedColumns: ["id"];
          },
        ];
      };
      agreements: {
        Row: {
          body: string;
          closes_at: string | null;
          created_at: string;
          duration_days: number;
          id: string;
          opened_at: string | null;
          proposer_community_id: string;
          proposer_id: string | null;
          removed_at: string | null;
          removed_by: string | null;
          status: string;
          status_before_removal: string | null;
          title: string;
          withdrawn_at: string | null;
        };
        Insert: {
          body: string;
          closes_at?: string | null;
          created_at?: string;
          duration_days: number;
          id?: string;
          opened_at?: string | null;
          proposer_community_id: string;
          proposer_id?: string | null;
          removed_at?: string | null;
          removed_by?: string | null;
          status?: string;
          status_before_removal?: string | null;
          title: string;
          withdrawn_at?: string | null;
        };
        Update: {
          body?: string;
          closes_at?: string | null;
          created_at?: string;
          duration_days?: number;
          id?: string;
          opened_at?: string | null;
          proposer_community_id?: string;
          proposer_id?: string | null;
          removed_at?: string | null;
          removed_by?: string | null;
          status?: string;
          status_before_removal?: string | null;
          title?: string;
          withdrawn_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "agreements_proposer_community_id_fkey";
            columns: ["proposer_community_id"];
            isOneToOne: false;
            referencedRelation: "communities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agreements_proposer_id_fkey";
            columns: ["proposer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agreements_removed_by_fkey";
            columns: ["removed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_summaries: {
        Row: {
          content_id: string;
          content_type: string;
          generated_at: string;
          includes_poll_results: boolean;
          key_points: Json;
          locale: string;
          model: string;
          prompt_version: number;
          source_hash: string;
          summary: string;
        };
        Insert: {
          content_id: string;
          content_type: string;
          generated_at?: string;
          includes_poll_results: boolean;
          key_points?: Json;
          locale: string;
          model: string;
          prompt_version?: number;
          source_hash: string;
          summary: string;
        };
        Update: {
          content_id?: string;
          content_type?: string;
          generated_at?: string;
          includes_poll_results?: boolean;
          key_points?: Json;
          locale?: string;
          model?: string;
          prompt_version?: number;
          source_hash?: string;
          summary?: string;
        };
        Relationships: [];
      };
      ai_summary_generation_events: {
        Row: {
          content_id: string;
          content_type: string;
          id: number;
          locale: string;
          prompt_version: number;
          requested_at: string;
          requested_by: string;
          source_hash: string;
        };
        Insert: {
          content_id: string;
          content_type: string;
          id?: never;
          locale: string;
          prompt_version: number;
          requested_at?: string;
          requested_by: string;
          source_hash: string;
        };
        Update: {
          content_id?: string;
          content_type?: string;
          id?: never;
          locale?: string;
          prompt_version?: number;
          requested_at?: string;
          requested_by?: string;
          source_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_summary_generation_events_requested_by_fkey";
            columns: ["requested_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_summary_generation_jobs: {
        Row: {
          attempt_count: number;
          completed_at: string | null;
          content_id: string;
          content_type: string;
          created_at: string;
          includes_poll_results: boolean;
          last_error: string | null;
          lease_expires_at: string | null;
          lease_token: string | null;
          locale: string;
          prompt_version: number;
          requested_by: string | null;
          source_hash: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          attempt_count?: number;
          completed_at?: string | null;
          content_id: string;
          content_type: string;
          created_at?: string;
          includes_poll_results: boolean;
          last_error?: string | null;
          lease_expires_at?: string | null;
          lease_token?: string | null;
          locale: string;
          prompt_version: number;
          requested_by?: string | null;
          source_hash: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          attempt_count?: number;
          completed_at?: string | null;
          content_id?: string;
          content_type?: string;
          created_at?: string;
          includes_poll_results?: boolean;
          last_error?: string | null;
          lease_expires_at?: string | null;
          lease_token?: string | null;
          locale?: string;
          prompt_version?: number;
          requested_by?: string | null;
          source_hash?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_summary_generation_jobs_requested_by_fkey";
            columns: ["requested_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      budget_participation_receipts: {
        Row: {
          budget_id: string;
          participated_at: string;
          user_id: string;
        };
        Insert: {
          budget_id: string;
          participated_at?: string;
          user_id: string;
        };
        Update: {
          budget_id?: string;
          participated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "budget_participation_receipts_budget_id_fkey";
            columns: ["budget_id"];
            isOneToOne: false;
            referencedRelation: "community_budgets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "budget_participation_receipts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      budget_proposals: {
        Row: {
          admitted_at: string | null;
          admitted_by: string | null;
          budget_id: string;
          created_at: string;
          id: string;
          project_id: string;
          rejection_note: string | null;
          requested_amount: number;
        };
        Insert: {
          admitted_at?: string | null;
          admitted_by?: string | null;
          budget_id: string;
          created_at?: string;
          id?: string;
          project_id: string;
          rejection_note?: string | null;
          requested_amount: number;
        };
        Update: {
          admitted_at?: string | null;
          admitted_by?: string | null;
          budget_id?: string;
          created_at?: string;
          id?: string;
          project_id?: string;
          rejection_note?: string | null;
          requested_amount?: number;
        };
        Relationships: [
          {
            foreignKeyName: "budget_proposals_admitted_by_fkey";
            columns: ["admitted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "budget_proposals_budget_id_fkey";
            columns: ["budget_id"];
            isOneToOne: false;
            referencedRelation: "community_budgets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "budget_proposals_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      budget_reports: {
        Row: {
          amount_spent: number;
          author_id: string | null;
          budget_id: string;
          created_at: string;
          evidence_url: string | null;
          id: string;
          project_id: string;
          summary: string;
        };
        Insert: {
          amount_spent: number;
          author_id?: string | null;
          budget_id: string;
          created_at?: string;
          evidence_url?: string | null;
          id?: string;
          project_id: string;
          summary: string;
        };
        Update: {
          amount_spent?: number;
          author_id?: string | null;
          budget_id?: string;
          created_at?: string;
          evidence_url?: string | null;
          id?: string;
          project_id?: string;
          summary?: string;
        };
        Relationships: [
          {
            foreignKeyName: "budget_reports_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "budget_reports_budget_id_fkey";
            columns: ["budget_id"];
            isOneToOne: false;
            referencedRelation: "community_budgets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "budget_reports_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "budget_reports_proposal_fkey";
            columns: ["budget_id", "project_id"];
            isOneToOne: true;
            referencedRelation: "budget_proposals";
            referencedColumns: ["budget_id", "project_id"];
          },
        ];
      };
      claim_events: {
        Row: {
          actor_id: string | null;
          body: string | null;
          claim_id: string;
          created_at: string;
          event_date: string;
          event_type: string;
          evidence_url: string | null;
          id: string;
          organization_id: string | null;
          status: string | null;
          title: string;
        };
        Insert: {
          actor_id?: string | null;
          body?: string | null;
          claim_id: string;
          created_at?: string;
          event_date?: string;
          event_type?: string;
          evidence_url?: string | null;
          id?: string;
          organization_id?: string | null;
          status?: string | null;
          title: string;
        };
        Update: {
          actor_id?: string | null;
          body?: string | null;
          claim_id?: string;
          created_at?: string;
          event_date?: string;
          event_type?: string;
          evidence_url?: string | null;
          id?: string;
          organization_id?: string | null;
          status?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "claim_events_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "claim_events_claim_id_fkey";
            columns: ["claim_id"];
            isOneToOne: false;
            referencedRelation: "claims";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "claim_events_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      claim_response_windows: {
        Row: {
          level: number;
          response_days: number;
        };
        Insert: {
          level: number;
          response_days: number;
        };
        Update: {
          level?: number;
          response_days?: number;
        };
        Relationships: [];
      };
      claim_supports: {
        Row: {
          claim_id: string;
          created_at: string;
          user_id: string;
        };
        Insert: {
          claim_id: string;
          created_at?: string;
          user_id: string;
        };
        Update: {
          claim_id?: string;
          created_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "claim_supports_claim_id_fkey";
            columns: ["claim_id"];
            isOneToOne: false;
            referencedRelation: "claims";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "claim_supports_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      claim_uploads: {
        Row: {
          attached_at: string | null;
          claim_id: string | null;
          cleanup_started_at: string | null;
          created_at: string;
          id: string;
          owner_id: string | null;
          path: string;
          public_path: string | null;
          reservation_token: string | null;
          upload_completed_at: string | null;
        };
        Insert: {
          attached_at?: string | null;
          claim_id?: string | null;
          cleanup_started_at?: string | null;
          created_at?: string;
          id?: string;
          owner_id?: string | null;
          path: string;
          public_path?: string | null;
          reservation_token?: string | null;
          upload_completed_at?: string | null;
        };
        Update: {
          attached_at?: string | null;
          claim_id?: string | null;
          cleanup_started_at?: string | null;
          created_at?: string;
          id?: string;
          owner_id?: string | null;
          path?: string;
          public_path?: string | null;
          reservation_token?: string | null;
          upload_completed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "claim_uploads_claim_id_fkey";
            columns: ["claim_id"];
            isOneToOne: false;
            referencedRelation: "claims";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "claim_uploads_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      claims: {
        Row: {
          author_id: string | null;
          category: string;
          community_id: string;
          created_at: string;
          description: string;
          escalated_at: string | null;
          escalated_to_community_id: string | null;
          first_response_at: string | null;
          id: string;
          image_paths: string[];
          image_url: string | null;
          image_urls: string[];
          lat: number | null;
          lng: number | null;
          location_text: string | null;
          removed_at: string | null;
          removed_by: string | null;
          response_due_at: string | null;
          responsible_organization_id: string | null;
          status: string;
          status_before_removal: string | null;
          support_count: number;
          title: string;
        };
        Insert: {
          author_id?: string | null;
          category: string;
          community_id: string;
          created_at?: string;
          description: string;
          escalated_at?: string | null;
          escalated_to_community_id?: string | null;
          first_response_at?: string | null;
          id?: string;
          image_paths?: string[];
          image_url?: string | null;
          image_urls?: string[];
          lat?: number | null;
          lng?: number | null;
          location_text?: string | null;
          removed_at?: string | null;
          removed_by?: string | null;
          response_due_at?: string | null;
          responsible_organization_id?: string | null;
          status?: string;
          status_before_removal?: string | null;
          support_count?: number;
          title: string;
        };
        Update: {
          author_id?: string | null;
          category?: string;
          community_id?: string;
          created_at?: string;
          description?: string;
          escalated_at?: string | null;
          escalated_to_community_id?: string | null;
          first_response_at?: string | null;
          id?: string;
          image_paths?: string[];
          image_url?: string | null;
          image_urls?: string[];
          lat?: number | null;
          lng?: number | null;
          location_text?: string | null;
          removed_at?: string | null;
          removed_by?: string | null;
          response_due_at?: string | null;
          responsible_organization_id?: string | null;
          status?: string;
          status_before_removal?: string | null;
          support_count?: number;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "claims_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "claims_community_id_fkey";
            columns: ["community_id"];
            isOneToOne: false;
            referencedRelation: "communities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "claims_escalated_to_community_id_fkey";
            columns: ["escalated_to_community_id"];
            isOneToOne: false;
            referencedRelation: "communities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "claims_removed_by_fkey";
            columns: ["removed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "claims_responsible_organization_id_fkey";
            columns: ["responsible_organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      comment_votes: {
        Row: {
          comment_id: string;
          created_at: string;
          user_id: string;
          value: number;
        };
        Insert: {
          comment_id: string;
          created_at?: string;
          user_id: string;
          value: number;
        };
        Update: {
          comment_id?: string;
          created_at?: string;
          user_id?: string;
          value?: number;
        };
        Relationships: [
          {
            foreignKeyName: "comment_votes_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "debate_comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comment_votes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      communities: {
        Row: {
          admin_type: string | null;
          created_at: string;
          description: string | null;
          emoji: string | null;
          external_code: string | null;
          external_source_id: string | null;
          id: string;
          lat: number | null;
          level: number;
          lng: number | null;
          member_count: number;
          name: string;
          parent_id: string | null;
          path: string;
          slug: string;
        };
        Insert: {
          admin_type?: string | null;
          created_at?: string;
          description?: string | null;
          emoji?: string | null;
          external_code?: string | null;
          external_source_id?: string | null;
          id?: string;
          lat?: number | null;
          level: number;
          lng?: number | null;
          member_count?: number;
          name: string;
          parent_id?: string | null;
          path: string;
          slug: string;
        };
        Update: {
          admin_type?: string | null;
          created_at?: string;
          description?: string | null;
          emoji?: string | null;
          external_code?: string | null;
          external_source_id?: string | null;
          id?: string;
          lat?: number | null;
          level?: number;
          lng?: number | null;
          member_count?: number;
          name?: string;
          parent_id?: string | null;
          path?: string;
          slug?: string;
        };
        Relationships: [
          {
            foreignKeyName: "communities_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "communities";
            referencedColumns: ["id"];
          },
        ];
      };
      community_budgets: {
        Row: {
          amount: number;
          community_id: string;
          created_at: string;
          created_by: string | null;
          currency: string;
          description: string | null;
          id: string;
          max_tokens_per_proposal: number;
          proposals_close_at: string;
          report_due_at: string;
          title: string;
          tokens_per_voter: number;
          voting_closes_at: string;
          voting_opens_at: string;
        };
        Insert: {
          amount: number;
          community_id: string;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          description?: string | null;
          id?: string;
          max_tokens_per_proposal?: number;
          proposals_close_at: string;
          report_due_at: string;
          title: string;
          tokens_per_voter?: number;
          voting_closes_at: string;
          voting_opens_at: string;
        };
        Update: {
          amount?: number;
          community_id?: string;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          description?: string | null;
          id?: string;
          max_tokens_per_proposal?: number;
          proposals_close_at?: string;
          report_due_at?: string;
          title?: string;
          tokens_per_voter?: number;
          voting_closes_at?: string;
          voting_opens_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "community_budgets_community_id_fkey";
            columns: ["community_id"];
            isOneToOne: false;
            referencedRelation: "communities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "community_budgets_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      community_info: {
        Row: {
          category: string;
          community_id: string;
          content: string;
          id: string;
          image_url: string | null;
          title: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          category: string;
          community_id: string;
          content: string;
          id?: string;
          image_url?: string | null;
          title: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          category?: string;
          community_id?: string;
          content?: string;
          id?: string;
          image_url?: string | null;
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "community_info_community_id_fkey";
            columns: ["community_id"];
            isOneToOne: false;
            referencedRelation: "communities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "community_info_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      community_requests: {
        Row: {
          country: string;
          created_at: string;
          created_community_id: string | null;
          evidence_url: string | null;
          id: string;
          parent_community_id: string | null;
          reason: string;
          requested_level: string;
          requested_name: string;
          resolution_note: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: string;
          user_id: string;
        };
        Insert: {
          country: string;
          created_at?: string;
          created_community_id?: string | null;
          evidence_url?: string | null;
          id?: string;
          parent_community_id?: string | null;
          reason: string;
          requested_level?: string;
          requested_name: string;
          resolution_note?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          user_id: string;
        };
        Update: {
          country?: string;
          created_at?: string;
          created_community_id?: string | null;
          evidence_url?: string | null;
          id?: string;
          parent_community_id?: string | null;
          reason?: string;
          requested_level?: string;
          requested_name?: string;
          resolution_note?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "community_requests_created_community_id_fkey";
            columns: ["created_community_id"];
            isOneToOne: false;
            referencedRelation: "communities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "community_requests_parent_community_id_fkey";
            columns: ["parent_community_id"];
            isOneToOne: false;
            referencedRelation: "communities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "community_requests_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "community_requests_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      community_visibility: {
        Row: {
          community_id: string;
          is_anonymous: boolean;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          community_id: string;
          is_anonymous?: boolean;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          community_id?: string;
          is_anonymous?: boolean;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "community_visibility_community_id_fkey";
            columns: ["community_id"];
            isOneToOne: false;
            referencedRelation: "communities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "community_visibility_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      content_quotas: {
        Row: {
          content_type: string;
          level: number;
          monthly_limit: number;
        };
        Insert: {
          content_type: string;
          level: number;
          monthly_limit: number;
        };
        Update: {
          content_type?: string;
          level?: number;
          monthly_limit?: number;
        };
        Relationships: [];
      };
      content_relations: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          relation_type: string;
          source_id: string;
          source_type: string;
          target_id: string;
          target_type: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          relation_type?: string;
          source_id: string;
          source_type: string;
          target_id: string;
          target_type: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          relation_type?: string;
          source_id?: string;
          source_type?: string;
          target_id?: string;
          target_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_relations_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      content_sources: {
        Row: {
          added_by: string | null;
          content_id: string;
          content_type: string;
          created_at: string;
          id: string;
          published_at: string | null;
          publisher: string | null;
          title: string;
          url: string;
          verified_at: string | null;
        };
        Insert: {
          added_by?: string | null;
          content_id: string;
          content_type: string;
          created_at?: string;
          id?: string;
          published_at?: string | null;
          publisher?: string | null;
          title: string;
          url: string;
          verified_at?: string | null;
        };
        Update: {
          added_by?: string | null;
          content_id?: string;
          content_type?: string;
          created_at?: string;
          id?: string;
          published_at?: string | null;
          publisher?: string | null;
          title?: string;
          url?: string;
          verified_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "content_sources_added_by_fkey";
            columns: ["added_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      data_retention_policies: {
        Row: {
          dataset: string;
          purge_on_account_deletion: boolean;
          rationale: string;
          retention_days: number;
          updated_at: string;
        };
        Insert: {
          dataset: string;
          purge_on_account_deletion?: boolean;
          rationale: string;
          retention_days: number;
          updated_at?: string;
        };
        Update: {
          dataset?: string;
          purge_on_account_deletion?: boolean;
          rationale?: string;
          retention_days?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      debate_comments: {
        Row: {
          body: string;
          column_community_id: string;
          created_at: string;
          debate_id: string;
          id: string;
          score: number;
          status: string;
          user_id: string;
        };
        Insert: {
          body: string;
          column_community_id: string;
          created_at?: string;
          debate_id: string;
          id?: string;
          score?: number;
          status?: string;
          user_id: string;
        };
        Update: {
          body?: string;
          column_community_id?: string;
          created_at?: string;
          debate_id?: string;
          id?: string;
          score?: number;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "debate_comments_column_community_id_fkey";
            columns: ["column_community_id"];
            isOneToOne: false;
            referencedRelation: "communities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "debate_comments_debate_id_fkey";
            columns: ["debate_id"];
            isOneToOne: false;
            referencedRelation: "debates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "debate_comments_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      debates: {
        Row: {
          author_id: string | null;
          body: string;
          community_id: string;
          created_at: string;
          id: string;
          removed_at: string | null;
          removed_by: string | null;
          status: string;
          status_before_removal: string | null;
          title: string;
        };
        Insert: {
          author_id?: string | null;
          body: string;
          community_id: string;
          created_at?: string;
          id?: string;
          removed_at?: string | null;
          removed_by?: string | null;
          status?: string;
          status_before_removal?: string | null;
          title: string;
        };
        Update: {
          author_id?: string | null;
          body?: string;
          community_id?: string;
          created_at?: string;
          id?: string;
          removed_at?: string | null;
          removed_by?: string | null;
          status?: string;
          status_before_removal?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "debates_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "debates_community_id_fkey";
            columns: ["community_id"];
            isOneToOne: false;
            referencedRelation: "communities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "debates_removed_by_fkey";
            columns: ["removed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      follows: {
        Row: {
          community_id: string;
          created_at: string;
          user_id: string;
        };
        Insert: {
          community_id: string;
          created_at?: string;
          user_id: string;
        };
        Update: {
          community_id?: string;
          created_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "follows_community_id_fkey";
            columns: ["community_id"];
            isOneToOne: false;
            referencedRelation: "communities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "follows_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      google_auth_notice_versions: {
        Row: {
          approval_reference: string | null;
          approved_at: string | null;
          content_hash: string;
          content_hash_algorithm: string;
          content_snapshot: Json;
          created_at: string;
          effective_at: string | null;
          is_current: boolean;
          provider: string;
          superseded_at: string | null;
          version: string;
        };
        Insert: {
          approval_reference?: string | null;
          approved_at?: string | null;
          content_hash: string;
          content_hash_algorithm?: string;
          content_snapshot: Json;
          created_at?: string;
          effective_at?: string | null;
          is_current?: boolean;
          provider?: string;
          superseded_at?: string | null;
          version: string;
        };
        Update: {
          approval_reference?: string | null;
          approved_at?: string | null;
          content_hash?: string;
          content_hash_algorithm?: string;
          content_snapshot?: Json;
          created_at?: string;
          effective_at?: string | null;
          is_current?: boolean;
          provider?: string;
          superseded_at?: string | null;
          version?: string;
        };
        Relationships: [];
      };
      institutional_responses: {
        Row: {
          author_id: string;
          body: string;
          content_id: string;
          content_type: string;
          created_at: string;
          id: string;
          organization_id: string;
          response_type: string;
          source_url: string | null;
        };
        Insert: {
          author_id: string;
          body: string;
          content_id: string;
          content_type: string;
          created_at?: string;
          id?: string;
          organization_id: string;
          response_type?: string;
          source_url?: string | null;
        };
        Update: {
          author_id?: string;
          body?: string;
          content_id?: string;
          content_type?: string;
          created_at?: string;
          id?: string;
          organization_id?: string;
          response_type?: string;
          source_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "institutional_responses_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "institutional_responses_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      international_transfer_notice_versions: {
        Row: {
          content_hash: string;
          content_hash_algorithm: string;
          content_snapshot: Json;
          created_at: string;
          effective_at: string;
          is_current: boolean;
          provider_register_version: string;
          superseded_at: string | null;
          version: string;
        };
        Insert: {
          content_hash: string;
          content_hash_algorithm?: string;
          content_snapshot: Json;
          created_at?: string;
          effective_at: string;
          is_current?: boolean;
          provider_register_version: string;
          superseded_at?: string | null;
          version: string;
        };
        Update: {
          content_hash?: string;
          content_hash_algorithm?: string;
          content_snapshot?: Json;
          created_at?: string;
          effective_at?: string;
          is_current?: boolean;
          provider_register_version?: string;
          superseded_at?: string | null;
          version?: string;
        };
        Relationships: [];
      };
      legal_document_versions: {
        Row: {
          content_hash: string;
          created_at: string;
          document_type: string;
          effective_at: string;
          is_current: boolean;
          minimum_age: number;
          version: string;
        };
        Insert: {
          content_hash: string;
          created_at?: string;
          document_type: string;
          effective_at: string;
          is_current?: boolean;
          minimum_age?: number;
          version: string;
        };
        Update: {
          content_hash?: string;
          created_at?: string;
          document_type?: string;
          effective_at?: string;
          is_current?: boolean;
          minimum_age?: number;
          version?: string;
        };
        Relationships: [];
      };
      moderation_appeals: {
        Row: {
          appellant_id: string;
          body: string;
          created_at: string;
          id: string;
          resolution_note: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: string;
          suspension_id: string;
          updated_at: string;
        };
        Insert: {
          appellant_id: string;
          body: string;
          created_at?: string;
          id?: string;
          resolution_note?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          suspension_id: string;
          updated_at?: string;
        };
        Update: {
          appellant_id?: string;
          body?: string;
          created_at?: string;
          id?: string;
          resolution_note?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          suspension_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "moderation_appeals_appellant_id_fkey";
            columns: ["appellant_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moderation_appeals_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moderation_appeals_suspension_id_fkey";
            columns: ["suspension_id"];
            isOneToOne: false;
            referencedRelation: "user_suspensions";
            referencedColumns: ["id"];
          },
        ];
      };
      moderation_audit_log: {
        Row: {
          action: string;
          created_at: string;
          id: number;
          metadata: Json;
          moderator_id: string | null;
          target_id: string | null;
          target_type: string;
        };
        Insert: {
          action: string;
          created_at?: string;
          id?: never;
          metadata?: Json;
          moderator_id?: string | null;
          target_id?: string | null;
          target_type: string;
        };
        Update: {
          action?: string;
          created_at?: string;
          id?: never;
          metadata?: Json;
          moderator_id?: string | null;
          target_id?: string | null;
          target_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "moderation_audit_log_moderator_id_fkey";
            columns: ["moderator_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_preferences: {
        Row: {
          claim_updates: boolean;
          institutional_responses: boolean;
          poll_results: boolean;
          project_updates: boolean;
          replies: boolean;
          user_id: string;
        };
        Insert: {
          claim_updates?: boolean;
          institutional_responses?: boolean;
          poll_results?: boolean;
          project_updates?: boolean;
          replies?: boolean;
          user_id: string;
        };
        Update: {
          claim_updates?: boolean;
          institutional_responses?: boolean;
          poll_results?: boolean;
          project_updates?: boolean;
          replies?: boolean;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          actor_id: string | null;
          body: string | null;
          community_id: string | null;
          created_at: string;
          dedupe_key: string | null;
          entity_id: string | null;
          entity_type: string | null;
          href: string;
          id: string;
          read_at: string | null;
          recipient_id: string;
          title: string;
          type: string;
        };
        Insert: {
          actor_id?: string | null;
          body?: string | null;
          community_id?: string | null;
          created_at?: string;
          dedupe_key?: string | null;
          entity_id?: string | null;
          entity_type?: string | null;
          href: string;
          id?: string;
          read_at?: string | null;
          recipient_id: string;
          title: string;
          type: string;
        };
        Update: {
          actor_id?: string | null;
          body?: string | null;
          community_id?: string | null;
          created_at?: string;
          dedupe_key?: string | null;
          entity_id?: string | null;
          entity_type?: string | null;
          href?: string;
          id?: string;
          read_at?: string | null;
          recipient_id?: string;
          title?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_community_id_fkey";
            columns: ["community_id"];
            isOneToOne: false;
            referencedRelation: "communities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey";
            columns: ["recipient_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_members: {
        Row: {
          added_by: string | null;
          organization_id: string;
          role: string;
          user_id: string;
          verified_at: string;
        };
        Insert: {
          added_by?: string | null;
          organization_id: string;
          role?: string;
          user_id: string;
          verified_at?: string;
        };
        Update: {
          added_by?: string | null;
          organization_id?: string;
          role?: string;
          user_id?: string;
          verified_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_members_added_by_fkey";
            columns: ["added_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_requests: {
        Row: {
          community_id: string | null;
          created_at: string;
          evidence_url: string | null;
          id: string;
          message: string;
          name: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: string;
          type: string;
          user_id: string;
          website: string | null;
        };
        Insert: {
          community_id?: string | null;
          created_at?: string;
          evidence_url?: string | null;
          id?: string;
          message: string;
          name: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          type: string;
          user_id: string;
          website?: string | null;
        };
        Update: {
          community_id?: string | null;
          created_at?: string;
          evidence_url?: string | null;
          id?: string;
          message?: string;
          name?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          type?: string;
          user_id?: string;
          website?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "organization_requests_community_id_fkey";
            columns: ["community_id"];
            isOneToOne: false;
            referencedRelation: "communities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_requests_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_requests_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          community_id: string | null;
          created_at: string;
          description: string | null;
          id: string;
          logo_url: string | null;
          name: string;
          slug: string;
          type: string;
          verified_at: string | null;
          verified_by: string | null;
          website: string | null;
        };
        Insert: {
          community_id?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          logo_url?: string | null;
          name: string;
          slug: string;
          type?: string;
          verified_at?: string | null;
          verified_by?: string | null;
          website?: string | null;
        };
        Update: {
          community_id?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          logo_url?: string | null;
          name?: string;
          slug?: string;
          type?: string;
          verified_at?: string | null;
          verified_by?: string | null;
          website?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "organizations_community_id_fkey";
            columns: ["community_id"];
            isOneToOne: false;
            referencedRelation: "communities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organizations_verified_by_fkey";
            columns: ["verified_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      poll_options: {
        Row: {
          id: string;
          label: string;
          poll_id: string;
          sort_order: number;
        };
        Insert: {
          id?: string;
          label: string;
          poll_id: string;
          sort_order?: number;
        };
        Update: {
          id?: string;
          label?: string;
          poll_id?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "poll_options_poll_id_fkey";
            columns: ["poll_id"];
            isOneToOne: false;
            referencedRelation: "polls";
            referencedColumns: ["id"];
          },
        ];
      };
      poll_participation_receipts: {
        Row: {
          participated_at: string;
          poll_id: string;
          user_id: string;
        };
        Insert: {
          participated_at?: string;
          poll_id: string;
          user_id: string;
        };
        Update: {
          participated_at?: string;
          poll_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "poll_participation_receipts_poll_id_fkey";
            columns: ["poll_id"];
            isOneToOne: false;
            referencedRelation: "polls";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "poll_participation_receipts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      polls: {
        Row: {
          agreement_id: string | null;
          author_id: string | null;
          category: string;
          closes_at: string | null;
          community_id: string;
          created_at: string;
          description: string | null;
          id: string;
          max_choices: number | null;
          question: string;
          removed_at: string | null;
          removed_by: string | null;
          results_visibility: string;
          status: string;
          status_before_removal: string | null;
          type: string;
        };
        Insert: {
          agreement_id?: string | null;
          author_id?: string | null;
          category?: string;
          closes_at?: string | null;
          community_id: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          max_choices?: number | null;
          question: string;
          removed_at?: string | null;
          removed_by?: string | null;
          results_visibility?: string;
          status?: string;
          status_before_removal?: string | null;
          type: string;
        };
        Update: {
          agreement_id?: string | null;
          author_id?: string | null;
          category?: string;
          closes_at?: string | null;
          community_id?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          max_choices?: number | null;
          question?: string;
          removed_at?: string | null;
          removed_by?: string | null;
          results_visibility?: string;
          status?: string;
          status_before_removal?: string | null;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "polls_agreement_id_fkey";
            columns: ["agreement_id"];
            isOneToOne: false;
            referencedRelation: "agreements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "polls_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "polls_community_id_fkey";
            columns: ["community_id"];
            isOneToOne: false;
            referencedRelation: "communities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "polls_removed_by_fkey";
            columns: ["removed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          created_at: string;
          display_name: string | null;
          home_community_id: string | null;
          id: string;
          residence_changed_at: string | null;
          role: string;
          username: string;
          verification_level: number;
        };
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          display_name?: string | null;
          home_community_id?: string | null;
          id: string;
          residence_changed_at?: string | null;
          role?: string;
          username: string;
          verification_level?: number;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          display_name?: string | null;
          home_community_id?: string | null;
          id?: string;
          residence_changed_at?: string | null;
          role?: string;
          username?: string;
          verification_level?: number;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_home_community_id_fkey";
            columns: ["home_community_id"];
            isOneToOne: false;
            referencedRelation: "communities";
            referencedColumns: ["id"];
          },
        ];
      };
      project_comments: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          parent_id: string | null;
          project_id: string;
          status: string;
          user_id: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          id?: string;
          parent_id?: string | null;
          project_id: string;
          status?: string;
          user_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          parent_id?: string | null;
          project_id?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_comments_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "project_comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_comments_parent_same_project_fk";
            columns: ["project_id", "parent_id"];
            isOneToOne: false;
            referencedRelation: "project_comments";
            referencedColumns: ["project_id", "id"];
          },
          {
            foreignKeyName: "project_comments_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_comments_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      project_contributions: {
        Row: {
          created_at: string;
          description: string;
          id: string;
          kind: string;
          project_id: string;
          quantity: number | null;
          status: string;
          unit: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          description: string;
          id?: string;
          kind: string;
          project_id: string;
          quantity?: number | null;
          status?: string;
          unit?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          id?: string;
          kind?: string;
          project_id?: string;
          quantity?: number | null;
          status?: string;
          unit?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_contributions_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_contributions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      project_milestones: {
        Row: {
          completed_at: string | null;
          created_at: string;
          description: string | null;
          id: string;
          project_id: string;
          sort_order: number;
          status: string;
          target_date: string | null;
          title: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          project_id: string;
          sort_order?: number;
          status?: string;
          target_date?: string | null;
          title: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          project_id?: string;
          sort_order?: number;
          status?: string;
          target_date?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_milestones_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_pledges: {
        Row: {
          amount: number;
          created_at: string;
          id: string;
          message: string | null;
          project_id: string;
          user_id: string;
        };
        Insert: {
          amount: number;
          created_at?: string;
          id?: string;
          message?: string | null;
          project_id: string;
          user_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          id?: string;
          message?: string | null;
          project_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_pledges_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_pledges_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      project_tasks: {
        Row: {
          assigned_organization_id: string | null;
          assigned_user_id: string | null;
          created_at: string;
          description: string | null;
          due_date: string | null;
          id: string;
          milestone_id: string | null;
          project_id: string;
          skills_needed: string | null;
          status: string;
          title: string;
        };
        Insert: {
          assigned_organization_id?: string | null;
          assigned_user_id?: string | null;
          created_at?: string;
          description?: string | null;
          due_date?: string | null;
          id?: string;
          milestone_id?: string | null;
          project_id: string;
          skills_needed?: string | null;
          status?: string;
          title: string;
        };
        Update: {
          assigned_organization_id?: string | null;
          assigned_user_id?: string | null;
          created_at?: string;
          description?: string | null;
          due_date?: string | null;
          id?: string;
          milestone_id?: string | null;
          project_id?: string;
          skills_needed?: string | null;
          status?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_tasks_assigned_organization_id_fkey";
            columns: ["assigned_organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_tasks_assigned_user_id_fkey";
            columns: ["assigned_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_tasks_milestone_id_fkey";
            columns: ["milestone_id"];
            isOneToOne: false;
            referencedRelation: "project_milestones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_tasks_milestone_same_project_fk";
            columns: ["project_id", "milestone_id"];
            isOneToOne: false;
            referencedRelation: "project_milestones";
            referencedColumns: ["project_id", "id"];
          },
          {
            foreignKeyName: "project_tasks_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      projects: {
        Row: {
          author_id: string | null;
          budget_amount: number | null;
          community_id: string;
          created_at: string;
          currency: string;
          id: string;
          plan: string;
          pledged_total: number;
          removed_at: string | null;
          removed_by: string | null;
          resources_needed: string | null;
          status: string;
          status_before_removal: string | null;
          summary: string;
          time_estimate: string | null;
          title: string;
        };
        Insert: {
          author_id?: string | null;
          budget_amount?: number | null;
          community_id: string;
          created_at?: string;
          currency?: string;
          id?: string;
          plan: string;
          pledged_total?: number;
          removed_at?: string | null;
          removed_by?: string | null;
          resources_needed?: string | null;
          status?: string;
          status_before_removal?: string | null;
          summary: string;
          time_estimate?: string | null;
          title: string;
        };
        Update: {
          author_id?: string | null;
          budget_amount?: number | null;
          community_id?: string;
          created_at?: string;
          currency?: string;
          id?: string;
          plan?: string;
          pledged_total?: number;
          removed_at?: string | null;
          removed_by?: string | null;
          resources_needed?: string | null;
          status?: string;
          status_before_removal?: string | null;
          summary?: string;
          time_estimate?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "projects_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "projects_community_id_fkey";
            columns: ["community_id"];
            isOneToOne: false;
            referencedRelation: "communities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "projects_removed_by_fkey";
            columns: ["removed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      reports: {
        Row: {
          created_at: string;
          id: string;
          reason: string;
          reporter_id: string;
          resolved_at: string | null;
          resolved_by: string | null;
          status: string;
          target_id: string;
          target_type: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          reason: string;
          reporter_id: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: string;
          target_id: string;
          target_type: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          reason?: string;
          reporter_id?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: string;
          target_id?: string;
          target_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reports_reporter_id_fkey";
            columns: ["reporter_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_resolved_by_fkey";
            columns: ["resolved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_google_auth_consent_events: {
        Row: {
          decision: string;
          event_id: number;
          locale: string | null;
          notice_hash: string | null;
          notice_version: string | null;
          recorded_at: string;
          user_id: string;
        };
        Insert: {
          decision: string;
          event_id?: never;
          locale?: string | null;
          notice_hash?: string | null;
          notice_version?: string | null;
          recorded_at?: string;
          user_id: string;
        };
        Update: {
          decision?: string;
          event_id?: never;
          locale?: string | null;
          notice_hash?: string | null;
          notice_version?: string | null;
          recorded_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "google_auth_consent_notice_fk";
            columns: ["notice_version", "notice_hash"];
            isOneToOne: false;
            referencedRelation: "google_auth_notice_versions";
            referencedColumns: ["version", "content_hash"];
          },
          {
            foreignKeyName: "user_google_auth_consent_events_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_international_transfer_consents: {
        Row: {
          accepted_at: string;
          locale: string;
          notice_hash: string;
          notice_version: string;
          source: string;
          user_id: string;
        };
        Insert: {
          accepted_at?: string;
          locale: string;
          notice_hash: string;
          notice_version: string;
          source: string;
          user_id: string;
        };
        Update: {
          accepted_at?: string;
          locale?: string;
          notice_hash?: string;
          notice_version?: string;
          source?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_international_transfer_consents_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_transfer_consent_notice_fk";
            columns: ["notice_version", "notice_hash"];
            isOneToOne: false;
            referencedRelation: "international_transfer_notice_versions";
            referencedColumns: ["version", "content_hash"];
          },
        ];
      };
      user_legal_acceptances: {
        Row: {
          accepted_at: string;
          document_type: string;
          minimum_age_attested: boolean;
          user_id: string;
          version: string;
        };
        Insert: {
          accepted_at?: string;
          document_type: string;
          minimum_age_attested: boolean;
          user_id: string;
          version: string;
        };
        Update: {
          accepted_at?: string;
          document_type?: string;
          minimum_age_attested?: boolean;
          user_id?: string;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_legal_acceptance_document_fk";
            columns: ["document_type", "version"];
            isOneToOne: false;
            referencedRelation: "legal_document_versions";
            referencedColumns: ["document_type", "version"];
          },
          {
            foreignKeyName: "user_legal_acceptances_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_suspensions: {
        Row: {
          created_at: string;
          created_by: string | null;
          ends_at: string | null;
          id: string;
          lift_reason: string | null;
          lifted_at: string | null;
          lifted_by: string | null;
          reason: string;
          starts_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          ends_at?: string | null;
          id?: string;
          lift_reason?: string | null;
          lifted_at?: string | null;
          lifted_by?: string | null;
          reason: string;
          starts_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          ends_at?: string | null;
          id?: string;
          lift_reason?: string | null;
          lifted_at?: string | null;
          lifted_by?: string | null;
          reason?: string;
          starts_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_suspensions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_suspensions_lifted_by_fkey";
            columns: ["lifted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_suspensions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_current_legal: {
        Args: { p_minimum_age_attested: boolean };
        Returns: string;
      };
      account_deletion_job_stats: {
        Args: never;
        Returns: {
          dead_letter_count: number;
          leased_count: number;
          oldest_pending_at: string;
          pending_count: number;
          stale_active_account_count: number;
          stale_lease_count: number;
        }[];
      };
      add_claim_event_with_status: {
        Args: {
          p_body: string;
          p_claim: string;
          p_event_date: string;
          p_event_type: string;
          p_evidence_url: string;
          p_organization: string;
          p_status: string;
          p_title: string;
        };
        Returns: string;
      };
      adhere_agreement: { Args: { p_agreement: string }; Returns: string };
      adjust_member_counts: {
        Args: { p_community: string; p_delta: number };
        Returns: undefined;
      };
      agreement_state: { Args: { p_agreement: string }; Returns: Json };
      approve_community_request: {
        Args: {
          p_description?: string;
          p_emoji?: string;
          p_lat?: number;
          p_lng?: number;
          p_parent?: string;
          p_request: string;
          p_resolution_note?: string;
          p_slug?: string;
        };
        Returns: {
          id: string;
          level: number;
          name: string;
          path: string;
          slug: string;
        }[];
      };
      approve_mfa_enrollment: {
        Args: { p_factor: string; p_user: string };
        Returns: boolean;
      };
      approve_organization_request: {
        Args: { p_request: string; p_slug: string };
        Returns: string;
      };
      authorize_mfa_enrollment: {
        Args: { p_factor: string; p_user: string };
        Returns: boolean;
      };
      begin_ai_summary_generation: {
        Args: {
          p_content_id: string;
          p_content_type: string;
          p_includes_poll_results: boolean;
          p_locale: string;
          p_prompt_version: number;
          p_requester_id: string;
          p_source_hash: string;
        };
        Returns: {
          decision: string;
          lease_token: string;
          retry_after_seconds: number;
        }[];
      };
      begin_claim_upload_cleanup: {
        Args: { p_cutoff: string; p_limit?: number };
        Returns: {
          id: string;
          path: string;
        }[];
      };
      budget_phase: { Args: { p_budget: string }; Returns: string };
      budget_results: {
        Args: { p_budget: string };
        Returns: {
          awarded: boolean;
          awarded_amount: number;
          project_id: string;
          project_title: string;
          proposal_id: string;
          requested_amount: number;
          tokens: number;
          voters: number;
        }[];
      };
      can_correct_residence: { Args: { p_user: string }; Returns: boolean };
      can_create_poll: {
        Args: { p_community: string; p_user: string };
        Returns: boolean;
      };
      can_manage_content: {
        Args: { p_id: string; p_type: string; p_user: string };
        Returns: boolean;
      };
      can_participate: { Args: never; Returns: boolean };
      can_see_poll_results:
        | { Args: { p_poll: string }; Returns: boolean }
        | { Args: { p_poll: string; p_user: string }; Returns: boolean };
      can_update_claim_as_org: {
        Args: { p_claim: string; p_user: string };
        Returns: boolean;
      };
      can_upload_claim_object: { Args: never; Returns: boolean };
      can_view_content: {
        Args: { p_id: string; p_type: string };
        Returns: boolean;
      };
      can_vote_budget: {
        Args: { p_budget: string; p_user: string };
        Returns: boolean;
      };
      cancel_account_deletion: { Args: { p_user: string }; Returns: boolean };
      cast_budget_ballot: {
        Args: { p_allocations: Json; p_budget: string };
        Returns: undefined;
      };
      cast_poll_ballot: {
        Args: { p_option_ids: string[]; p_poll: string };
        Returns: undefined;
      };
      claim_account_deletion_jobs: {
        Args: { p_limit?: number; p_user?: string };
        Returns: {
          avatar_paths: string[];
          pending_claim_paths: string[];
          user_id: string;
        }[];
      };
      claim_escalation_threshold: {
        Args: { p_community: string };
        Returns: number;
      };
      community_agreements: {
        Args: { p_community: string; p_limit?: number };
        Returns: {
          adhered_count: number;
          closes_at: string;
          created_at: string;
          id: string;
          party_count: number;
          status_derived: string;
          title: string;
        }[];
      };
      community_ancestors: {
        Args: { p_community: string };
        Returns: {
          admin_type: string | null;
          created_at: string;
          description: string | null;
          emoji: string | null;
          external_code: string | null;
          external_source_id: string | null;
          id: string;
          lat: number | null;
          level: number;
          lng: number | null;
          member_count: number;
          name: string;
          parent_id: string | null;
          path: string;
          slug: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "communities";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      community_descendant_count: {
        Args: { p_community: string };
        Returns: number;
      };
      community_member_visibility_counts: {
        Args: { p_community: string };
        Returns: {
          anonymous_count: number;
          public_count: number;
        }[];
      };
      community_public_members:
        | {
            Args: {
              p_after_username?: string;
              p_community: string;
              p_limit?: number;
            };
            Returns: {
              avatar_url: string;
              display_name: string;
              user_id: string;
              username: string;
            }[];
          }
        | {
            Args: {
              p_after_username: string;
              p_community: string;
              p_limit: number;
              p_query: string;
              p_with_photo: boolean;
            };
            Returns: {
              avatar_url: string;
              display_name: string;
              user_id: string;
              username: string;
            }[];
          };
      community_slugify: { Args: { p_value: string }; Returns: string };
      complete_ai_summary_generation: {
        Args: {
          p_content_id: string;
          p_content_type: string;
          p_includes_poll_results: boolean;
          p_key_points: Json;
          p_lease_token: string;
          p_locale: string;
          p_model: string;
          p_prompt_version: number;
          p_source_hash: string;
          p_summary: string;
        };
        Returns: boolean;
      };
      content_author: {
        Args: { p_id: string; p_type: string };
        Returns: string;
      };
      content_exists: {
        Args: { p_id: string; p_type: string };
        Returns: boolean;
      };
      create_data_deletion_request: {
        Args: {
          p_access_hash: string;
          p_contact_email: string;
          p_inbox_reference: string;
          p_scope: string;
        };
        Returns: Json;
      };
      create_notification: {
        Args: {
          p_actor: string;
          p_body: string;
          p_dedupe_key: string;
          p_entity_id: string;
          p_entity_type: string;
          p_href: string;
          p_recipient: string;
          p_title: string;
          p_type: string;
        };
        Returns: undefined;
      };
      create_poll_with_options: {
        Args: {
          p_category: string;
          p_closes_at: string;
          p_community: string;
          p_description: string;
          p_max_choices: number;
          p_options: string[];
          p_question: string;
          p_results_visibility: string;
          p_type: string;
        };
        Returns: string;
      };
      create_project_with_relation: {
        Args: {
          p_budget_amount: number;
          p_community: string;
          p_currency: string;
          p_plan: string;
          p_resources_needed: string;
          p_source_claim: string;
          p_summary: string;
          p_time_estimate: string;
          p_title: string;
        };
        Returns: string;
      };
      current_google_auth_notice: { Args: never; Returns: Json };
      current_session_uses_approved_factor: { Args: never; Returns: boolean };
      debate_column_comments: {
        Args: { p_debate: string; p_per_column?: number };
        Returns: {
          body: string;
          column_community_id: string;
          created_at: string;
          id: string;
          score: number;
          user_id: string;
        }[];
      };
      debate_column_counts: {
        Args: { p_debate: string };
        Returns: {
          column_community_id: string;
          comment_count: number;
        }[];
      };
      escalate_silent_claims: { Args: never; Returns: number };
      export_my_linked_activity: { Args: never; Returns: Json };
      fail_ai_summary_generation: {
        Args: { p_error_code?: string; p_lease_token: string };
        Returns: boolean;
      };
      finalize_avatar_upload: {
        Args: { p_owner: string; p_path: string };
        Returns: boolean;
      };
      finalize_claim_upload: {
        Args: { p_owner: string; p_path: string };
        Returns: boolean;
      };
      finish_account_deletion_job: {
        Args: { p_error?: string; p_user: string };
        Returns: boolean;
      };
      finish_avatar_upload_cleanup: {
        Args: { p_paths: string[] };
        Returns: number;
      };
      finish_claim_upload_cleanup: {
        Args: { p_ids: string[] };
        Returns: number;
      };
      global_search:
        | {
            Args: {
              p_community?: string;
              p_kind?: string;
              p_limit?: number;
              p_offset?: number;
              p_query: string;
              p_status?: string;
            };
            Returns: {
              community_emoji: string;
              community_id: string;
              community_name: string;
              community_slug: string;
              created_at: string;
              href: string;
              id: string;
              kind: string;
              rank: number;
              status: string;
              summary: string;
              title: string;
              total_count: number;
            }[];
          }
        | {
            Args: {
              p_community: string;
              p_kind: string;
              p_limit: number;
              p_offset: number;
              p_query: string;
              p_sort: string;
              p_status: string;
            };
            Returns: {
              community_emoji: string;
              community_id: string;
              community_name: string;
              community_slug: string;
              created_at: string;
              href: string;
              id: string;
              kind: string;
              rank: number;
              status: string;
              summary: string;
              title: string;
              total_count: number;
            }[];
          };
      grant_current_international_transfer_consent: {
        Args: {
          p_expressly_accepted: boolean;
          p_locale: string;
          p_version: string;
        };
        Returns: string;
      };
      grant_google_auth_consent: {
        Args: {
          p_content_hash: string;
          p_expressly_accepted: boolean;
          p_locale: string;
          p_started_at: string;
          p_version: string;
        };
        Returns: Json;
      };
      has_civic_activity_since: {
        Args: { p_since: string; p_user: string };
        Returns: boolean;
      };
      is_admin: { Args: { p_user: string }; Returns: boolean };
      is_member: {
        Args: { p_community: string; p_user: string };
        Returns: boolean;
      };
      is_moderator: { Args: { p_user: string }; Returns: boolean };
      is_user_suspended: { Args: never; Returns: boolean };
      is_verified_org_member: {
        Args: { p_org: string; p_user: string };
        Returns: boolean;
      };
      lift_user_suspension: {
        Args: { p_reason: string; p_suspension: string };
        Returns: boolean;
      };
      list_data_deletion_requests: {
        Args: { p_filter?: string; p_page?: number };
        Returns: Json;
      };
      list_orphan_avatar_objects: {
        Args: { p_cutoff: string; p_limit?: number };
        Returns: {
          path: string;
        }[];
      };
      list_orphan_claim_objects: {
        Args: { p_cutoff: string; p_limit?: number };
        Returns: {
          path: string;
        }[];
      };
      mark_account_auth_deleted: { Args: { p_user: string }; Returns: boolean };
      mark_notifications_read: {
        Args: {
          p_community_id?: string;
          p_notification_id?: string;
          p_type?: string;
          p_unread_only?: boolean;
        };
        Returns: number;
      };
      moderate_agreement: {
        Args: { p_action: string; p_agreement: string };
        Returns: undefined;
      };
      my_community_visibility: {
        Args: { p_community: string; p_user: string };
        Returns: boolean;
      };
      my_google_auth_consent: { Args: never; Returns: Json };
      my_legal_status: { Args: never; Returns: Json };
      notification_communities: {
        Args: never;
        Returns: {
          community_id: string;
          name: string;
        }[];
      };
      notification_inbox: {
        Args: {
          p_before_created?: string;
          p_before_id?: string;
          p_community_id?: string;
          p_limit?: number;
          p_type?: string;
          p_unread_only?: boolean;
        };
        Returns: Json;
      };
      personalized_feed:
        | {
            Args: {
              p_before_created?: string;
              p_before_id?: string;
              p_limit?: number;
              p_user: string;
            };
            Returns: {
              community_emoji: string;
              community_id: string;
              community_name: string;
              community_slug: string;
              created_at: string;
              engagement: number;
              id: string;
              kind: string;
              status: string;
              summary: string;
              title: string;
            }[];
          }
        | {
            Args: {
              p_before_created: string;
              p_before_id: string;
              p_community_slug: string;
              p_kind: string;
              p_limit: number;
              p_user: string;
            };
            Returns: {
              community_emoji: string;
              community_id: string;
              community_name: string;
              community_slug: string;
              created_at: string;
              engagement: number;
              id: string;
              kind: string;
              status: string;
              summary: string;
              title: string;
            }[];
          };
      poll_feed: {
        Args: {
          p_before_created?: string;
          p_before_id?: string;
          p_category?: string;
          p_community: string;
          p_limit?: number;
        };
        Returns: {
          can_see: boolean;
          category: string;
          closes_at: string;
          created_at: string;
          description: string;
          has_voted: boolean;
          id: string;
          option_count: number;
          question: string;
          status: string;
          total_votes: number;
          type: string;
        }[];
      };
      poll_results: {
        Args: { p_poll: string };
        Returns: {
          label: string;
          option_id: string;
          percentage: number;
          sort_order: number;
          votes: number;
        }[];
      };
      poll_stats: {
        Args: { p_poll: string };
        Returns: {
          can_see: boolean;
          has_voted: boolean;
          total_voters: number;
          total_votes: number;
        }[];
      };
      prepare_account_deletion: { Args: { p_user: string }; Returns: boolean };
      project_pledge_counts: {
        Args: { p_projects: string[] };
        Returns: {
          pledge_count: number;
          project_id: string;
        }[];
      };
      project_public_pledges: {
        Args: { p_limit?: number; p_project: string };
        Returns: {
          amount: number;
          author_avatar_url: string;
          author_display_name: string;
          author_username: string;
          created_at: string;
          id: string;
          message: string;
        }[];
      };
      propose_agreement: {
        Args: {
          p_body: string;
          p_communities: string[];
          p_duration_days: number;
          p_title: string;
        };
        Returns: string;
      };
      public_profile: {
        Args: { p_user: string };
        Returns: {
          avatar_url: string;
          display_name: string;
          id: string;
          username: string;
        }[];
      };
      public_profile_by_username: {
        Args: { p_username: string };
        Returns: {
          avatar_url: string;
          display_name: string;
          id: string;
          username: string;
        }[];
      };
      public_profiles: {
        Args: { p_users: string[] };
        Returns: {
          avatar_url: string;
          display_name: string;
          id: string;
          username: string;
        }[];
      };
      purge_abandoned_oauth_accounts: { Args: never; Returns: number };
      purge_expired_operational_data: { Args: never; Returns: Json };
      purge_expired_transfer_consents: { Args: never; Returns: number };
      quota_remaining: {
        Args: { p_content_type: string; p_level: number; p_user: string };
        Returns: number;
      };
      quota_summary: {
        Args: { p_user: string };
        Returns: {
          community_emoji: string;
          community_id: string;
          community_name: string;
          community_slug: string;
          content_type: string;
          level: number;
          monthly_limit: number;
          remaining: number;
        }[];
      };
      read_data_deletion_receipt: {
        Args: {
          p_access_hash: string;
          p_reference: string;
          p_source_hash: string;
        };
        Returns: Json;
      };
      record_activation_visit: { Args: never; Returns: undefined };
      reissue_data_deletion_receipt: {
        Args: {
          p_access_hash: string;
          p_reference: string;
          p_revision: number;
        };
        Returns: Json;
      };
      release_avatar_upload: {
        Args: { p_owner: string; p_path: string };
        Returns: boolean;
      };
      release_claim_upload: {
        Args: { p_owner: string; p_path: string };
        Returns: boolean;
      };
      remove_own_content: {
        Args: { p_id: string; p_type: string };
        Returns: boolean;
      };
      reserve_avatar_upload: {
        Args: { p_owner: string; p_path: string };
        Returns: string;
      };
      reserve_claim_upload: {
        Args: { p_owner: string; p_path: string };
        Returns: string;
      };
      response_debt: {
        Args: { p_community: string };
        Returns: {
          longest_wait_days: number;
          organization_id: string;
          organization_name: string;
          pending_claims: number;
        }[];
      };
      retry_account_deletion_job: {
        Args: { p_user: string };
        Returns: boolean;
      };
      review_moderation_appeal: {
        Args: { p_appeal: string; p_resolution_note: string; p_status: string };
        Returns: boolean;
      };
      search_normalize: { Args: { p_value: string }; Returns: string };
      set_comment_vote: {
        Args: { p_comment: string; p_value: number };
        Returns: undefined;
      };
      set_community_visibility: {
        Args: { p_community: string; p_is_anonymous: boolean };
        Returns: undefined;
      };
      set_project_pledge: {
        Args: { p_amount: number; p_message: string; p_project: string };
        Returns: undefined;
      };
      sibling_claim_profile: {
        Args: { p_community: string };
        Returns: {
          answered_rate: number;
          answered_total: number;
          child_emoji: string;
          child_id: string;
          child_name: string;
          child_slug: string;
          claims_per_1k: number;
          claims_total: number;
          member_count: number;
          top_category: string;
          top_category_claims: number;
        }[];
      };
      submit_suspension_appeal: {
        Args: { p_body: string; p_suspension: string };
        Returns: string;
      };
      suspend_user: {
        Args: { p_ends_at?: string; p_reason: string; p_user: string };
        Returns: string;
      };
      sync_due_poll_notifications: { Args: never; Returns: number };
      update_data_deletion_request: {
        Args: {
          p_reference: string;
          p_resolution_code?: string;
          p_response_sent?: boolean;
          p_revision: number;
          p_status: string;
          p_verification_method?: string;
          p_verification_note?: string;
        };
        Returns: boolean;
      };
      withdraw_agreement: { Args: { p_agreement: string }; Returns: undefined };
      withdraw_google_auth_consent: { Args: never; Returns: Json };
      withdraw_moderation_appeal: {
        Args: { p_appeal: string };
        Returns: boolean;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null;
          avif_autodetection: boolean | null;
          created_at: string | null;
          file_size_limit: number | null;
          id: string;
          name: string;
          owner: string | null;
          owner_id: string | null;
          public: boolean | null;
          type: Database["storage"]["Enums"]["buckettype"];
          updated_at: string | null;
          versioning_status: string;
        };
        Insert: {
          allowed_mime_types?: string[] | null;
          avif_autodetection?: boolean | null;
          created_at?: string | null;
          file_size_limit?: number | null;
          id: string;
          name: string;
          owner?: string | null;
          owner_id?: string | null;
          public?: boolean | null;
          type?: Database["storage"]["Enums"]["buckettype"];
          updated_at?: string | null;
          versioning_status?: string;
        };
        Update: {
          allowed_mime_types?: string[] | null;
          avif_autodetection?: boolean | null;
          created_at?: string | null;
          file_size_limit?: number | null;
          id?: string;
          name?: string;
          owner?: string | null;
          owner_id?: string | null;
          public?: boolean | null;
          type?: Database["storage"]["Enums"]["buckettype"];
          updated_at?: string | null;
          versioning_status?: string;
        };
        Relationships: [];
      };
      buckets_analytics: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          format: string;
          id: string;
          name: string;
          type: Database["storage"]["Enums"]["buckettype"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          format?: string;
          id?: string;
          name: string;
          type?: Database["storage"]["Enums"]["buckettype"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          format?: string;
          id?: string;
          name?: string;
          type?: Database["storage"]["Enums"]["buckettype"];
          updated_at?: string;
        };
        Relationships: [];
      };
      buckets_vectors: {
        Row: {
          created_at: string;
          id: string;
          type: Database["storage"]["Enums"]["buckettype"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id: string;
          type?: Database["storage"]["Enums"]["buckettype"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          type?: Database["storage"]["Enums"]["buckettype"];
          updated_at?: string;
        };
        Relationships: [];
      };
      iceberg_namespaces: {
        Row: {
          bucket_name: string;
          catalog_id: string;
          created_at: string;
          id: string;
          metadata: Json;
          name: string;
          updated_at: string;
        };
        Insert: {
          bucket_name: string;
          catalog_id: string;
          created_at?: string;
          id?: string;
          metadata?: Json;
          name: string;
          updated_at?: string;
        };
        Update: {
          bucket_name?: string;
          catalog_id?: string;
          created_at?: string;
          id?: string;
          metadata?: Json;
          name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "iceberg_namespaces_catalog_id_fkey";
            columns: ["catalog_id"];
            isOneToOne: false;
            referencedRelation: "buckets_analytics";
            referencedColumns: ["id"];
          },
        ];
      };
      iceberg_tables: {
        Row: {
          bucket_name: string;
          catalog_id: string;
          created_at: string;
          id: string;
          location: string;
          name: string;
          namespace_id: string;
          remote_table_id: string | null;
          shard_id: string | null;
          shard_key: string | null;
          updated_at: string;
        };
        Insert: {
          bucket_name: string;
          catalog_id: string;
          created_at?: string;
          id?: string;
          location: string;
          name: string;
          namespace_id: string;
          remote_table_id?: string | null;
          shard_id?: string | null;
          shard_key?: string | null;
          updated_at?: string;
        };
        Update: {
          bucket_name?: string;
          catalog_id?: string;
          created_at?: string;
          id?: string;
          location?: string;
          name?: string;
          namespace_id?: string;
          remote_table_id?: string | null;
          shard_id?: string | null;
          shard_key?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "iceberg_tables_catalog_id_fkey";
            columns: ["catalog_id"];
            isOneToOne: false;
            referencedRelation: "buckets_analytics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "iceberg_tables_namespace_id_fkey";
            columns: ["namespace_id"];
            isOneToOne: false;
            referencedRelation: "iceberg_namespaces";
            referencedColumns: ["id"];
          },
        ];
      };
      migrations: {
        Row: {
          executed_at: string | null;
          hash: string;
          id: number;
          name: string;
        };
        Insert: {
          executed_at?: string | null;
          hash: string;
          id: number;
          name: string;
        };
        Update: {
          executed_at?: string | null;
          hash?: string;
          id?: number;
          name?: string;
        };
        Relationships: [];
      };
      objects: {
        Row: {
          archived_at: string | null;
          bucket_id: string | null;
          created_at: string | null;
          id: string;
          is_delete_marker: boolean;
          is_versioned: boolean;
          last_accessed_at: string | null;
          metadata: Json | null;
          name: string | null;
          owner: string | null;
          owner_id: string | null;
          path_tokens: string[] | null;
          updated_at: string | null;
          user_metadata: Json | null;
          version: string | null;
        };
        Insert: {
          archived_at?: string | null;
          bucket_id?: string | null;
          created_at?: string | null;
          id?: string;
          is_delete_marker?: boolean;
          is_versioned?: boolean;
          last_accessed_at?: string | null;
          metadata?: Json | null;
          name?: string | null;
          owner?: string | null;
          owner_id?: string | null;
          path_tokens?: string[] | null;
          updated_at?: string | null;
          user_metadata?: Json | null;
          version?: string | null;
        };
        Update: {
          archived_at?: string | null;
          bucket_id?: string | null;
          created_at?: string | null;
          id?: string;
          is_delete_marker?: boolean;
          is_versioned?: boolean;
          last_accessed_at?: string | null;
          metadata?: Json | null;
          name?: string | null;
          owner?: string | null;
          owner_id?: string | null;
          path_tokens?: string[] | null;
          updated_at?: string | null;
          user_metadata?: Json | null;
          version?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey";
            columns: ["bucket_id"];
            isOneToOne: false;
            referencedRelation: "buckets";
            referencedColumns: ["id"];
          },
        ];
      };
      s3_multipart_uploads: {
        Row: {
          bucket_id: string;
          created_at: string;
          id: string;
          in_progress_size: number;
          key: string;
          metadata: Json | null;
          owner_id: string | null;
          upload_signature: string;
          user_metadata: Json | null;
          version: string;
        };
        Insert: {
          bucket_id: string;
          created_at?: string;
          id: string;
          in_progress_size?: number;
          key: string;
          metadata?: Json | null;
          owner_id?: string | null;
          upload_signature: string;
          user_metadata?: Json | null;
          version: string;
        };
        Update: {
          bucket_id?: string;
          created_at?: string;
          id?: string;
          in_progress_size?: number;
          key?: string;
          metadata?: Json | null;
          owner_id?: string | null;
          upload_signature?: string;
          user_metadata?: Json | null;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey";
            columns: ["bucket_id"];
            isOneToOne: false;
            referencedRelation: "buckets";
            referencedColumns: ["id"];
          },
        ];
      };
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string;
          created_at: string;
          etag: string;
          id: string;
          key: string;
          owner_id: string | null;
          part_number: number;
          size: number;
          upload_id: string;
          version: string;
        };
        Insert: {
          bucket_id: string;
          created_at?: string;
          etag: string;
          id?: string;
          key: string;
          owner_id?: string | null;
          part_number: number;
          size?: number;
          upload_id: string;
          version: string;
        };
        Update: {
          bucket_id?: string;
          created_at?: string;
          etag?: string;
          id?: string;
          key?: string;
          owner_id?: string | null;
          part_number?: number;
          size?: number;
          upload_id?: string;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey";
            columns: ["bucket_id"];
            isOneToOne: false;
            referencedRelation: "buckets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey";
            columns: ["upload_id"];
            isOneToOne: false;
            referencedRelation: "s3_multipart_uploads";
            referencedColumns: ["id"];
          },
        ];
      };
      vector_indexes: {
        Row: {
          bucket_id: string;
          created_at: string;
          data_type: string;
          dimension: number;
          distance_metric: string;
          id: string;
          metadata_configuration: Json | null;
          name: string;
          updated_at: string;
        };
        Insert: {
          bucket_id: string;
          created_at?: string;
          data_type: string;
          dimension: number;
          distance_metric: string;
          id?: string;
          metadata_configuration?: Json | null;
          name: string;
          updated_at?: string;
        };
        Update: {
          bucket_id?: string;
          created_at?: string;
          data_type?: string;
          dimension?: number;
          distance_metric?: string;
          id?: string;
          metadata_configuration?: Json | null;
          name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey";
            columns: ["bucket_id"];
            isOneToOne: false;
            referencedRelation: "buckets_vectors";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      allow_any_operation: {
        Args: { expected_operations: string[] };
        Returns: boolean;
      };
      allow_only_operation: {
        Args: { expected_operation: string };
        Returns: boolean;
      };
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string };
        Returns: undefined;
      };
      extension: { Args: { name: string }; Returns: string };
      filename: { Args: { name: string }; Returns: string };
      foldername: { Args: { name: string }; Returns: string[] };
      get_common_prefix: {
        Args: { p_delimiter: string; p_key: string; p_prefix: string };
        Returns: string;
      };
      get_size_by_bucket: {
        Args: never;
        Returns: {
          bucket_id: string;
          size: number;
        }[];
      };
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string;
          delimiter_param: string;
          max_keys?: number;
          next_key_token?: string;
          next_upload_token?: string;
          prefix_param: string;
        };
        Returns: {
          created_at: string;
          id: string;
          key: string;
        }[];
      };
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string;
          delimiter_param: string;
          max_keys?: number;
          next_token?: string;
          prefix_param: string;
          sort_order?: string;
          start_after?: string;
        };
        Returns: {
          created_at: string;
          id: string;
          last_accessed_at: string;
          metadata: Json;
          name: string;
          updated_at: string;
        }[];
      };
      operation: { Args: never; Returns: string };
      search: {
        Args: {
          bucketname: string;
          levels?: number;
          limits?: number;
          offsets?: number;
          prefix: string;
          search?: string;
          sortcolumn?: string;
          sortorder?: string;
        };
        Returns: {
          created_at: string;
          id: string;
          last_accessed_at: string;
          metadata: Json;
          name: string;
          updated_at: string;
        }[];
      };
      search_by_timestamp: {
        Args: {
          p_bucket_id: string;
          p_level: number;
          p_limit: number;
          p_prefix: string;
          p_sort_column: string;
          p_sort_column_after: string;
          p_sort_order: string;
          p_start_after: string;
        };
        Returns: {
          created_at: string;
          id: string;
          key: string;
          last_accessed_at: string;
          metadata: Json;
          name: string;
          updated_at: string;
        }[];
      };
      search_v2: {
        Args: {
          bucket_name: string;
          levels?: number;
          limits?: number;
          prefix: string;
          sort_column?: string;
          sort_column_after?: string;
          sort_order?: string;
          start_after?: string;
        };
        Returns: {
          created_at: string;
          id: string;
          key: string;
          last_accessed_at: string;
          metadata: Json;
          name: string;
          updated_at: string;
        }[];
      };
    };
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

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
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
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
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
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
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS", "VECTOR"],
    },
  },
} as const;
