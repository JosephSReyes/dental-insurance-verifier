/**
 * API Route: /api/active-learning/disagreements
 *
 * Get and resolve extraction disagreements
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getUnresolvedDisagreements,
  resolveDisagreement,
  getDisagreementStats,
} from '../../../../../../agents/src/shared/disagreement-detector';

/**
 * GET - Get unresolved disagreements
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const minScore = parseFloat(searchParams.get('minScore') || '0.5');
    const getStats = searchParams.get('stats') === 'true';

    if (getStats) {
      const stats = await getDisagreementStats();
      return NextResponse.json({ stats });
    }

    const disagreements = await getUnresolvedDisagreements(limit, minScore);

    return NextResponse.json({
      disagreements,
      count: disagreements.length,
    });
  } catch (error: any) {
    console.error('Error fetching disagreements:', error);
    return NextResponse.json(
      { error: 'Failed to fetch disagreements', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST - Resolve a disagreement
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { verificationId, field, mapper, resolvedValue, resolvedBy } = body;

    if (!verificationId || !field || !mapper || !resolvedValue || !resolvedBy) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    await resolveDisagreement(
      verificationId,
      field,
      mapper,
      resolvedValue,
      resolvedBy
    );

    return NextResponse.json({
      success: true,
      message: 'Disagreement resolved',
    });
  } catch (error: any) {
    console.error('Error resolving disagreement:', error);
    return NextResponse.json(
      { error: 'Failed to resolve disagreement', details: error.message },
      { status: 500 }
    );
  }
}
