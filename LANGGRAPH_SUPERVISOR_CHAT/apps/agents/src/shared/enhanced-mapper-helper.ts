/**
 * Enhanced Mapper Helper
 *
 * Utility functions to integrate enhanced RAG feedback into mappers
 * This provides a consistent way to fetch and format feedback across all mappers
 */

import { getEnhancedFeedback } from './enhanced-feedback-rag.js';
import {
  formatEnhancedFeedbackForPrompt,
  formatFeedbackSummary,
  formatConfidenceAdvice,
} from './enhanced-feedback-formatter.js';
import type { WorkflowStateType } from './workflow-state.js';

export interface EnhancedFeedbackOptions {
  mapper: string;
  field?: string;
  state: WorkflowStateType;
  limit?: number;
  includePathFeedback?: boolean;
  includeSearchStrategies?: boolean;
  includeEdgeCases?: boolean;
  includePortalQuirks?: boolean;
}

/**
 * Get enhanced feedback and format it for mapper prompts
 * This is the main function mappers should use
 */
export async function getEnhancedFeedbackForMapper(
  options: EnhancedFeedbackOptions
): Promise<{
  feedbackSection: string;
  hasFeedback: boolean;
  summary: string;
}> {
  const {
    mapper,
    field,
    state,
    limit = 5,
    includePathFeedback = true,
    includeSearchStrategies = true,
    includeEdgeCases = true,
    includePortalQuirks = true,
  } = options;

  try {
    // Extract context from state
    const provider = state.extractedInfo?.insurance_provider || 'Unknown';
    const officeKey = state.officeKey || state.extractedInfo?.office_key;
    const portalVersion = state.portalVersion || state.extractedInfo?.portal_version;
    const portalType = portalVersion || state.portalType || state.extractedInfo?.portal_type;

    console.log(`[ENHANCED_FEEDBACK] Fetching for ${mapper}/${field || 'all'} (Office: ${officeKey || 'N/A'}, Portal: ${portalType || 'N/A'})`);

    // Fetch enhanced feedback
    const feedback = await getEnhancedFeedback({
      mapper,
      field,
      provider,
      portalType,
      officeId: officeKey,
      limit,
      includeEdgeCases,
      includePortalQuirks,
    });

    // Check if we have any feedback
    const hasFeedback =
      feedback.corrections.length > 0 ||
      feedback.edgeCases.length > 0 ||
      feedback.portalQuirks.length > 0 ||
      feedback.searchStrategies.length > 0;

    if (!hasFeedback) {
      console.log(`[ENHANCED_FEEDBACK] No feedback available for ${mapper}`);
      return {
        feedbackSection: '',
        hasFeedback: false,
        summary: '',
      };
    }

    // Log statistics
    console.log(`[ENHANCED_FEEDBACK] Retrieved for ${mapper}:`);
    console.log(`  - ${feedback.corrections.length} path corrections`);
    console.log(`  - ${feedback.edgeCases.length} edge cases`);
    console.log(`  - ${feedback.portalQuirks.length} portal quirks`);
    console.log(`  - ${feedback.searchStrategies.length} search strategies`);

    // Format feedback for prompt
    const feedbackSection = formatEnhancedFeedbackForPrompt(feedback, {
      includePathFeedback,
      includeSearchStrategies,
      includeEdgeCases,
      includePortalQuirks,
    });

    // Create summary
    const summary = formatFeedbackSummary(feedback);

    // Add confidence advice if available
    const confidenceAdvice = formatConfidenceAdvice(feedback.corrections);

    return {
      feedbackSection: feedbackSection + (confidenceAdvice ? '\n' + confidenceAdvice : ''),
      hasFeedback: true,
      summary,
    };
  } catch (error: any) {
    console.error(`[ENHANCED_FEEDBACK] Error fetching feedback for ${mapper}:`, error.message);
    return {
      feedbackSection: '',
      hasFeedback: false,
      summary: '',
    };
  }
}

/**
 * Build an enhanced mapper prompt with feedback
 * This combines the base prompt with enhanced feedback
 */
export function buildEnhancedMapperPrompt(
  basePrompt: string,
  feedbackSection: string,
  options: {
    prependFeedback?: boolean;
  } = {}
): string {
  const { prependFeedback = false } = options;

  if (!feedbackSection) {
    return basePrompt;
  }

  if (prependFeedback) {
    // Put feedback at the beginning (more prominent)
    return feedbackSection + '\n\n' + basePrompt;
  } else {
    // Put feedback before instructions (default)
    return basePrompt + '\n\n' + feedbackSection;
  }
}

/**
 * Format search terms from enhanced feedback
 * Extracts recommended search terms for a specific field
 */
export function getRecommendedSearchTerms(
  feedbackSection: string,
  field: string
): string[] {
  // This is a simple extraction - could be enhanced with better parsing
  const terms: string[] = [];

  // Default search terms based on field
  const defaultTerms: Record<string, string[]> = {
    patient_full_name: ['name', 'firstName', 'lastName', 'patient', 'member'],
    patient_dob: ['dob', 'birth', 'birthDate', 'dateOfBirth'],
    subscriber_name: ['subscriber', 'subscriberName', 'primaryName'],
    subscriber_id: ['subscriberId', 'memberId', 'id', 'memberNumber'],
    group_number: ['groupNumber', 'group', 'groupId'],
    insurance_company: ['company', 'carrier', 'payer', 'insurer'],
    plan_name: ['plan', 'planName', 'planType', 'product'],
    preventive_coverage: ['preventive', 'prevention', 'diagnostic', 'coverage'],
    basic_coverage: ['basic', 'restorative', 'coverage'],
    major_coverage: ['major', 'majorServices', 'coverage'],
    yearly_maximum: ['maximum', 'max', 'limit', 'annual'],
    yearly_deductible: ['deductible', 'ded', 'annual'],
    effective_date: ['effective', 'start', 'effectiveDate', 'eligibilityDate'],
    termination_date: ['termination', 'end', 'terminationDate', 'endDate'],
  };

  return defaultTerms[field] || [field];
}

/**
 * Log enhanced feedback usage
 * Helps track which mappers are benefiting from feedback
 */
export function logFeedbackUsage(
  mapper: string,
  hasFeedback: boolean,
  details?: {
    corrections?: number;
    edgeCases?: number;
    portalQuirks?: number;
    searchStrategies?: number;
  }
): void {
  if (hasFeedback && details) {
    console.log(
      `[ENHANCED_FEEDBACK] ✅ ${mapper} using enhanced feedback:`,
      `${details.corrections || 0} corrections, `,
      `${details.edgeCases || 0} edge cases, `,
      `${details.portalQuirks || 0} quirks, `,
      `${details.searchStrategies || 0} strategies`
    );
  } else {
    console.log(`[ENHANCED_FEEDBACK] ℹ️  ${mapper} - no enhanced feedback available (using defaults)`);
  }
}

/**
 * Example usage in a mapper:
 *
 * ```typescript
 * import { getEnhancedFeedbackForMapper, buildEnhancedMapperPrompt } from '../shared/enhanced-mapper-helper.js';
 *
 * // In your mapper node:
 * const { feedbackSection, hasFeedback, summary } = await getEnhancedFeedbackForMapper({
 *   mapper: 'patient_info_mapper',
 *   state,
 *   includeEdgeCases: true,
 *   includePortalQuirks: true,
 * });
 *
 * console.log(summary); // Log summary
 *
 * const basePrompt = `Extract patient info...`;
 * const enhancedPrompt = buildEnhancedMapperPrompt(basePrompt, feedbackSection);
 *
 * // Use enhancedPrompt for your agent
 * ```
 */
