'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Clock, Zap, DollarSign, TrendingUp, TrendingDown } from 'lucide-react';

interface PerformanceData {
  date: string;
  avgExtractionTime: number;
  avgToolCalls: number;
  avgCost: number;
  totalAnnotations: number;
  p50ExtractionTime: number;
  p95ExtractionTime: number;
}

interface PerformanceMetricsTimelineProps {
  mapper?: string;
  portalType?: string;
  officeId?: string;
  days?: number;
}

export function PerformanceMetricsTimeline({
  mapper,
  portalType,
  officeId,
  days = 30,
}: PerformanceMetricsTimelineProps) {
  const [metrics, setMetrics] = useState<PerformanceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMetrics();
  }, [mapper, portalType, officeId, days]);

  const loadMetrics = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (mapper) params.append('mapper', mapper);
      if (portalType) params.append('portalType', portalType);
      if (officeId) params.append('officeId', officeId);
      params.append('days', days.toString());

      const response = await fetch(`/api/analytics/performance-metrics?${params.toString()}`);
      const data = await response.json();

      if (data.error) {
        setError(data.error);
      } else {
        setMetrics(data.metrics || []);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Performance Metrics Timeline</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Performance Metrics Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (metrics.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Performance Metrics Timeline</CardTitle>
          <CardDescription>No performance data available</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Calculate trends
  const firstMetric = metrics[0];
  const lastMetric = metrics[metrics.length - 1];

  const timeTrend = lastMetric.avgExtractionTime - firstMetric.avgExtractionTime;
  const toolCallsTrend = lastMetric.avgToolCalls - firstMetric.avgToolCalls;
  const costTrend = lastMetric.avgCost - firstMetric.avgCost;

  const avgExtractionTime =
    metrics.reduce((sum, m) => sum + m.avgExtractionTime, 0) / metrics.length;
  const avgToolCalls = metrics.reduce((sum, m) => sum + m.avgToolCalls, 0) / metrics.length;
  const avgCost = metrics.reduce((sum, m) => sum + m.avgCost, 0) / metrics.length;

  const maxExtractionTime = Math.max(...metrics.map(m => m.avgExtractionTime));
  const maxToolCalls = Math.max(...metrics.map(m => m.avgToolCalls));
  const maxCost = Math.max(...metrics.map(m => m.avgCost));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Performance Metrics Timeline</CardTitle>
            <CardDescription>Last {days} days</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Extraction Time Chart */}
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Extraction Time (ms)</span>
              </div>
              <div className="flex items-center gap-2">
                {timeTrend < 0 ? (
                  <TrendingDown className="h-4 w-4 text-green-500" />
                ) : (
                  <TrendingUp className="h-4 w-4 text-red-500" />
                )}
                <span className="text-xs text-muted-foreground">
                  {timeTrend > 0 ? '+' : ''}
                  {timeTrend.toFixed(0)}ms
                </span>
              </div>
            </div>
            <div className="space-y-1">
              {metrics.map((metric, index) => {
                const date = new Date(metric.date).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                });
                const barWidth = (metric.avgExtractionTime / maxExtractionTime) * 100;

                return (
                  <div key={index} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-16">{date}</span>
                    <div className="flex-1 h-4 bg-secondary rounded">
                      <div
                        className="h-full bg-blue-500 rounded transition-all"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono w-16 text-right">
                      {metric.avgExtractionTime.toFixed(0)}ms
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tool Calls Chart */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Tool Calls</span>
              </div>
              <div className="flex items-center gap-2">
                {toolCallsTrend < 0 ? (
                  <TrendingDown className="h-4 w-4 text-green-500" />
                ) : (
                  <TrendingUp className="h-4 w-4 text-red-500" />
                )}
                <span className="text-xs text-muted-foreground">
                  {toolCallsTrend > 0 ? '+' : ''}
                  {toolCallsTrend.toFixed(1)}
                </span>
              </div>
            </div>
            <div className="space-y-1">
              {metrics.map((metric, index) => {
                const date = new Date(metric.date).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                });
                const barWidth = (metric.avgToolCalls / maxToolCalls) * 100;

                return (
                  <div key={index} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-16">{date}</span>
                    <div className="flex-1 h-4 bg-secondary rounded">
                      <div
                        className="h-full bg-purple-500 rounded transition-all"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono w-16 text-right">
                      {metric.avgToolCalls.toFixed(1)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cost Chart */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Cost per Extraction</span>
              </div>
              <div className="flex items-center gap-2">
                {costTrend < 0 ? (
                  <TrendingDown className="h-4 w-4 text-green-500" />
                ) : (
                  <TrendingUp className="h-4 w-4 text-red-500" />
                )}
                <span className="text-xs text-muted-foreground">
                  {costTrend > 0 ? '+' : ''}${costTrend.toFixed(4)}
                </span>
              </div>
            </div>
            <div className="space-y-1">
              {metrics.map((metric, index) => {
                const date = new Date(metric.date).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                });
                const barWidth = maxCost > 0 ? (metric.avgCost / maxCost) * 100 : 0;

                return (
                  <div key={index} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-16">{date}</span>
                    <div className="flex-1 h-4 bg-secondary rounded">
                      <div
                        className="h-full bg-green-500 rounded transition-all"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono w-16 text-right">
                      ${metric.avgCost.toFixed(4)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="mt-6 pt-6 border-t grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-sm text-muted-foreground">Avg Time</p>
            <p className="text-2xl font-bold">{avgExtractionTime.toFixed(0)}ms</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Avg Tool Calls</p>
            <p className="text-2xl font-bold">{avgToolCalls.toFixed(1)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Avg Cost</p>
            <p className="text-2xl font-bold">${avgCost.toFixed(4)}</p>
          </div>
        </div>

        {/* Performance Insights */}
        {(timeTrend > 500 || toolCallsTrend > 2 || costTrend > 0.01) && (
          <Alert className="mt-4" variant="destructive">
            <TrendingUp className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Performance degradation detected.
              {timeTrend > 500 && ' Extraction time increasing.'}
              {toolCallsTrend > 2 && ' Tool calls increasing.'}
              {costTrend > 0.01 && ' Costs increasing.'}
              {' '}Consider reviewing recent changes or adding more feedback examples.
            </AlertDescription>
          </Alert>
        )}

        {timeTrend < -500 && toolCallsTrend < -1 && (
          <Alert className="mt-4">
            <TrendingDown className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-xs text-green-700">
              Performance improving! Extraction time and tool calls are decreasing.
              The feedback loop is working effectively.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
