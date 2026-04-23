/**
 * API Route: /api/active-learning/priority-queue
 *
 * Returns verifications prioritized by uncertainty score for annotation
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTopPriorityVerifications } from '../../../../../../agents/src/shared/active-learning-scorer';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const minScore = parseFloat(searchParams.get('minScore') || '40');

    const priorityQueue = await getTopPriorityVerifications(limit, minScore);

    return NextResponse.json({
      queue: priorityQueue,
      stats: {
        total: priorityQueue.length,
        critical: priorityQueue.filter(item => item.priority === 'critical').length,
        high: priorityQueue.filter(item => item.priority === 'high').length,
        medium: priorityQueue.filter(item => item.priority === 'medium').length,
        low: priorityQueue.filter(item => item.priority === 'low').length,
      },
    });
  } catch (error: any) {
    console.error('Error fetching priority queue:', error);
    return NextResponse.json(
      { error: 'Failed to fetch priority queue', details: error.message },
      { status: 500 }
    );
  }
}
