/**
 * Active Learning Auto-Sync Service
 *
 * Automatically syncs high-priority verifications to Label Studio
 */

import { getTopPriorityVerifications, UncertaintyScore } from './active-learning-scorer.js';
import { getPool } from './db-setup.js';

export interface AutoSyncConfig {
  enabled: boolean;
  minScore: number;           // Minimum uncertainty score to sync
  maxPerRun: number;          // Maximum verifications to sync per run
  priorityThreshold: 'critical' | 'high' | 'medium' | 'low';
  syncInterval: number;       // Interval in minutes
}

export interface AutoSyncResult {
  synced: number;
  skipped: number;
  errors: number;
  syncedIds: string[];
  errorDetails: Array<{ verificationId: string; error: string }>;
}

const DEFAULT_CONFIG: AutoSyncConfig = {
  enabled: true,
  minScore: 60,               // Only sync high uncertainty
  maxPerRun: 10,              // Don't overwhelm annotators
  priorityThreshold: 'high',  // Sync high and critical only
  syncInterval: 30,           // Every 30 minutes
};

/**
 * Check if verification is already synced to Label Studio
 */
async function isAlreadySynced(verificationId: string): Promise<boolean> {
  const pool = getPool();

  try {
    const result = await pool.query(
      `SELECT COUNT(*) as count
       FROM label_studio_tasks
       WHERE verification_id = $1`,
      [verificationId]
    );

    return parseInt(result.rows[0]?.count || '0', 10) > 0;
  } catch (error) {
    console.error('Error checking sync status:', error);
    return false;
  }
}

/**
 * Mark verification as synced
 */
async function markAsSynced(verificationId: string, taskId: number): Promise<void> {
  const pool = getPool();

  try {
    await pool.query(
      `INSERT INTO label_studio_tasks (verification_id, task_id, synced_at, sync_reason)
       VALUES ($1, $2, NOW(), 'active_learning')
       ON CONFLICT (verification_id) DO NOTHING`,
      [verificationId, taskId]
    );
  } catch (error) {
    console.error('Error marking as synced:', error);
  }
}

/**
 * Sync a single verification to Label Studio
 */
async function syncToLabelStudio(
  verificationId: string,
  score: UncertaintyScore
): Promise<{ success: boolean; taskId?: number; error?: string }> {
  try {
    // Call the Label Studio sync API endpoint
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/label-studio/sync`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          verificationId,
          priority: score.priority,
          uncertaintyScore: score.totalScore,
          reasoning: score.reasoning,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      return { success: false, error: errorData.error || 'Sync failed' };
    }

    const data = await response.json();
    return { success: true, taskId: data.taskId };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Run auto-sync based on configuration
 */
export async function runAutoSync(
  config: Partial<AutoSyncConfig> = {}
): Promise<AutoSyncResult> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  if (!finalConfig.enabled) {
    return {
      synced: 0,
      skipped: 0,
      errors: 0,
      syncedIds: [],
      errorDetails: [],
    };
  }

  const result: AutoSyncResult = {
    synced: 0,
    skipped: 0,
    errors: 0,
    syncedIds: [],
    errorDetails: [],
  };

  try {
    // Get top priority verifications
    const priorityQueue = await getTopPriorityVerifications(
      finalConfig.maxPerRun * 2, // Get more to account for skips
      finalConfig.minScore
    );

    // Filter by priority threshold
    const priorityLevels = ['critical', 'high', 'medium', 'low'];
    const thresholdIndex = priorityLevels.indexOf(finalConfig.priorityThreshold);
    const filteredQueue = priorityQueue.filter(item => {
      const itemIndex = priorityLevels.indexOf(item.priority);
      return itemIndex <= thresholdIndex;
    });

    // Sync up to maxPerRun verifications
    for (const item of filteredQueue.slice(0, finalConfig.maxPerRun)) {
      // Check if already synced
      const alreadySynced = await isAlreadySynced(item.verificationId);
      if (alreadySynced) {
        result.skipped++;
        continue;
      }

      // Sync to Label Studio
      const syncResult = await syncToLabelStudio(item.verificationId, item);

      if (syncResult.success && syncResult.taskId) {
        await markAsSynced(item.verificationId, syncResult.taskId);
        result.synced++;
        result.syncedIds.push(item.verificationId);
      } else {
        result.errors++;
        result.errorDetails.push({
          verificationId: item.verificationId,
          error: syncResult.error || 'Unknown error',
        });
      }
    }

    // Log results
    console.log('Auto-sync completed:', {
      synced: result.synced,
      skipped: result.skipped,
      errors: result.errors,
    });

    return result;
  } catch (error: any) {
    console.error('Auto-sync failed:', error);
    throw error;
  }
}

/**
 * Get auto-sync statistics
 */
export async function getAutoSyncStats(): Promise<{
  totalSynced: number;
  lastSyncTime: Date | null;
  avgUncertaintyScore: number;
  syncsByPriority: Record<string, number>;
}> {
  const pool = getPool();

  try {
    const statsQuery = await pool.query(`
      SELECT
        COUNT(*) as total_synced,
        MAX(synced_at) as last_sync_time,
        AVG(uncertainty_score) as avg_uncertainty_score
      FROM label_studio_tasks
      WHERE sync_reason = 'active_learning'
    `);

    const priorityQuery = await pool.query(`
      SELECT priority, COUNT(*) as count
      FROM label_studio_tasks
      WHERE sync_reason = 'active_learning'
      GROUP BY priority
    `);

    const syncsByPriority: Record<string, number> = {};
    priorityQuery.rows.forEach(row => {
      syncsByPriority[row.priority] = parseInt(row.count, 10);
    });

    return {
      totalSynced: parseInt(statsQuery.rows[0]?.total_synced || '0', 10),
      lastSyncTime: statsQuery.rows[0]?.last_sync_time || null,
      avgUncertaintyScore: parseFloat(statsQuery.rows[0]?.avg_uncertainty_score || '0'),
      syncsByPriority,
    };
  } catch (error) {
    console.error('Error getting auto-sync stats:', error);
    return {
      totalSynced: 0,
      lastSyncTime: null,
      avgUncertaintyScore: 0,
      syncsByPriority: {},
    };
  }
}
