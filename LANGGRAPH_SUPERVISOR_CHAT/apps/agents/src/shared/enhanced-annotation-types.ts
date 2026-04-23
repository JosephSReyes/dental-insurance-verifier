/**
 * Enhanced annotation types for Label Studio integration
 * These extend the basic feedback types with detailed annotation metadata
 */

export type PathQuality = 'correct' | 'incorrect' | 'partial' | 'ambiguous';
export type ValueQuality = 'exact' | 'format_issue' | 'type_issue' | 'incorrect';
export type SearchEffectiveness = 'effective' | 'suboptimal' | 'ineffective';
export type ReasoningQuality = 'excellent' | 'good' | 'flawed' | 'incorrect';
export type PortalQuirk = 'unusual_nesting' | 'missing_fields' | 'version_change' | 'inconsistent_format';

/**
 * Enhanced correction data captured during Label Studio annotation
 */
export interface EnhancedCorrectionData {
  // Core identification
  verification_id: string;
  mapper: string;
  field: string;

  // Basic extraction data (from existing system)
  ai_value: string | null;
  human_value: string | null;
  source_path?: string; // JSON path the LLM used
  correct_path?: string; // Correct JSON path if different
  human_reasoning?: string;

  // Path extraction quality
  path_quality: PathQuality;
  path_reasoning?: string;
  alternative_paths?: string[]; // Other valid paths

  // Value extraction quality
  value_quality: ValueQuality;
  format_correction?: string; // How to fix formatting issues

  // Search strategy evaluation
  search_terms_used?: string[]; // Terms LLM searched for
  search_effectiveness?: SearchEffectiveness;
  better_search_terms?: string[]; // Alternative search terms
  tool_usage_pattern?: string[]; // Sequence of tools called

  // Confidence calibration
  ai_confidence?: number; // LLM's stated confidence (0.00-1.00)
  human_confidence: number; // Human annotator confidence (1-5)
  confidence_gap?: number; // Computed difference

  // Portal-specific context
  portal_quirks?: PortalQuirk[];
  portal_notes?: string;
  portal_type?: string;
  office_id?: string;

  // Reasoning quality assessment
  reasoning_quality?: ReasoningQuality;
  reasoning_feedback?: string;

  // Edge case documentation
  is_edge_case: boolean;
  edge_case_description?: string;

  // Performance metrics
  tool_calls_count?: number;
  extraction_time_ms?: number;
  token_cost?: number;

  // Label Studio metadata
  label_studio_task_id?: string;
  label_studio_annotation_id?: string;
  annotator_id: string;
  annotation_time_seconds?: number;

  // Provider context
  provider?: string;

  // Embedding for RAG
  embedding?: number[];
}

/**
 * Database record for enhanced annotations
 */
export interface EnhancedAnnotationRecord extends EnhancedCorrectionData {
  id: number;
  created_at: Date;
  updated_at: Date;
  similarity_score?: number; // For RAG queries
}

/**
 * Label Studio task format for JSON path extraction validation
 */
export interface LabelStudioTask {
  id: string; // verification_id
  data: {
    // Original flattened JSON paths (input data)
    flattenedPaths: Array<{
      path: string;
      value: any;
      type: string;
    }>;

    // LLM extraction result (what we're validating)
    field: string;
    mapper: string;
    aiExtractedValue: any;
    aiSourcePath: string; // Path LLM chose
    aiReasoning: string;
    aiConfidence?: number;

    // Search strategy info (if available)
    searchTermsUsed?: string[];
    toolUsagePattern?: string[];

    // Context
    patientName: string;
    insuranceProvider: string;
    portalType: string;
    officeKey: string;

    // QA flags
    qaIssues?: string[];
    qaScore?: number;

    // Performance metrics
    toolCallsCount?: number;
    extractionTimeMs?: number;
  };

  // Pre-annotations from existing RAG feedback
  predictions?: Array<{
    model_version: string;
    score?: number;
    result: Array<{
      from_name: string;
      to_name: string;
      type: string;
      value: any;
    }>;
  }>;

  // Human annotations (populated by Label Studio)
  annotations?: Array<{
    id: string;
    completed_by: number;
    result: Array<{
      from_name: string;
      to_name: string;
      type: string;
      value: any;
    }>;
    was_cancelled: boolean;
    ground_truth: boolean;
    created_at: string;
    updated_at: string;
    lead_time: number; // annotation time in seconds
  }>;
}

/**
 * Label Studio annotation result format
 */
