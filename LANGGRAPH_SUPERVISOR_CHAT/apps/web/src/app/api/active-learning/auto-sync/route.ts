/**
 * API Route: /api/active-learning/auto-sync
 *
 * Trigger or configure active learning auto-sync
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  runAutoSync,
  getAutoSyncStats,
  AutoSyncConfig,
} from '../../../../../../agents/src/shared/active-learning-auto-sync';

/**
 * POST - Trigger auto-sync manually
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const config: Partial<AutoSyncConfig> = {
      enabled: body.enabled !== undefined ? body.enabled : true,
      minScore: body.minScore || 60,
      maxPerRun: body.maxPerRun || 10,
      priorityThreshold: body.priorityThreshold || 'high',
    };

    const result = await runAutoSync(config);

    return NextResponse.json({
      success: true,
      result,
      message: `Synced ${result.synced} verifications, skipped ${result.skipped}, errors: ${result.errors}`,
    });
  } catch (error: any) {
    console.error('Error running auto-sync:', error);
    return NextResponse.json(
      { error: 'Failed to run auto-sync', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET - Get auto-sync statistics
 */
export async function GET(request: NextRequest) {
  try {
    const stats = await getAutoSyncStats();

    return NextResponse.json({
      stats,
    });
  } catch (error: any) {
    console.error('Error fetching auto-sync stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch auto-sync stats', details: error.message },
      { status: 500 }
    );
  }
}
