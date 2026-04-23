/**
 * API Route: /api/label-studio/stats
 *
 * Returns annotation statistics from the enhanced_annotations table
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '../../../../../../agents/src/shared/db-setup';

/**
 * GET /api/label-studio/stats
 * Get annotation statistics
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mapper = searchParams.get('mapper');
    const portalType = searchParams.get('portalType');
    const officeId = searchParams.get('officeId');

    const pool = getPool();

    // Build query
    let query = `
      SELECT
        COUNT(*) as total_annotations,
        COUNT(*) FILTER (WHERE path_quality = 'correct') as correct_paths,
        COUNT(*) FILTER (WHERE path_quality = 'incorrect') as incorrect_paths,
        COUNT(*) FILTER (WHERE path_quality = 'partial') as partial_paths,
        COUNT(*) FILTER (WHERE path_quality = 'ambiguous') as ambiguous_paths,
        COUNT(*) FILTER (WHERE search_effectiveness = 'effective') as effective_searches,
        COUNT(*) FILTER (WHERE search_effectiveness = 'suboptimal') as suboptimal_searches,
        COUNT(*) FILTER (WHERE search_effectiveness = 'ineffective') as ineffective_searches,
        COUNT(*) FILTER (WHERE is_edge_case = TRUE) as edge_cases,
        AVG(confidence_gap) as avg_confidence_gap,
        AVG(tool_calls_count) as avg_tool_calls,
        AVG(extraction_time_ms) as avg_extraction_time_ms
      FROM enhanced_annotations
      WHERE 1=1
    `;

    const values: any[] = [];
    let paramCount = 0;

    if (mapper) {
      paramCount++;
      query += ` AND mapper = $${paramCount}`;
      values.push(mapper);
    }

    if (portalType) {
      paramCount++;
      query += ` AND portal_type = $${paramCount}`;
      values.push(portalType);
    }

    if (officeId) {
      paramCount++;
      query += ` AND office_id = $${paramCount}`;
      values.push(officeId);
    }

    const result = await pool.query(query, values);
    const row = result.rows[0];

    const totalAnnotations = parseInt(row.total_annotations, 10);
    const correctPaths = parseInt(row.correct_paths, 10);
    const incorrectPaths = parseInt(row.incorrect_paths, 10);

    const pathAccuracy = totalAnnotations > 0
      ? (correctPaths / totalAnnotations) * 100
      : 0;

    const stats = {
      totalAnnotations,
      correctPaths,
      incorrectPaths,
      partialPaths: parseInt(row.partial_paths, 10),
      ambiguousPaths: parseInt(row.ambiguous_paths, 10),
      pathAccuracy,
      effectiveSearches: parseInt(row.effective_searches, 10),
      suboptimalSearches: parseInt(row.suboptimal_searches, 10),
      ineffectiveSearches: parseInt(row.ineffective_searches, 10),
      edgeCases: parseInt(row.edge_cases, 10),
      avgConfidenceGap: parseFloat(row.avg_confidence_gap) || 0,
      avgToolCalls: parseFloat(row.avg_tool_calls) || 0,
      avgExtractionTimeMs: parseFloat(row.avg_extraction_time_ms) || 0,
    };

    return NextResponse.json({ stats });
  } catch (error: any) {
    console.error('Error fetching stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch statistics', details: error.message },
      { status: 500 }
    );
  }
}
