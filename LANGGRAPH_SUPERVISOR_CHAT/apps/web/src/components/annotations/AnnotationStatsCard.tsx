'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/card';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  TrendingUp,
  Target,
  Zap,
} from 'lucide-react';

interface AnnotationStats {
  totalAnnotations: number;
  correctPaths: number;
  incorrectPaths: number;
  pathAccuracy: number;
  effectiveSearches: number;
  edgeCases: number;
  avgConfidenceGap: number;
}

interface AnnotationStatsCardProps {
  mapper?: string;
  portalType?: string;
  officeId?: string;
}

export function AnnotationStatsCard({
  mapper,
  portalType,
  officeId,
}: AnnotationStatsCardProps) {
  const [stats, setStats] = useState<AnnotationStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, [mapper, portalType, officeId]);

  const loadStats = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (mapper) params.append('mapper', mapper);
      if (portalType) params.append('portalType', portalType);
      if (officeId) params.append('officeId', officeId);

      const response = await fetch(`/api/label-studio/stats?${params.toString()}`);
      const data = await response.json();

      if (data.stats) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to load annotation stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Annotation Statistics</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!stats || stats.totalAnnotations === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Annotation Statistics</CardTitle>
          <CardDescription>No annotations yet</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Start annotating verifications to see statistics here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Annotation Statistics</CardTitle>
        <CardDescription>
          Based on {stats.totalAnnotations} annotation{stats.totalAnnotations !== 1 ? 's' : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Path Accuracy */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Path Accuracy</span>
            </div>
            <span className="text-2xl font-bold">
              {stats.pathAccuracy.toFixed(1)}%
            </span>
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                stats.pathAccuracy >= 80
                  ? 'bg-green-500'
                  : stats.pathAccuracy >= 60
                  ? 'bg-yellow-500'
                  : 'bg-red-500'
              }`}
              style={{ width: `${stats.pathAccuracy}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CheckCircle className="h-3 w-3 text-green-600" />
              {stats.correctPaths} correct
            </span>
            <span className="flex items-center gap-1">
              <XCircle className="h-3 w-3 text-red-600" />
              {stats.incorrectPaths} incorrect
            </span>
          </div>
        </div>

        {/* Search Effectiveness */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Effective Searches</span>
            </div>
            <Badge variant="secondary">{stats.effectiveSearches}</Badge>
          </div>
        </div>

        {/* Edge Cases */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Edge Cases Documented</span>
            </div>
            <Badge variant="outline">{stats.edgeCases}</Badge>
          </div>
        </div>

        {/* Confidence Calibration */}
        {stats.avgConfidenceGap > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Avg Confidence Gap</span>
              </div>
              <Badge
                variant={stats.avgConfidenceGap > 0.2 ? 'destructive' : 'secondary'}
              >
                {(stats.avgConfidenceGap * 100).toFixed(1)}%
              </Badge>
            </div>
            {stats.avgConfidenceGap > 0.2 && (
              <p className="text-xs text-muted-foreground">
                ⚠️ Model shows overconfidence. Consider calibration.
              </p>
            )}
          </div>
        )}

        {/* Overall Assessment */}
        <div className="pt-4 border-t">
          {stats.pathAccuracy >= 90 && (
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-4 w-4" />
              <span className="text-sm font-medium">Excellent Performance</span>
            </div>
          )}
          {stats.pathAccuracy >= 70 && stats.pathAccuracy < 90 && (
            <div className="flex items-center gap-2 text-yellow-600">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm font-medium">Good Performance - Room for Improvement</span>
            </div>
          )}
          {stats.pathAccuracy < 70 && (
            <div className="flex items-center gap-2 text-red-600">
              <XCircle className="h-4 w-4" />
              <span className="text-sm font-medium">Needs Attention</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
