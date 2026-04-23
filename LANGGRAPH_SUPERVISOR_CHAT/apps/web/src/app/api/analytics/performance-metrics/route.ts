/**
 * API Route: /api/analytics/performance-metrics
 *
 * Returns performance metrics over time (extraction time, tool calls, cost)
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
        AVG(extraction_time_ms) as avg_extraction_time,
        AVG(tool_calls_count) as avg_tool_calls,
        AVG(total_cost) as avg_cost,
        COUNT(*) as total_annotations,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY extraction_time_ms) as p50_extraction_time,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY extraction_time_ms) as p95_extraction_time
      FROM enhanced_annotations
      WHERE created_at >= NOW() - INTERVAL '${days} days'
        AND extraction_time_ms IS NOT NULL
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

    const metrics = result.rows.map(row => ({
      date: row.date,
      avgExtractionTime: parseFloat(row.avg_extraction_time) || 0,
      avgToolCalls: parseFloat(row.avg_tool_calls) || 0,
      avgCost: parseFloat(row.avg_cost) || 0,
      totalAnnotations: parseInt(row.total_annotations, 10),
      p50ExtractionTime: parseFloat(row.p50_extraction_time) || 0,
      p95ExtractionTime: parseFloat(row.p95_extraction_time) || 0,
    }));

    return NextResponse.json({ metrics });
  } catch (error: any) {
    console.error('Error fetching performance metrics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch performance metrics', details: error.message },
      { status: 500 }
    );
  }
}
