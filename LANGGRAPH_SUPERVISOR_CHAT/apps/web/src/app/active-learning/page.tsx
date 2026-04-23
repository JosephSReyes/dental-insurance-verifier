'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Brain,
  PlayCircle,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Clock,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';

interface UncertaintyScore {
  verificationId: string;
  totalScore: number;
  factors: {
    lowConfidence: number;
    inconsistentExtraction: number;
    edgeCaseIndicators: number;
    portalQuirks: number;
    fieldCriticality: number;
    learningValue: number;
  };
  reasoning: string[];
  priority: 'critical' | 'high' | 'medium' | 'low';
  recommendAnnotation: boolean;
}

interface PriorityQueueStats {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

interface AutoSyncStats {
  totalSynced: number;
  lastSyncTime: string | null;
  avgUncertaintyScore: number;
  syncsByPriority: Record<string, number>;
}

interface DisagreementStats {
  total: number;
  pending: number;
  resolved: number;
  avgDisagreementScore: number;
  topFields: Array<{ field: string; count: number }>;
}

export default function ActiveLearningPage() {
  const [priorityQueue, setPriorityQueue] = useState<UncertaintyScore[]>([]);
  const [queueStats, setQueueStats] = useState<PriorityQueueStats | null>(null);
  const [autoSyncStats, setAutoSyncStats] = useState<AutoSyncStats | null>(null);
  const [disagreementStats, setDisagreementStats] = useState<DisagreementStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadPriorityQueue(),
        loadAutoSyncStats(),
        loadDisagreementStats(),
      ]);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPriorityQueue = async () => {
    try {
      const response = await fetch('/api/active-learning/priority-queue?limit=20');
      const data = await response.json();
      setPriorityQueue(data.queue || []);
      setQueueStats(data.stats || null);
    } catch (error) {
      console.error('Error loading priority queue:', error);
    }
  };

  const loadAutoSyncStats = async () => {
    try {
      const response = await fetch('/api/active-learning/auto-sync');
      const data = await response.json();
      setAutoSyncStats(data.stats || null);
    } catch (error) {
      console.error('Error loading auto-sync stats:', error);
    }
  };

  const loadDisagreementStats = async () => {
    try {
      const response = await fetch('/api/active-learning/disagreements?stats=true');
      const data = await response.json();
      setDisagreementStats(data.stats || null);
    } catch (error) {
      console.error('Error loading disagreement stats:', error);
    }
  };

  const runAutoSync = async () => {
    setSyncing(true);
    try {
      const response = await fetch('/api/active-learning/auto-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          enabled: true,
          minScore: 60,
          maxPerRun: 10,
          priorityThreshold: 'high',
        }),
      });

      const data = await response.json();

      if (data.success) {
        alert(data.message);
        await loadData(); // Reload all data
      } else {
        alert('Auto-sync failed: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error running auto-sync:', error);
      alert('Failed to run auto-sync');
    } finally {
      setSyncing(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'destructive';
      case 'high':
        return 'default';
      case 'medium':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'critical':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'high':
        return <TrendingUp className="h-4 w-4 text-orange-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2 text-slate-900 dark:text-slate-100">
              <Brain className="h-8 w-8" />
              Active Learning Dashboard
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              Intelligent annotation prioritization and auto-sync
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/analytics"
              className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
            >
              Go to Analytics →
            </Link>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Priority Queue Stats */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Priority Queue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{queueStats?.total || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {queueStats?.critical || 0} critical, {queueStats?.high || 0} high
              </p>
            </CardContent>
          </Card>

          {/* Auto-Sync Stats */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Auto-Synced</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{autoSyncStats?.totalSynced || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Avg score: {autoSyncStats?.avgUncertaintyScore.toFixed(1) || '0.0'}
              </p>
            </CardContent>
          </Card>

          {/* Disagreements */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Disagreements</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{disagreementStats?.pending || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {disagreementStats?.resolved || 0} resolved
              </p>
            </CardContent>
          </Card>

          {/* Last Sync */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Last Sync</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm font-medium">
                {autoSyncStats?.lastSyncTime
                  ? new Date(autoSyncStats.lastSyncTime).toLocaleString()
                  : 'Never'}
              </div>
              <Button
                size="sm"
                onClick={runAutoSync}
                disabled={syncing}
                className="mt-2 w-full"
              >
                {syncing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <PlayCircle className="h-4 w-4 mr-1" />
                )}
                Run Now
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Priority Queue */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Priority Queue</CardTitle>
                <CardDescription>
                  Top verifications ranked by uncertainty score
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={loadData}>
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {priorityQueue.length === 0 ? (
              <Alert>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription>
                  No high-priority verifications found. The system is performing well!
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-3">
                {priorityQueue.map((item, index) => (
                  <div
                    key={item.verificationId}
                    className="flex items-start justify-between p-4 border rounded-lg hover:bg-secondary/50 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {getPriorityIcon(item.priority)}
                        <span className="font-mono text-sm text-muted-foreground">
                          {item.verificationId}
                        </span>
                        <Badge variant={getPriorityColor(item.priority)}>
                          {item.priority}
                        </Badge>
                        <Badge variant="outline">{item.totalScore.toFixed(0)} score</Badge>
                      </div>
                      <div className="space-y-1">
                        {item.reasoning.map((reason, idx) => (
                          <p key={idx} className="text-sm text-muted-foreground">
                            • {reason}
                          </p>
                        ))}
                      </div>
                    </div>
                    <Link href={`/annotate/${item.verificationId}`}>
                      <Button size="sm">Annotate</Button>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Disagreements */}
        {disagreementStats && disagreementStats.pending > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Extraction Disagreements</CardTitle>
              <CardDescription>
                Cases where different strategies produced conflicting results
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {disagreementStats.topFields.slice(0, 5).map((field, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 border rounded"
                  >
                    <span className="font-medium">{field.field}</span>
                    <Badge variant="destructive">{field.count} disagreements</Badge>
                  </div>
                ))}
              </div>
              <Link href="/disagreements">
                <Button className="w-full mt-4" variant="outline">
                  View All Disagreements
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Auto-Sync Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Auto-Sync Configuration</CardTitle>
            <CardDescription>
              Automatically sync high-priority verifications to Label Studio
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Minimum Score</label>
                <p className="text-sm text-muted-foreground">
                  Only sync verifications with uncertainty score ≥ 60
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Max Per Run</label>
                <p className="text-sm text-muted-foreground">
                  Sync up to 10 verifications per auto-sync run
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Priority Threshold</label>
                <p className="text-sm text-muted-foreground">
                  Sync 'high' and 'critical' priority only
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Sync Interval</label>
                <p className="text-sm text-muted-foreground">
                  Auto-sync runs every 30 minutes
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
