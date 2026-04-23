import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/../../agents/src/shared/db-setup';

export async function GET(request: NextRequest) {
  try {
    const pool = getPool();

    // Get total corrections
    const totalResult = await pool.query('SELECT COUNT(*) as count FROM feedback_corrections');
    const total_corrections = parseInt(totalResult.rows[0].count);

    // Get corrections by mapper
    const mapperResult = await pool.query(`
      SELECT mapper, COUNT(*) as count
      FROM feedback_corrections
      GROUP BY mapper
      ORDER BY count DESC
    `);
    const by_mapper: Record<string, number> = {};
    mapperResult.rows.forEach(row => {
      by_mapper[row.mapper] = parseInt(row.count);
    });

    // Get corrections by provider
    const providerResult = await pool.query(`
      SELECT provider, COUNT(*) as count
      FROM feedback_corrections
      GROUP BY provider
      ORDER BY count DESC
    `);
    const by_provider: Record<string, number> = {};
    providerResult.rows.forEach(row => {
      by_provider[row.provider] = parseInt(row.count);
    });

    // Get corrections by field
    const fieldResult = await pool.query(`
      SELECT field, COUNT(*) as count
      FROM feedback_corrections
      GROUP BY field
      ORDER BY count DESC
      LIMIT 50
    `);
    const by_field: Record<string, number> = {};
    fieldResult.rows.forEach(row => {
      by_field[row.field] = parseInt(row.count);
    });

    // Get corrections by portal version
    const portalResult = await pool.query(`
      SELECT portal_type, COUNT(*) as count
      FROM feedback_corrections
      WHERE portal_type IS NOT NULL
      GROUP BY portal_type
      ORDER BY count DESC
    `);
    const by_portal_version: Record<string, number> = {};
    portalResult.rows.forEach(row => {
      by_portal_version[row.portal_type] = parseInt(row.count);
    });

    // Get most corrected fields with details
    const mostCorrectedResult = await pool.query(`
      SELECT
        field,
        mapper,
        provider,
        COUNT(*) as count
      FROM feedback_corrections
      GROUP BY field, mapper, provider
      ORDER BY count DESC
      LIMIT 20
    `);
    const most_corrected_fields = mostCorrectedResult.rows.map(row => ({
      field: row.field,
      mapper: row.mapper,
      provider: row.provider,
      count: parseInt(row.count)
    }));

    const stats = {
      total_corrections,
      by_mapper,
      by_provider,
      by_field,
      by_portal_version,
      most_corrected_fields
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error fetching feedback stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch feedback stats' },
      { status: 500 }
    );
  }
}
