/**
 * API Route: /api/analytics/trends
 *
 * Returns time-series data for annotation trends
 * Used for path accuracy over time charts
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '../../../../../../agents/src/shared/db-setup';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mapper = searchParams.get('mapper');
    const portalType = searchParams.get('portalType');
    const officeId = searchParams.get('officeId');
    const days = parseInt(searchParams.get('days') || '30', 10);

    const pool = getPool();

    let query = `
      SELECT
        DATE(created_at) as date,
        COUNT(*) as total_annotations,
        COUNT(*) FILTER (WHERE path_quality = 'correct') as correct_paths,
        COUNT(*) FILTER (WHERE path_quality = 'incorrect') as incorrect_paths,
        COUNT(*) FILTER (WHERE value_quality = 'exact') as exact_values,
        COUNT(*) FILTER (WHERE search_effectiveness = 'effective') as effective_searches,
        AVG(confidence_gap) as avg_confidence_gap,
        AVG(extraction_time_ms) as avg_extraction_time,
        AVG(tool_calls_count) as avg_tool_calls
      FROM enhanced_annotations
      WHERE created_at >= NOW() - INTERVAL '${days} days'
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

    query += `
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at) ASC
    `;

    const result = await pool.query(query, values);

    const trends = result.rows.map(row => ({
      date: row.date,
      totalAnnotations: parseInt(row.total_annotations, 10),
      correctPaths: parseInt(row.correct_paths, 10),
      incorrectPaths: parseInt(row.incorrect_paths, 10),
      exactValues: parseInt(row.exact_values, 10),
      effectiveSearches: parseInt(row.effective_searches, 10),
      pathAccuracy: parseInt(row.total_annotations, 10) > 0
        ? (parseInt(row.correct_paths, 10) / parseInt(row.total_annotations, 10)) * 100
        : 0,
      avgConfidenceGap: parseFloat(row.avg_confidence_gap) || 0,
      avgExtractionTime: parseFloat(row.avg_extraction_time) || 0,
      avgToolCalls: parseFloat(row.avg_tool_calls) || 0,
    }));

    return NextResponse.json({ trends });
  } catch (error: any) {
    console.error('Error fetching trends:', error);
    return NextResponse.json(
      { error: 'Failed to fetch trends', details: error.message },
      { status: 500 }
    );
  }
}
