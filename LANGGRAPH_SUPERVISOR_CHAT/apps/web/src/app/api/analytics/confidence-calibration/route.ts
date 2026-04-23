/**
 * API Route: /api/analytics/confidence-calibration
 *
 * Returns confidence calibration data for scatter plot
 * Compares AI confidence vs actual accuracy
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '../../../../../../agents/src/shared/db-setup';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mapper = searchParams.get('mapper');

    const pool = getPool();

    let query = `
      SELECT
        ai_confidence,
        human_confidence,
        path_quality,
        value_quality,
        mapper,
        field
      FROM enhanced_annotations
      WHERE ai_confidence IS NOT NULL
        AND human_confidence IS NOT NULL
    `;

    const values: any[] = [];
    let paramCount = 0;

    if (mapper) {
      paramCount++;
      query += ` AND mapper = $${paramCount}`;
      values.push(mapper);
    }

    query += ` ORDER BY ai_confidence ASC`;

    const result = await pool.query(query, values);

    const dataPoints = result.rows.map(row => ({
      aiConfidence: parseFloat(row.ai_confidence),
      humanConfidence: parseInt(row.human_confidence, 10),
      normalizedHumanConfidence: parseInt(row.human_confidence, 10) / 5, // Convert 1-5 to 0-1 scale
      pathQuality: row.path_quality,
      valueQuality: row.value_quality,
      mapper: row.mapper,
      field: row.field,
      isCorrect: row.path_quality === 'correct' && row.value_quality === 'exact',
    }));

    // Calculate calibration buckets
    const buckets = [0.0, 0.2, 0.4, 0.6, 0.8, 1.0];
    const calibrationBuckets = buckets.slice(0, -1).map((bucketStart, index) => {
      const bucketEnd = buckets[index + 1];
      const pointsInBucket = dataPoints.filter(
        p => p.aiConfidence >= bucketStart && p.aiConfidence < bucketEnd
      );

      const correctInBucket = pointsInBucket.filter(p => p.isCorrect).length;
      const totalInBucket = pointsInBucket.length;
      const actualAccuracy = totalInBucket > 0 ? correctInBucket / totalInBucket : 0;

      return {
        confidenceRange: `${(bucketStart * 100).toFixed(0)}-${(bucketEnd * 100).toFixed(0)}%`,
        averageConfidence: (bucketStart + bucketEnd) / 2,
        actualAccuracy: actualAccuracy * 100,
        count: totalInBucket,
        calibrationGap: Math.abs(((bucketStart + bucketEnd) / 2) - actualAccuracy) * 100,
      };
    });

    // Calculate overall calibration score
    const avgCalibrationGap = calibrationBuckets.reduce((sum, b) => sum + b.calibrationGap, 0) / calibrationBuckets.length;

    return NextResponse.json({
      dataPoints,
      calibrationBuckets,
      avgCalibrationGap,
      totalDataPoints: dataPoints.length,
    });
  } catch (error: any) {
    console.error('Error fetching confidence calibration:', error);
    return NextResponse.json(
      { error: 'Failed to fetch confidence calibration', details: error.message },
      { status: 500 }
    );
  }
}
