/**
 * API Route: /api/analytics/mapper-comparison
 *
 * Returns comparative data across all mappers
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '../../../../../../agents/src/shared/db-setup';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const portalType = searchParams.get('portalType');
    const officeId = searchParams.get('officeId');

    const pool = getPool();

    let query = `
      SELECT
        mapper,
        COUNT(*) as total_annotations,
        COUNT(*) FILTER (WHERE path_quality = 'correct') as correct_paths,
        COUNT(*) FILTER (WHERE path_quality = 'incorrect') as incorrect_paths,
        COUNT(*) FILTER (WHERE value_quality = 'exact') as exact_values,
        COUNT(*) FILTER (WHERE search_effectiveness = 'effective') as effective_searches,
        COUNT(*) FILTER (WHERE search_effectiveness = 'ineffective') as ineffective_searches,
        COUNT(*) FILTER (WHERE is_edge_case = TRUE) as edge_cases,
        AVG(confidence_gap) as avg_confidence_gap,
        AVG(extraction_time_ms) as avg_extraction_time,
        AVG(tool_calls_count) as avg_tool_calls,
        AVG(human_confidence) as avg_human_confidence
      FROM enhanced_annotations
      WHERE 1=1
    `;

    const values: any[] = [];
    let paramCount = 0;

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

    query += `
      GROUP BY mapper
      ORDER BY mapper ASC
    `;

    const result = await pool.query(query, values);

    const mappers = result.rows.map(row => {
      const totalAnnotations = parseInt(row.total_annotations, 10);
      const correctPaths = parseInt(row.correct_paths, 10);

      return {
        mapper: row.mapper,
        totalAnnotations,
        correctPaths,
        incorrectPaths: parseInt(row.incorrect_paths, 10),
        exactValues: parseInt(row.exact_values, 10),
        effectiveSearches: parseInt(row.effective_searches, 10),
        ineffectiveSearches: parseInt(row.ineffective_searches, 10),
        edgeCases: parseInt(row.edge_cases, 10),
        pathAccuracy: totalAnnotations > 0 ? (correctPaths / totalAnnotations) * 100 : 0,
        avgConfidenceGap: parseFloat(row.avg_confidence_gap) || 0,
        avgExtractionTime: parseFloat(row.avg_extraction_time) || 0,
        avgToolCalls: parseFloat(row.avg_tool_calls) || 0,
        avgHumanConfidence: parseFloat(row.avg_human_confidence) || 0,
      };
    });

    return NextResponse.json({ mappers });
  } catch (error: any) {
    console.error('Error fetching mapper comparison:', error);
    return NextResponse.json(
      { error: 'Failed to fetch mapper comparison', details: error.message },
      { status: 500 }
    );
  }
}
