/**
 * API Route: /api/analytics/export/[reportType]
 *
 * Exports analytics data in CSV or JSON format
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '../../../../../../../agents/src/shared/db-setup';

function convertToCSV(data: any[]): string {
  if (data.length === 0) return '';

  const headers = Object.keys(data[0]);
  const rows = data.map(row =>
    headers.map(header => {
      const value = row[header];
      // Handle null/undefined
      if (value === null || value === undefined) return '';
      // Handle arrays/objects
      if (typeof value === 'object') return JSON.stringify(value);
      // Handle strings with commas or quotes
      if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    }).join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}

export async function GET(
  request: NextRequest,
  { params }: { params: { reportType: string } }
) {
  try {
    const { reportType } = params;
    const { searchParams } = new URL(request.url);
    const mapper = searchParams.get('mapper');
    const portalType = searchParams.get('portalType');
    const officeId = searchParams.get('officeId');
    const format = searchParams.get('format') || 'json';

    const pool = getPool();
    let data: any[] = [];

    // Build query based on report type
    let query = '';
    const values: any[] = [];
    let paramCount = 0;

    switch (reportType) {
      case 'annotations':
        query = `
          SELECT
            id, verification_id, mapper, field, path_quality, value_quality,
            ai_extracted_path, correct_path, ai_extracted_value, correct_value,
            search_effectiveness, search_terms, portal_type, office_id,
            ai_confidence, human_confidence, confidence_gap,
            extraction_time_ms, tool_calls_count, total_cost,
            is_edge_case, edge_case_type, portal_quirks,
            created_at
          FROM enhanced_annotations
          WHERE 1=1
        `;
        break;

      case 'mapper-comparison':
        query = `
          SELECT
            mapper,
            COUNT(*) as total_annotations,
            COUNT(*) FILTER (WHERE path_quality = 'correct') as correct_paths,
            COUNT(*) FILTER (WHERE path_quality = 'incorrect') as incorrect_paths,
            COUNT(*) FILTER (WHERE search_effectiveness = 'effective') as effective_searches,
            AVG(confidence_gap) as avg_confidence_gap,
            AVG(extraction_time_ms) as avg_extraction_time,
            AVG(tool_calls_count) as avg_tool_calls,
            AVG(total_cost) as avg_cost
          FROM enhanced_annotations
          WHERE 1=1
        `;
        break;

      case 'portal-quirks':
        query = `
          SELECT
            portal_type,
            unnest(portal_quirks) as quirk,
            COUNT(*) as frequency,
            array_agg(DISTINCT field) as affected_fields
          FROM enhanced_annotations
          WHERE portal_quirks IS NOT NULL AND array_length(portal_quirks, 1) > 0
        `;
        break;

      case 'trends':
        query = `
          SELECT
            DATE(created_at) as date,
            COUNT(*) as total_annotations,
            COUNT(*) FILTER (WHERE path_quality = 'correct') as correct_paths,
            AVG(confidence_gap) as avg_confidence_gap,
            AVG(extraction_time_ms) as avg_extraction_time
          FROM enhanced_annotations
          WHERE created_at >= NOW() - INTERVAL '30 days'
        `;
        break;

      case 'search-effectiveness':
        query = `
          SELECT
            mapper,
            field,
            COUNT(*) FILTER (WHERE search_effectiveness = 'effective') as effective,
            COUNT(*) FILTER (WHERE search_effectiveness = 'suboptimal') as suboptimal,
            COUNT(*) FILTER (WHERE search_effectiveness = 'ineffective') as ineffective,
            AVG(tool_calls_count) as avg_tool_calls,
            array_agg(DISTINCT search_terms) FILTER (WHERE search_effectiveness = 'effective') as best_search_terms
          FROM enhanced_annotations
          WHERE search_effectiveness IS NOT NULL
        `;
        break;

      case 'performance':
        query = `
          SELECT
            DATE(created_at) as date,
            mapper,
            AVG(extraction_time_ms) as avg_extraction_time,
            AVG(tool_calls_count) as avg_tool_calls,
            AVG(total_cost) as avg_cost,
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY extraction_time_ms) as p95_extraction_time
          FROM enhanced_annotations
          WHERE created_at >= NOW() - INTERVAL '30 days'
            AND extraction_time_ms IS NOT NULL
        `;
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid report type' },
          { status: 400 }
        );
    }

    // Add filters
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

    // Add GROUP BY for aggregated reports
    if (['mapper-comparison', 'portal-quirks', 'search-effectiveness', 'performance'].includes(reportType)) {
      if (reportType === 'mapper-comparison') {
        query += ' GROUP BY mapper ORDER BY mapper';
      } else if (reportType === 'portal-quirks') {
        query += ' GROUP BY portal_type, quirk ORDER BY portal_type, frequency DESC';
      } else if (reportType === 'search-effectiveness') {
        query += ' GROUP BY mapper, field ORDER BY mapper, field';
      } else if (reportType === 'performance') {
        query += ' GROUP BY DATE(created_at), mapper ORDER BY DATE(created_at), mapper';
      }
    } else if (reportType === 'trends') {
      query += ' GROUP BY DATE(created_at) ORDER BY DATE(created_at)';
    } else {
      query += ' ORDER BY created_at DESC LIMIT 10000';
    }

    const result = await pool.query(query, values);
    data = result.rows;

    // Return data in requested format
    if (format === 'csv') {
      const csv = convertToCSV(data);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${reportType}-report.csv"`,
        },
      });
    } else {
      const json = JSON.stringify(data, null, 2);
      return new NextResponse(json, {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${reportType}-report.json"`,
        },
      });
    }
  } catch (error: any) {
    console.error('Error exporting report:', error);
    return NextResponse.json(
      { error: 'Failed to export report', details: error.message },
      { status: 500 }
    );
  }
}
