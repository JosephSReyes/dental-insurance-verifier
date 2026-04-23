/**
 * Disagreement Detector
 *
 * Detects when different extraction strategies produce conflicting results
 */

import { getPool } from './db-setup.js';

export interface DisagreementRecord {
  verificationId: string;
  field: string;
  mapper: string;
  strategyAValue: any;
  strategyBValue: any;
  strategyAConfidence: number;
  strategyBConfidence: number;
  disagreementScore: number;  // 0-1: How different
  resolutionStatus: 'pending' | 'resolved' | 'ignored';
}

/**
 * Calculate disagreement score between two values
 */
export function calculateDisagreementScore(
  valueA: any,
  valueB: any,
  confidenceA: number,
  confidenceB: number
): number {
  // If both values are null/undefined, no disagreement
  if ((valueA === null || valueA === undefined) &&
      (valueB === null || valueB === undefined)) {
    return 0;
  }

  // If one is null and other isn't, high disagreement
  if ((valueA === null || valueA === undefined) !==
      (valueB === null || valueB === undefined)) {
    return 0.8;
  }

  // Convert to strings for comparison
  const strA = String(valueA).toLowerCase().trim();
  const strB = String(valueB).toLowerCase().trim();

  // Exact match
  if (strA === strB) {
    return 0;
  }

  // Calculate string similarity (Levenshtein-like)
  const maxLen = Math.max(strA.length, strB.length);
  if (maxLen === 0) return 0;

  const distance = levenshteinDistance(strA, strB);
  const similarity = 1 - (distance / maxLen);

  // Base disagreement on similarity
  let disagreement = 1 - similarity;

  // If both confidences are high but values differ, increase disagreement
  if (confidenceA > 0.8 && confidenceB > 0.8) {
    disagreement = Math.min(disagreement * 1.2, 1);
  }

  // If confidences are very different, it might not be a true disagreement
  const confidenceDiff = Math.abs(confidenceA - confidenceB);
  if (confidenceDiff > 0.4) {
    disagreement *= 0.8;
  }

  return Math.min(disagreement, 1);
}

/**
 * Simple Levenshtein distance implementation
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  if (len1 === 0) return len2;
  if (len2 === 0) return len1;

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,     // deletion
        matrix[i][j - 1] + 1,     // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[len1][len2];
}

/**
 * Record a disagreement in the database
 */
export async function recordDisagreement(
  verificationId: string,
  field: string,
  mapper: string,
  valueA: any,
  valueB: any,
  confidenceA: number,
  confidenceB: number
): Promise<void> {
  const pool = getPool();

  const disagreementScore = calculateDisagreementScore(
    valueA,
    valueB,
    confidenceA,
    confidenceB
  );

  // Only record if disagreement is significant (> 0.3)
  if (disagreementScore < 0.3) {
    return;
  }

  try {
    await pool.query(
      `INSERT INTO extraction_disagreements (
        verification_id,
        field,
        mapper,
        strategy_a_value,
        strategy_b_value,
        strategy_a_confidence,
        strategy_b_confidence,
        disagreement_score
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (verification_id, field, mapper)
      DO UPDATE SET
        strategy_b_value = EXCLUDED.strategy_b_value,
        strategy_b_confidence = EXCLUDED.strategy_b_confidence,
        disagreement_score = EXCLUDED.disagreement_score,
        created_at = NOW()`,
      [
        verificationId,
        field,
        mapper,
        JSON.stringify(valueA),
        JSON.stringify(valueB),
        confidenceA,
        confidenceB,
        disagreementScore,
      ]
    );
  } catch (error) {
    console.error('Error recording disagreement:', error);
  }
}

/**
 * Get unresolved disagreements
 */
export async function getUnresolvedDisagreements(
  limit: number = 50,
  minScore: number = 0.5
): Promise<DisagreementRecord[]> {
  const pool = getPool();

  try {
    const result = await pool.query(
      `SELECT
        verification_id,
        field,
        mapper,
        strategy_a_value,
        strategy_b_value,
        strategy_a_confidence,
        strategy_b_confidence,
        disagreement_score,
        resolution_status
      FROM extraction_disagreements
      WHERE resolution_status = 'pending'
        AND disagreement_score >= $1
      ORDER BY disagreement_score DESC, created_at DESC
      LIMIT $2`,
      [minScore, limit]
    );

    return result.rows.map(row => ({
      verificationId: row.verification_id,
      field: row.field,
      mapper: row.mapper,
      strategyAValue: row.strategy_a_value,
      strategyBValue: row.strategy_b_value,
      strategyAConfidence: parseFloat(row.strategy_a_confidence),
      strategyBConfidence: parseFloat(row.strategy_b_confidence),
      disagreementScore: parseFloat(row.disagreement_score),
      resolutionStatus: row.resolution_status,
    }));
  } catch (error) {
    console.error('Error getting unresolved disagreements:', error);
    return [];
  }
}

/**
 * Resolve a disagreement
 */
export async function resolveDisagreement(
  verificationId: string,
  field: string,
  mapper: string,
  resolvedValue: any,
  resolvedBy: string
): Promise<void> {
  const pool = getPool();

  try {
    await pool.query(
      `UPDATE extraction_disagreements
      SET
        resolution_status = 'resolved',
        resolved_value = $1,
        resolved_by = $2,
        resolved_at = NOW()
      WHERE verification_id = $3
        AND field = $4
        AND mapper = $5`,
      [JSON.stringify(resolvedValue), resolvedBy, verificationId, field, mapper]
    );
  } catch (error) {
    console.error('Error resolving disagreement:', error);
  }
}

/**
 * Get disagreement statistics
 */
export async function getDisagreementStats(): Promise<{
  total: number;
  pending: number;
  resolved: number;
  avgDisagreementScore: number;
  topFields: Array<{ field: string; count: number }>;
}> {
  const pool = getPool();

  try {
    const statsResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE resolution_status = 'pending') as pending,
        COUNT(*) FILTER (WHERE resolution_status = 'resolved') as resolved,
        AVG(disagreement_score) as avg_score
      FROM extraction_disagreements
    `);

    const topFieldsResult = await pool.query(`
      SELECT field, COUNT(*) as count
      FROM extraction_disagreements
      WHERE resolution_status = 'pending'
      GROUP BY field
      ORDER BY count DESC
      LIMIT 10
    `);

    return {
      total: parseInt(statsResult.rows[0]?.total || '0', 10),
      pending: parseInt(statsResult.rows[0]?.pending || '0', 10),
      resolved: parseInt(statsResult.rows[0]?.resolved || '0', 10),
      avgDisagreementScore: parseFloat(statsResult.rows[0]?.avg_score || '0'),
      topFields: topFieldsResult.rows.map(row => ({
        field: row.field,
        count: parseInt(row.count, 10),
      })),
    };
  } catch (error) {
    console.error('Error getting disagreement stats:', error);
    return {
      total: 0,
      pending: 0,
      resolved: 0,
      avgDisagreementScore: 0,
      topFields: [],
    };
  }
}
