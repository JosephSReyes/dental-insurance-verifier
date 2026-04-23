/**
 * API Route: /api/analytics/portal-quirks
 *
 * Returns portal quirk frequency data for heatmap
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '../../../../../../agents/src/shared/db-setup';

export async function GET(request: NextRequest) {
  try {
    const pool = getPool();

    // Get quirk frequency by portal
    const quirkQuery = `
      SELECT
        portal_type,
        unnest(portal_quirks) as quirk,
        COUNT(*) as frequency
      FROM enhanced_annotations
      WHERE portal_quirks IS NOT NULL
        AND array_length(portal_quirks, 1) > 0
      GROUP BY portal_type, quirk
      ORDER BY portal_type, frequency DESC
    `;

    const quirkResult = await pool.query(quirkQuery);

    // Get portal summary
    const summaryQuery = `
      SELECT
        portal_type,
        COUNT(*) as total_annotations,
        COUNT(*) FILTER (WHERE portal_quirks IS NOT NULL AND array_length(portal_quirks, 1) > 0) as annotations_with_quirks,
        array_agg(DISTINCT unnest(portal_quirks)) FILTER (WHERE portal_quirks IS NOT NULL) as all_quirks
      FROM enhanced_annotations
      GROUP BY portal_type
      ORDER BY total_annotations DESC
    `;

    const summaryResult = await pool.query(summaryQuery);

    const quirks = quirkResult.rows.map(row => ({
      portalType: row.portal_type,
      quirk: row.quirk,
      frequency: parseInt(row.frequency, 10),
    }));

    const portals = summaryResult.rows.map(row => ({
      portalType: row.portal_type,
      totalAnnotations: parseInt(row.total_annotations, 10),
      annotationsWithQuirks: parseInt(row.annotations_with_quirks, 10),
      allQuirks: row.all_quirks || [],
      quirkPercentage: parseInt(row.total_annotations, 10) > 0
        ? (parseInt(row.annotations_with_quirks, 10) / parseInt(row.total_annotations, 10)) * 100
        : 0,
    }));

    // Create heatmap data structure
    const heatmapData: Record<string, Record<string, number>> = {};
    quirks.forEach(({ portalType, quirk, frequency }) => {
      if (!heatmapData[portalType]) {
        heatmapData[portalType] = {};
      }
      heatmapData[portalType][quirk] = frequency;
    });

    return NextResponse.json({
      quirks,
      portals,
      heatmapData,
    });
  } catch (error: any) {
    console.error('Error fetching portal quirks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch portal quirks', details: error.message },
      { status: 500 }
    );
  }
}
