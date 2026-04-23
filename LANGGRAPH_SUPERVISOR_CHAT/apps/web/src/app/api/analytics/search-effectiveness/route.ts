/**
 * API Route: /api/analytics/search-effectiveness
 *
 * Returns search effectiveness data grouped by mapper or field
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '../../../../../../agents/src/shared/db-setup';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mapper = searchParams.get('mapper');
    const portalType = searchParams.get('portalType');
    const officeId = searchParams.get('officeId');
    const groupBy = searchParams.get('groupBy') || 'mapper';

    const pool = getPool();

    const groupByColumn = groupBy === 'field' ? 'field' : 'mapper';

    let query = `
      SELECT
        ${groupByColumn} as label,
        ${groupBy === 'field' ? 'field' : 'mapper'} as ${groupBy === 'field' ? 'field' : 'mapper'},
        COUNT(*) FILTER (WHERE search_effectiveness = 'effective') as effective,
        COUNT(*) FILTER (WHERE search_effectiveness = 'suboptimal') as suboptimal,
        COUNT(*) FILTER (WHERE search_effectiveness = 'ineffective') as ineffective,
        COUNT(*) FILTER (WHERE search_effectiveness IS NOT NULL) as total_searches,
        AVG(tool_calls_count) FILTER (WHERE search_effectiveness IS NOT NULL) as avg_tool_calls,
        array_agg(DISTINCT search_terms) FILTER (WHERE search_effectiveness = 'effective' AND search_terms IS NOT NULL) as best_search_terms
      FROM enhanced_annotations
      WHERE search_effectiveness IS NOT NULL
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
      GROUP BY ${groupByColumn}
      ORDER BY ${groupByColumn} ASC
    `;

    const result = await pool.query(query, values);

    const searches = result.rows.map(row => {
      const totalSearches = parseInt(row.total_searches, 10);
      const effective = parseInt(row.effective, 10);
      const suboptimal = parseInt(row.suboptimal, 10);
      const ineffective = parseInt(row.ineffective, 10);

      // Flatten best_search_terms array of arrays
      const bestSearchTerms = row.best_search_terms
        ? Array.from(new Set(row.best_search_terms.flat().filter((term: any) => term !== null)))
        : [];

      return {
        mapper: groupBy === 'mapper' ? row.label : row.mapper || '',
        field: groupBy === 'field' ? row.label : row.field || '',
        effective,
        suboptimal,
        ineffective,
        totalSearches,
        effectivenessRate: totalSearches > 0 ? (effective / totalSearches) * 100 : 0,
        avgToolCalls: parseFloat(row.avg_tool_calls) || 0,
        bestSearchTerms,
      };
    });

    return NextResponse.json({ searches });
  } catch (error: any) {
    console.error('Error fetching search effectiveness:', error);
    return NextResponse.json(
      { error: 'Failed to fetch search effectiveness', details: error.message },
      { status: 500 }
    );
  }
}
