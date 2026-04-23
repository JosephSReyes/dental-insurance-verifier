/**
 * Active Learning Scorer
 *
 * Calculates uncertainty scores for verifications to prioritize
 * which ones need human annotation the most.
 */

import { getPool } from './db-setup.js';

export interface UncertaintyFactors {
  lowConfidence: number;        // 0-1: AI confidence is low
  inconsistentExtraction: number; // 0-1: Multiple attempts disagree
  edgeCaseIndicators: number;   // 0-1: Looks like an edge case
  portalQuirks: number;         // 0-1: Known portal issues
  fieldCriticality: number;     // 0-1: How important is this field
  learningValue: number;        // 0-1: How much can we learn
}

export interface UncertaintyScore {
  verificationId: string;
  totalScore: number;           // 0-100: Overall uncertainty
  factors: UncertaintyFactors;
  reasoning: string[];
  priority: 'critical' | 'high' | 'medium' | 'low';
  recommendAnnotation: boolean;
}

interface VerificationContext {
  verificationId: string;
  mapper: string;
  field: string;
  extractedValue: any;
  confidence: number;
  portalType: string;
  officeId: string;
  toolCalls: number;
  extractionTime: number;
  metadata?: any;
}

// Field criticality weights (1-10)
const FIELD_CRITICALITY: Record<string, number> = {
  // Critical fields
  active: 10,
  deductible_individual: 9,
  deductible_family: 9,
  oop_max_individual: 9,
  oop_max_family: 9,
  copay: 8,
  coinsurance: 8,

  // Important fields
  effective_date: 7,
  termination_date: 7,
  network_status: 7,

  // Standard fields
  patient_name: 5,
  patient_dob: 5,
  member_id: 5,
  group_number: 5,

  // Less critical
  plan_name: 3,
  plan_type: 3,
};

/**
 * Calculate uncertainty score for a verification
 */
export async function calculateUncertaintyScore(
  context: VerificationContext
): Promise<UncertaintyScore> {
  const factors = await calculateUncertaintyFactors(context);
  const reasoning: string[] = [];

  // Weight and combine factors
  const weights = {
    lowConfidence: 0.25,
    inconsistentExtraction: 0.20,
    edgeCaseIndicators: 0.15,
    portalQuirks: 0.15,
    fieldCriticality: 0.15,
    learningValue: 0.10,
  };

  let totalScore = 0;

  // Low confidence
  if (factors.lowConfidence > 0.5) {
    totalScore += factors.lowConfidence * weights.lowConfidence * 100;
    reasoning.push(`Low AI confidence (${(context.confidence * 100).toFixed(1)}%)`);
  }

  // Inconsistent extraction
  if (factors.inconsistentExtraction > 0.5) {
    totalScore += factors.inconsistentExtraction * weights.inconsistentExtraction * 100;
    reasoning.push('Multiple extraction attempts produced different results');
  }

  // Edge case indicators
  if (factors.edgeCaseIndicators > 0.5) {
    totalScore += factors.edgeCaseIndicators * weights.edgeCaseIndicators * 100;
    reasoning.push('Exhibits edge case characteristics');
  }

  // Portal quirks
  if (factors.portalQuirks > 0.5) {
    totalScore += factors.portalQuirks * weights.portalQuirks * 100;
    reasoning.push(`Portal ${context.portalType} has known data structure issues`);
  }

  // Field criticality
  totalScore += factors.fieldCriticality * weights.fieldCriticality * 100;
  if (factors.fieldCriticality > 0.7) {
    reasoning.push(`Critical field: ${context.field}`);
  }

  // Learning value
  if (factors.learningValue > 0.5) {
    totalScore += factors.learningValue * weights.learningValue * 100;
    reasoning.push('High learning value - diverse/unique example');
  }

  // Determine priority
  let priority: 'critical' | 'high' | 'medium' | 'low';
  if (totalScore >= 75) priority = 'critical';
  else if (totalScore >= 50) priority = 'high';
  else if (totalScore >= 25) priority = 'medium';
  else priority = 'low';

  // Recommend annotation if score is high enough or field is critical
  const recommendAnnotation =
    totalScore >= 40 ||
    (factors.fieldCriticality > 0.8 && totalScore >= 25);

  return {
    verificationId: context.verificationId,
    totalScore,
    factors,
    reasoning,
    priority,
    recommendAnnotation,
  };
}

/**
 * Calculate individual uncertainty factors
 */