export interface LabelStudioAnnotationResult {
  // Path quality
  pathQuality?: {
    from_name: 'pathQuality';
    to_name: 'aiPath';
    type: 'choices';
    value: {
      choices: [PathQuality];
    };
  };

  // Correct path (if path is incorrect)
  correctPath?: {
    from_name: 'correctPath';
    to_name: 'aiPath';
    type: 'textarea';
    value: {
      text: [string];
    };
  };

  pathReasoning?: {
    from_name: 'pathReasoning';
    to_name: 'aiPath';
    type: 'textarea';
    value: {
      text: [string];
    };
  };

  // Value quality
  valueQuality?: {
    from_name: 'valueQuality';
    to_name: 'aiValue';
    type: 'choices';
    value: {
      choices: [ValueQuality];
    };
  };

  // Corrected value (if needed)
  correctValue?: {
    from_name: 'correctValue';
    to_name: 'aiValue';
    type: 'textarea';
    value: {
      text: [string];
    };
  };

  // Search strategy
  searchTermsUsed?: {
    from_name: 'searchTermsUsed';
    to_name: 'aiReasoning';
    type: 'textarea';
    value: {
      text: [string];
    };
  };

  searchEffectiveness?: {
    from_name: 'searchEffectiveness';
    to_name: 'aiReasoning';
    type: 'choices';
    value: {
      choices: [SearchEffectiveness];
    };
  };

  betterSearchTerms?: {
    from_name: 'betterSearchTerms';
    to_name: 'aiReasoning';
    type: 'textarea';
    value: {
      text: [string];
    };
  };

  // Confidence
  humanConfidence?: {
    from_name: 'humanConfidence';
    to_name: 'aiValue';
    type: 'rating';
    value: {
      rating: number;
    };
  };

  // Portal quirks
  portalQuirks?: {
    from_name: 'portalQuirks';
    to_name: 'paths';
    type: 'choices';
    value: {
      choices: PortalQuirk[];
    };
  };

  portalNotes?: {
    from_name: 'portalNotes';
    to_name: 'paths';
    type: 'textarea';
    value: {
      text: [string];
    };
  };

  // Reasoning quality
  reasoningQuality?: {
    from_name: 'reasoningQuality';
    to_name: 'aiReasoning';
    type: 'choices';
    value: {
      choices: [ReasoningQuality];
    };
  };

  // Edge case
  edgeCase?: {
    from_name: 'edgeCase';
    to_name: 'aiValue';
    type: 'choices';
    value: {
      choices: ['yes' | 'no'];
    };
  };

  edgeCaseDescription?: {
    from_name: 'edgeCaseDescription';
    to_name: 'aiValue';
    type: 'textarea';
    value: {
      text: [string];
    };
  };
}

/**
 * Query parameters for enhanced RAG feedback
 */
export interface EnhancedFeedbackParams {
  mapper: string;
  field?: string;
  provider?: string;
  portalType?: string;
  officeId?: string;
  searchTerms?: string[];
  limit?: number;
  minSimilarity?: number;
  includeEdgeCases?: boolean;
  includePortalQuirks?: boolean;
}

/**
 * RAG feedback response
 */
export interface EnhancedFeedbackResponse {
  corrections: EnhancedAnnotationRecord[];
  edgeCases: EnhancedAnnotationRecord[];
  portalQuirks: string[];
  searchStrategies: Array<{
    terms: string[];
    effectiveness: SearchEffectiveness;
    successRate: number;
  }>;
}

/**
 * Statistics for analytics dashboard
 */
export interface AnnotationStatistics {
  mapper: string;
  field: string;
  provider?: string;
  portalType?: string;
  officeId?: string;

  // Path quality stats
  totalAnnotations: number;
  correctPaths: number;
  incorrectPaths: number;
  partialPaths: number;
  ambiguousPaths: number;

  // Value quality stats
  exactValues: number;
  formatIssues: number;
  typeIssues: number;
  incorrectValues: number;

  // Search effectiveness stats
  effectiveSearches: number;
  suboptimalSearches: number;
  ineffectiveSearches: number;

  // Performance stats
  avgToolCalls: number;
  avgExtractionTimeMs: number;
  avgTokenCost: number;

  // Confidence stats
  avgAiConfidence: number;
  avgHumanConfidence: number;
  avgConfidenceGap: number;

  // Edge cases
  edgeCaseCount: number;

  lastAnnotationDate: Date;
}
