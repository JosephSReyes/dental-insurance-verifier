import { Annotation, MessagesAnnotation } from "@langchain/langgraph";
import type { OfficeContext } from "./officeContext.js";
import { BaseMessage } from "@langchain/core/messages";

/**
 * Shared messages annotation with trimming to prevent state bloat
 * Used by both WorkflowState and InputState to avoid conflicts
 */
const messagesAnnotation = Annotation<BaseMessage[]>({
  reducer: (existing: BaseMessage[], newMessages: BaseMessage[]) => {
    // Keep only last 20 messages to prevent state bloat
    const combined = [...existing, ...newMessages];
    return combined.slice(-20);
  },
  default: () => [],
});

/**
 * Single unified state schema for all agents in the workflow
 * Following typical LangGraph multi-agent patterns
 */
export const WorkflowState = Annotation.Root({
  // Base LangGraph message handling with trimming to prevent state bloat
  messages: messagesAnnotation,

  /**
   * Office context for multi-tenant support
   */
  office: Annotation<OfficeContext | undefined>({
    default: () => undefined,
    reducer: (_existing: OfficeContext | undefined, newOffice: OfficeContext | undefined) => newOffice,
  }),

  /**
   * Office key/identifier for per-office RAG filtering
   */
  officeKey: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (_existing: string | undefined, newKey: string | undefined) => newKey,
  }),

  /**
   * Portal type (bcbs, delta_dental) for per-portal RAG filtering
   */
  portalType: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (_existing: string | undefined, newType: string | undefined) => newType,
  }),

  /**
   * Portal version (specific portal variant, e.g., 'bcbs_ca', 'delta_wa')
   */
  portalVersion: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (_existing: string | undefined, newVersion: string | undefined) => newVersion,
  }),

  /**
   * Next agent to route to (used by supervisor)
   */
  nextAgent: Annotation<string>({
    default: () => "",
    reducer: (_: string, newAgent: string) => newAgent,
  }),

  /**
   * Extracted patient information with structured format
   */
  extractedInfo: Annotation<{
    request_type?: string;
    patient_name?: string;
    insurance_provider?: string;
    dental_codes?: string[];
    appointment_date?: string;
    office_name?: string;
    office_key?: string;  // For RAG filtering
    portal_type?: string;  // For RAG filtering
    portal_version?: string;  // For RAG filtering (specific portal variant)
    additional_notes?: string | null;
    // BCBS-specific fields
    patient_dob?: string | null;
    patient_id?: string | null;
    patient_ssn?: string | null;
    policy_number?: string | null;
  } | undefined>({
    default: () => undefined,
    reducer: (_existing: any, newInfo: any) => newInfo,
  }),

  /**
   * Portal launch result data
   * Tracks whether browser was launched and portal loaded successfully
   */
  portalLaunchResult: Annotation<{
    success: boolean;
    attempts: number;
    url?: string;
    pageTitle?: string;
    timestamp: string;
    timingMs?: number;
    error?: string;
  } | undefined>({
    default: () => undefined,
    reducer: (_existing: any, newResult: any) => newResult,
  }),

  /**
   * Authentication result from portal login
   */
  authResult: Annotation<any>({
    default: () => undefined,
    reducer: (_existing: any, newResult: any) => newResult,
  }),

  /**
   * Navigation result within portal
   */
  navigationResult: Annotation<any>({
    default: () => undefined,
    reducer: (_existing: any, newResult: any) => newResult,
  }),

  /**
   * Scraped coverage data
   */
  coverageData: Annotation<any>({
    default: () => undefined,
    reducer: (_existing: any, newData: any) => newData,
  }),

  /**
   * Scraped benefits data
   */
  benefitsData: Annotation<any>({
    default: () => undefined,
    reducer: (_existing: any, newData: any) => newData,
  }),

  /**
   * Scraping completion status
   */
  scrapingComplete: Annotation<boolean>({
    default: () => false,
    reducer: (_existing: boolean, newStatus: boolean) => newStatus,
  }),

  /**
   * Validation result for scraped data
   */
  validationResult: Annotation<any>({
    default: () => undefined,
    reducer: (_existing: any, newResult: any) => newResult,
  }),

  /**
   * Reference to patient folder containing API response JSON files
   */
  patientApiDataFolder: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (_existing: string | undefined, newFolder: string | undefined) => newFolder,
  }),

  /**
   * JSON flattening completion status
   */
  jsonFlattened: Annotation<boolean>({
    default: () => false,
    reducer: (_existing: boolean, newStatus: boolean) => newStatus,
  }),

  /**
   * Procedure aggregation completion status
   */
  proceduresAggregated: Annotation<boolean>({
    default: () => false,
    reducer: (_existing: boolean, newStatus: boolean) => newStatus,
  }),

  /**
   * Path to aggregated procedures JSON file
   */
  aggregatedProcedurePath: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (_existing: string | undefined, newPath: string | undefined) => newPath,
  }),

  /**
   * Path to domain-aggregated data file
   */
  aggregatedDataPath: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (_existing: string | undefined, newPath: string | undefined) => newPath,
  }),

  /**
   * Verification completion status
   */
  verificationComplete: Annotation<boolean>({
    default: () => false,
    reducer: (_existing: boolean, newStatus: boolean) => newStatus,
  }),

  /**
  }),

  /**
   * Verification data shared across agents
   */
  verificationResult: Annotation<any>({
    default: () => ({}),
    reducer: (existing: any, newResult: any) => ({ ...existing, ...newResult }),
  }),

  /**
   * Generated forms (JSON, HTML, PDF)
   */
  forms: Annotation<{
    json?: string;
    html?: string;
    pdf?: string;
  } | undefined>({
    default: () => undefined,
    reducer: (_existing, newForms) => newForms,
  }),

  /**
   * Final agent output
   */
  output: Annotation<string>({
    default: () => "",
    reducer: (_existing: string, newOutput: string) => newOutput,
  }),

  /**
   * Track which agents have completed (simple coordination)
   */
  completedAgents: Annotation<string[]>({
    default: () => [],
    reducer: (existing: string[], newAgents: string[]) => [...new Set([...existing, ...newAgents])],
  }),

  /**
   * Verification data loading status
   */
  verificationDataLoaded: Annotation<boolean>({
    default: () => false,
    reducer: (_existing: boolean, newStatus: boolean) => newStatus,
  }),

  /**
   * Loaded API data for verification analysis
   */
  loadedApiData: Annotation<any>({
    default: () => undefined,
    reducer: (_existing: any, newData: any) => newData,
  }),

  /**
   * Procedure analyses from verification workflow
   * Reducer appends new analyses to existing array (for parallel branch merging)
   */
  procedureAnalyses: Annotation<any[]>({
    default: () => [],
    reducer: (existing: any[], newAnalyses: any[]) => {
      if (!newAnalyses || newAnalyses.length === 0) return existing;
      // Append new analyses, avoiding duplicates by code
      const existingCodes = new Set(existing.map((a: any) => a.code));
      const uniqueNew = newAnalyses.filter((a: any) => !existingCodes.has(a.code));
      return [...existing, ...uniqueNew];
    },
  }),

  /**
   * Delta Dental active session metadata
   * Tracks authenticated session state to enable reuse across multiple verifications
   */
  deltaDentalSession: Annotation<{
    isActive: boolean;
    sessionId?: string;
    authenticatedAt?: string;
    lastUsedAt?: string;
    officeId?: string;
    currentPageUrl?: string;
    sessionExpiresAt?: string;
  } | undefined>({
    default: () => undefined,
    reducer: (_existing: any, newSession: any) => newSession,
  }),

  /**
   * Master list of all procedure codes extracted from dataset
   * Built deterministically from aggregated data - not generated by LLM
   */
  procedureCodes: Annotation<Array<{
    code: string;
    processed: boolean;
    sourceFile?: string;
  }>>({
    default: () => [],
    reducer: (_existing: any[], newCodes: any[]) => newCodes,
  }),

  /**
   * Procedure details for ALL codes being analyzed
   */
  allProcedureDetails: Annotation<any[]>({
    default: () => [],
    reducer: (_existing: any[], newDetails: any[]) => newDetails,
  }),

  /**
   * Usage counts for ALL procedures
   */
  allUsageCounts: Annotation<any[]>({
    default: () => [],
    reducer: (_existing: any[], newCounts: any[]) => newCounts,
  }),

  /**
   * Current procedure code being analyzed in verification sub-graph
   */
  currentProcedureCode: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (_existing: string | undefined, newCode: string | undefined) => newCode,
  }),

  /**
   * Current procedure index (for iterating through dental_codes array)
   */
  currentProcedureIndex: Annotation<number>({
    default: () => 0,
    reducer: (_existing: number, newIndex: number) => newIndex,
  }),

  /**
   * Current procedure details (from extract_details tool)
   */
  currentProcedureDetails: Annotation<any>({
    default: () => null,
    reducer: (_existing: any, newDetails: any) => newDetails,
  }),

  /**
   * Current related codes (from find_related_codes tool)
   */
  currentRelatedCodes: Annotation<string[] | undefined>({
    default: () => undefined,
    reducer: (_existing: string[] | undefined, newCodes: string[] | undefined) => newCodes,
  }),

  /**
   * Current usage counts map (code -> count)
   */
  currentUsageCounts: Annotation<Record<string, number>>({
    default: () => ({}),
    reducer: (_existing: Record<string, number>, newCounts: Record<string, number>) => newCounts,
  }),

  /**
   * Code to count next (for count_usage node)
   */
  currentCodeToCount: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (_existing: string | undefined, newCode: string | undefined) => newCode,
  }),

  /**
   * Confidence scores for key decisions and outputs
   * Tracks reliability of LLM vs deterministic operations
   */
  confidenceScores: Annotation<{
    extractedInfo?: {
      confidence: number;
      source: 'llm_extraction' | 'deterministic';
      timestamp: string;
    };
    insuranceInfo?: {
      confidence: number;
      source: 'llm_extraction' | 'deterministic';
      timestamp: string;
    };
    coverageBenefitsInfo?: {
      confidence: number;
      source: 'llm_extraction' | 'deterministic';
      timestamp: string;
    };
    orthodonticBenefitsInfo?: {
      confidence: number;
      source: 'llm_extraction' | 'deterministic';
      timestamp: string;
    };
    waitingPeriodsInfo?: {
      confidence: number;
      source: 'llm_extraction' | 'deterministic';
      timestamp: string;
    };
    procedureDetailsInfo?: {
      confidence: number;
      source: 'deterministic' | 'one_at_a_time' | 'parallel';
      timestamp: string;
    };
    treatmentHistoryInfo?: {
      confidence: number;
      source: 'llm_extraction' | 'deterministic';
      timestamp: string;
    };
    procedureDecisions?: Array<{
      code: string;
      confidence: number;
      source: 'llm_reasoning' | 'deterministic_rule';
      validatedAgainstLimits: boolean;
      timestamp: string;
    }>;
    verificationSummary?: {
      confidence: number;
      source: 'llm_summary' | 'deterministic';
      consistencyCheck: boolean;
      timestamp: string;
    };
    costCalculations?: {
      confidence: number;
      source: 'deterministic';
      timestamp: string;
    };
  }>({
    default: () => ({}),
    reducer: (_existing: any, newScores: any) => ({ ..._existing, ...newScores }),
  }),

  /**
   * QA validation completion status
   */
  qaValidationComplete: Annotation<boolean>({
    default: () => false,
    reducer: (_existing: boolean, newStatus: boolean) => newStatus,
  }),

  /**
   * QA validation report
   */
  qaValidationReport: Annotation<any>({
    default: () => undefined,
    reducer: (_existing: any, newReport: any) => newReport,
  }),

  /**
   * Human feedback capture
   */
  humanFeedback: Annotation<any>({
    default: () => undefined,
    reducer: (_existing: any, newFeedback: any) => newFeedback,
  }),

  /**
  }),

  /**
  }),

  /**
  }),

  /**
  }),

  /**
   * Mapper batch completion tracking for parallel execution
   * Batch 1: patient_info_mapper + insurance_info_mapper
   * Batch 2: coverage_and_benefits, orthodontic_benefits, waiting_periods, procedure_details, treatment_history
   */
  mapperBatchesComplete: Annotation<{
    batch1: boolean;  // patient_info + insurance_info
    batch2: boolean;  // all other mappers
  }>({
    default: () => ({ batch1: false, batch2: false }),
    reducer: (_existing: any, newStatus: any) => ({ ..._existing, ...newStatus }),
  }),

  /**
   * PreParser output path
   */
  preParserOutputPath: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (_existing: string | undefined, newPath: string | undefined) => newPath,
  }),

  /**
   * PreParser completion status
   */
  preParserComplete: Annotation<boolean>({
    default: () => false,
    reducer: (_existing: boolean, newStatus: boolean) => newStatus,
  }),

  /**
   * Extractor output path
   */
  extractorOutputPath: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (_existing: string | undefined, newPath: string | undefined) => newPath,
  }),

  /**
   * Extractor completion status
   */
  extractorComplete: Annotation<boolean>({
    default: () => false,
    reducer: (_existing: boolean, newStatus: boolean) => newStatus,
  }),

  /**
   * FieldNormalizer output path
   */
  fieldNormalizerOutputPath: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (_existing: string | undefined, newPath: string | undefined) => newPath,
  }),

  /**
   * FieldNormalizer completion status
   */
  fieldNormalizerComplete: Annotation<boolean>({
    default: () => false,
    reducer: (_existing: boolean, newStatus: boolean) => newStatus,
  }),

  /**
   * ValueNormalizer output path
   */
  valueNormalizerOutputPath: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (_existing: string | undefined, newPath: string | undefined) => newPath,
  }),

  /**
   * ValueNormalizer completion status
   */
  valueNormalizerComplete: Annotation<boolean>({
    default: () => false,
    reducer: (_existing: boolean, newStatus: boolean) => newStatus,
  }),

  /**
   * Simplifier output path
   */
  simplifierOutputPath: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (_existing: string | undefined, newPath: string | undefined) => newPath,
  }),

  /**
   * Simplifier completion status
   */
  simplifierComplete: Annotation<boolean>({
    default: () => false,
    reducer: (_existing: boolean, newStatus: boolean) => newStatus,
  }),

  /**
   * Chunker output path
   */
  chunkerOutputPath: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (_existing: string | undefined, newPath: string | undefined) => newPath,
  }),

  /**
   * Chunker completion status
   */
  chunkerComplete: Annotation<boolean>({
    default: () => false,
    reducer: (_existing: boolean, newStatus: boolean) => newStatus,
  }),

  /**
   * Embedder output path
   */
  embedderOutputPath: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (_existing: string | undefined, newPath: string | undefined) => newPath,
  }),

  /**
   * Embedder completion status
   */
  embedderComplete: Annotation<boolean>({
    default: () => false,
    reducer: (_existing: boolean, newStatus: boolean) => newStatus,
  }),
});

/**
 * Type for the workflow state
 */
export type WorkflowStateType = typeof WorkflowState.State;

/**
 * Input state (what users provide)
 * Uses the same messagesAnnotation as WorkflowState to enable Chat interface
 */
export const InputState = Annotation.Root({
  messages: messagesAnnotation,
});

export type InputStateType = typeof InputState.State;

/**
 * Output state (what Chat interface displays)
 * Must include messages for LangGraph Studio Chat UI to render conversation
 */
export const OutputState = Annotation.Root({
  messages: messagesAnnotation,
});

export type OutputStateType = typeof OutputState.State;