async function calculateUncertaintyFactors(
  context: VerificationContext
): Promise<UncertaintyFactors> {
  const pool = getPool();

  // 1. Low confidence factor (inverse of confidence)
  const lowConfidence = 1 - context.confidence;

  // 2. Inconsistent extraction (check if we've extracted this field differently before)
  let inconsistentExtraction = 0;
  try {
    const inconsistencyQuery = await pool.query(
      `SELECT COUNT(DISTINCT ai_extracted_value) as distinct_values
       FROM enhanced_annotations
       WHERE mapper = $1 AND field = $2 AND portal_type = $3
       AND office_id = $4
       LIMIT 10`,
      [context.mapper, context.field, context.portalType, context.officeId]
    );

    if (inconsistencyQuery.rows[0]) {
      const distinctValues = parseInt(inconsistencyQuery.rows[0].distinct_values, 10);
      inconsistentExtraction = Math.min(distinctValues / 5, 1); // Cap at 1
    }
  } catch (err) {
    // No previous data, default to 0
  }

  // 3. Edge case indicators
  let edgeCaseIndicators = 0;

  // High tool calls suggest complexity
  if (context.toolCalls > 5) {
    edgeCaseIndicators += 0.3;
  }

  // Long extraction time suggests difficulty
  if (context.extractionTime > 3000) {
    edgeCaseIndicators += 0.3;
  }

  // Null or empty values might indicate edge cases
  if (context.extractedValue === null || context.extractedValue === '') {
    edgeCaseIndicators += 0.4;
  }

  edgeCaseIndicators = Math.min(edgeCaseIndicators, 1);

  // 4. Portal quirks (check if this portal has issues)
  let portalQuirks = 0;
  try {
    const quirkQuery = await pool.query(
      `SELECT COUNT(*) as quirk_count
       FROM enhanced_annotations
       WHERE portal_type = $1
       AND portal_quirks IS NOT NULL
       AND array_length(portal_quirks, 1) > 0`,
      [context.portalType]
    );

    if (quirkQuery.rows[0]) {
      const quirkCount = parseInt(quirkQuery.rows[0].quirk_count, 10);
      portalQuirks = Math.min(quirkCount / 20, 1); // Normalize
    }
  } catch (err) {
    // Default to 0
  }

  // 5. Field criticality
  const criticalityScore = FIELD_CRITICALITY[context.field] || 5;
  const fieldCriticality = criticalityScore / 10; // Normalize to 0-1

  // 6. Learning value (diversity score)
  let learningValue = 0;
  try {
    // Check how many examples we already have for this combination
    const diversityQuery = await pool.query(
      `SELECT COUNT(*) as example_count
       FROM enhanced_annotations
       WHERE mapper = $1 AND field = $2 AND portal_type = $3`,
      [context.mapper, context.field, context.portalType]
    );

    if (diversityQuery.rows[0]) {
      const exampleCount = parseInt(diversityQuery.rows[0].example_count, 10);
      // Higher learning value when we have fewer examples
      learningValue = Math.max(0, 1 - (exampleCount / 50));
    } else {
      learningValue = 1; // No examples = high learning value
    }
  } catch (err) {
    learningValue = 0.5; // Default
  }

  return {
    lowConfidence,
    inconsistentExtraction,
    edgeCaseIndicators,
    portalQuirks,
    fieldCriticality,
    learningValue,
  };
}

/**
 * Batch calculate uncertainty scores for multiple verifications
 */
export async function calculateBatchUncertaintyScores(
  contexts: VerificationContext[]
): Promise<UncertaintyScore[]> {
  const scores = await Promise.all(
    contexts.map(context => calculateUncertaintyScore(context))
  );

  // Sort by total score (highest first)
  return scores.sort((a, b) => b.totalScore - a.totalScore);
}

/**
 * Get top priority verifications that need annotation
 */
export async function getTopPriorityVerifications(
  limit: number = 20,
  minScore: number = 40
): Promise<UncertaintyScore[]> {
  const pool = getPool();

  // Get recent verifications that haven't been annotated yet
  const query = `
    SELECT DISTINCT ON (v.verification_id)
      v.verification_id,
      v.mapper,
      v.field,
      v.extracted_value,
      v.confidence,
      v.portal_type,
      v.office_id,
      v.tool_calls_count,
      v.extraction_time_ms,
      v.metadata
    FROM verifications v
    LEFT JOIN enhanced_annotations ea
      ON v.verification_id = ea.verification_id
      AND v.field = ea.field
    WHERE ea.id IS NULL  -- Not yet annotated
      AND v.created_at >= NOW() - INTERVAL '7 days'
    ORDER BY v.verification_id, v.created_at DESC
    LIMIT 100
  `;

  try {
    const result = await pool.query(query);

    const contexts: VerificationContext[] = result.rows.map(row => ({
      verificationId: row.verification_id,
      mapper: row.mapper,
      field: row.field,
      extractedValue: row.extracted_value,
      confidence: parseFloat(row.confidence) || 0.5,
      portalType: row.portal_type,
      officeId: row.office_id,
      toolCalls: parseInt(row.tool_calls_count, 10) || 0,
      extractionTime: parseFloat(row.extraction_time_ms) || 0,
      metadata: row.metadata,
    }));

    const scores = await calculateBatchUncertaintyScores(contexts);

    // Filter by minimum score and limit
    return scores
      .filter(score => score.totalScore >= minScore)
      .slice(0, limit);
  } catch (error) {
    console.error('Error getting top priority verifications:', error);
    return [];
  }
}
