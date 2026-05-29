// ============================================================================
// Database types for supabase-js
// ============================================================================
// Hand-written to match the migrations. After running migrations you can
// regenerate this from the live DB with:
//
//   supabase gen types typescript --project-id <id> --schema public > web/lib/database.types.ts
//
// Then import the typed client in your Next.js app:
//
//   import { createClient } from '@supabase/supabase-js'
//   import type { Database } from '@/lib/database.types'
//   const supabase = createClient<Database>(URL, ANON_KEY)
// ============================================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type RfpSource =
  | 'sam.gov'
  | 'Cal eProcure'
  | 'PlanetBids'
  | 'Authorium'
  | 'Public Purchase'
  | 'other'

/** Values accepted by rfps_source_check — use for filter dropdowns. */
export const RFP_SOURCE_OPTIONS: readonly RfpSource[] = [
  'Cal eProcure',
  'sam.gov',
  'PlanetBids',
  'Authorium',
  'Public Purchase',
  'other',
] as const

export type RfpStatus =
  | 'active'
  | 'closed'
  | 'cancelled'
  | 'awarded'
  | 'amended'

export interface Database {
  public: {
    Tables: {
      contractors: {
        Row: {
          id: string
          user_id: string
          company_name: string
          description: string | null
          website_url: string | null
          linkedin_url: string | null
          industries: string[]
          sub_industries: string[]
          goals: string | null
          preferred_locations: string[]
          preferred_contract_min: number | null
          preferred_contract_max: number | null
          preferred_response_window_days: number | null
          certifications: string[]
          set_aside_eligibility: string[]
          naics_codes: string[]
          exclusions: string[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          company_name: string
          description?: string | null
          website_url?: string | null
          linkedin_url?: string | null
          industries?: string[]
          sub_industries?: string[]
          goals?: string | null
          preferred_locations?: string[]
          preferred_contract_min?: number | null
          preferred_contract_max?: number | null
          preferred_response_window_days?: number | null
          certifications?: string[]
          set_aside_eligibility?: string[]
          naics_codes?: string[]
          exclusions?: string[]
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['contractors']['Insert']>
        Relationships: []
      }

      contractor_past_projects: {
        Row: {
          id: string
          contractor_id: string
          project_name: string
          description: string | null
          client: string | null
          start_date: string | null
          end_date: string | null
          contract_value: number | null
          tags: string[]
          embedding: number[] | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          contractor_id: string
          project_name: string
          description?: string | null
          client?: string | null
          start_date?: string | null
          end_date?: string | null
          contract_value?: number | null
          tags?: string[]
          embedding?: number[] | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<
          Database['public']['Tables']['contractor_past_projects']['Insert']
        >
        Relationships: []
      }

      rfps: {
        Row: {
          id: string
          source: RfpSource
          external_id: string
          url: string | null
          title: string
          name: string | null
          description: string | null
          statement_of_work: string | null
          deliverables: string[]
          location: string | null
          location_level: string | null
          state: string | null
          department: string | null
          due_date: string | null
          posted_date: string | null
          contract_amount_min: number | null
          contract_amount_max: number | null
          tags: string[]
          is_relevant: boolean | null
          classifier_version: string | null
          contact_name: string | null
          contact_email: string | null
          contact_phone: string | null
          raw_data: Json | null
          metadata: Json
          content_hash: string | null
          status: RfpStatus
          last_amended_at: string | null
          pdf_url_1: string | null
          pdf_url_2: string | null
          pdf_url_3: string | null
          pdf_url_4: string | null
          pdf_url_5: string | null
          pdf_url_6: string | null
          pdf_url_7: string | null
          pdf_url_8: string | null
          pdf_url_9: string | null
          pdf_url_10: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          source: RfpSource
          external_id: string
          url?: string | null
          title: string
          name?: string | null
          description?: string | null
          statement_of_work?: string | null
          deliverables?: string[]
          location?: string | null
          location_level?: string | null
          state?: string | null
          department?: string | null
          due_date?: string | null
          posted_date?: string | null
          contract_amount_min?: number | null
          contract_amount_max?: number | null
          tags?: string[]
          is_relevant?: boolean | null
          classifier_version?: string | null
          contact_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          raw_data?: Json | null
          metadata?: Json
          content_hash?: string | null
          status?: RfpStatus
          last_amended_at?: string | null
          pdf_url_1?: string | null
          pdf_url_2?: string | null
          pdf_url_3?: string | null
          pdf_url_4?: string | null
          pdf_url_5?: string | null
          pdf_url_6?: string | null
          pdf_url_7?: string | null
          pdf_url_8?: string | null
          pdf_url_9?: string | null
          pdf_url_10?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['rfps']['Insert']>
        Relationships: []
      }

      rfp_chunks: {
        Row: {
          id: string
          rfp_id: string
          chunk_index: number
          chunk_text: string
          embedding: number[] | null
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          rfp_id: string
          chunk_index: number
          chunk_text: string
          embedding?: number[] | null
          metadata?: Json
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['rfp_chunks']['Insert']>
        Relationships: []
      }

      rfp_amendments: {
        Row: {
          id: string
          rfp_id: string
          amendment_number: string | null
          description: string | null
          changes: Json | null
          detected_at: string
        }
        Insert: {
          id?: string
          rfp_id: string
          amendment_number?: string | null
          description?: string | null
          changes?: Json | null
          detected_at?: string
        }
        Update: Partial<
          Database['public']['Tables']['rfp_amendments']['Insert']
        >
        Relationships: []
      }

      saved_rfps: {
        Row: {
          contractor_id: string
          rfp_id: string
          notes: string | null
          saved_at: string
          sort_position: number | null
        }
        Insert: {
          contractor_id: string
          rfp_id: string
          notes?: string | null
          saved_at?: string
          sort_position?: number | null
        }
        Update: Partial<Database['public']['Tables']['saved_rfps']['Insert']>
        Relationships: []
      }

      scores: {
        Row: {
          id: string
          contractor_id: string
          rfp_id: string
          score: number
          reasoning: string | null
          factors: Json | null
          model_version: string | null
          computed_at: string
        }
        Insert: {
          id?: string
          contractor_id: string
          rfp_id: string
          score: number
          reasoning?: string | null
          factors?: Json | null
          model_version?: string | null
          computed_at?: string
        }
        Update: Partial<Database['public']['Tables']['scores']['Insert']>
        Relationships: []
      }

      rfp_summaries: {
        Row: {
          id: string
          rfp_id: string
          summary: string
          summary_type: string
          model: string | null
          prompt_version: string | null
          generated_at: string
        }
        Insert: {
          id?: string
          rfp_id: string
          summary: string
          summary_type?: string
          model?: string | null
          prompt_version?: string | null
          generated_at?: string
        }
        Update: Partial<
          Database['public']['Tables']['rfp_summaries']['Insert']
        >
        Relationships: []
      }

      department_aliases: {
        Row: {
          id: string
          canonical_name: string
          alias: string
          created_at: string
        }
        Insert: {
          id?: string
          canonical_name: string
          alias: string
          created_at?: string
        }
        Update: Partial<
          Database['public']['Tables']['department_aliases']['Insert']
        >
        Relationships: []
      }
    }

    Views: Record<string, never>

    Functions: {
      match_rfp_chunks: {
        Args: {
          query_embedding: number[]
          match_threshold?: number
          match_count?: number
          filter_rfp_ids?: string[] | null
        }
        Returns: {
          id: string
          rfp_id: string
          chunk_text: string
          metadata: Json
          similarity: number
        }[]
      }
      match_past_projects: {
        Args: {
          query_embedding: number[]
          match_threshold?: number
          match_count?: number
          filter_contractor_id?: string | null
        }
        Returns: {
          id: string
          contractor_id: string
          project_name: string
          description: string | null
          similarity: number
        }[]
      }
      normalize_department: {
        Args: { input_name: string }
        Returns: string
      }
      normalize_department_fuzzy: {
        Args: { input_name: string; threshold?: number }
        Returns: string
      }
      record_rfp_amendment: {
        Args: {
          p_rfp_id: string
          p_amendment_number: string | null
          p_description: string | null
          p_changes: Json | null
          p_new_content_hash: string
        }
        Returns: string
      }
      drive_file_id: {
        Args: { drive_url: string }
        Returns: string | null
      }
    }
  }
}
