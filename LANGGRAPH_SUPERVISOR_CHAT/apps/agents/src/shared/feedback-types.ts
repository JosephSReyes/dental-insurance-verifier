export interface CorrectionData {
  verification_id: string;
  mapper: string;
  provider: string;
  field: string;
  ai_value: string | null;
  human_value: string | null;
  source_path?: string;
  correct_path?: string;
  human_reasoning?: string;
  reviewer_id?: string;
  reviewed_at?: Date;
  office_id?: string;  // NEW: Top-level column for filtering
  portal_type?: string;  // NEW: Top-level column for filtering

  // Multiple error types support (Migration 006)
  error_types?: string[];  // Array of error type categories
  error_explanations?: Record<string, string>;  // Explanation per error type
  violated_business_rules?: string[];  // Array of business rule codes
  business_rule_explanations?: Record<string, string>;  // Explanation per business rule
  feedback_date?: Date;  // Date when feedback was submitted

  metadata?: {
    patient_name?: string;
    verification_date?: string;
    office_id?: string;  // DEPRECATED: Keep for backward compatibility
    portal_type?: string;  // DEPRECATED: Keep for backward compatibility
    [key: string]: any;
  };
}

export interface CorrectionRecord extends CorrectionData {
  id: number;
  embedding?: number[];
  created_at: Date;
  updated_at: Date;
  similarity_score?: number;
  office_id: string | null;  // Ensure these are present
  portal_type: string | null;
}

export interface FeedbackQueryParams {
  mapper: string;
  provider: string;
  field?: string;
  limit?: number;
  officeId?: string;  // NEW: Filter by office
  portalType?: string;  // NEW: Filter by portal
}

export interface SemanticSearchParams {
  query: string;
  mapper?: string;
  provider?: string;
  field?: string;
  limit?: number;
  minSimilarity?: number;
  officeId?: string;  // NEW: Filter by office
  portalType?: string;  // NEW: Filter by portal
}

export interface RelevantFeedbackParams {
  mapper: string;
  provider: string;
  field?: string;
  currentContext?: string;
  limit?: number;
  officeId?: string;  // NEW: Filter by office
  portalType?: string;  // NEW: Filter by portal
}

export interface FeedbackStats {
  total_corrections: number;
  by_mapper: Record<string, number>;
  by_provider: Record<string, number>;
  by_field: Record<string, number>;
  most_corrected_fields: Array<{
    field: string;
    mapper: string;
    provider: string;
    count: number;
  }>;
}
