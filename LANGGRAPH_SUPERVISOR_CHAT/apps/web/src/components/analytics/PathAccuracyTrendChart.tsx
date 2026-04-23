'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface TrendData {
  date: string;
  pathAccuracy: number;
  totalAnnotations: number;
  correctPaths: number;
  incorrectPaths: number;
}

interface PathAccuracyTrendChartProps {
  mapper?: string;
  portalType?: string;
  officeId?: string;
  days?: number;
}

export function PathAccuracyTrendChart({
  mapper,
  portalType,
  officeId,
  days = 30,
}: PathAccuracyTrendChartProps) {
  const [trends, setTrends] = useState<TrendData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTrends();
  }, [mapper, portalType, officeId, days]);

  const loadTrends = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (mapper) params.append('mapper', mapper);
      if (portalType) params.append('portalType', portalType);
      if (officeId) params.append('officeId', officeId);
      params.append('days', days.toString());

      const response = await fetch(`/api/analytics/trends?${params.toString()}`);
      const data = await response.json();

      if (data.error) {
        setError(data.error);
      } else {
        setTrends(data.trends || []);
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
          <CardTitle>Path Accuracy Trend</CardTitle>
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
          <CardTitle>Path Accuracy Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (trends.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Path Accuracy Trend</CardTitle>
          <CardDescription>No data available for the selected period</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Calculate trend direction
  const firstAccuracy = trends[0]?.pathAccuracy || 0;
  const lastAccuracy = trends[trends.length - 1]?.pathAccuracy || 0;
  const trendChange = lastAccuracy - firstAccuracy;

  const maxAccuracy = Math.max(...trends.map(t => t.pathAccuracy));
  const minAccuracy = Math.min(...trends.map(t => t.pathAccuracy));
  const avgAccuracy = trends.reduce((sum, t) => sum + t.pathAccuracy, 0) / trends.length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Path Accuracy Trend</CardTitle>
            <CardDescription>Last {days} days</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {trendChange > 5 && (
              <div className="flex items-center text-green-600">
                <TrendingUp className="h-4 w-4 mr-1" />
                <span className="text-sm font-medium">
                  +{trendChange.toFixed(1)}%
                </span>
              </div>
            )}
            {trendChange < -5 && (
              <div className="flex items-center text-red-600">
                <TrendingDown className="h-4 w-4 mr-1" />
                <span className="text-sm font-medium">
                  {trendChange.toFixed(1)}%
                </span>
              </div>
            )}
            {Math.abs(trendChange) <= 5 && (
              <div className="flex items-center text-muted-foreground">
                <Minus className="h-4 w-4 mr-1" />
                <span className="text-sm">Stable</span>
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Simple ASCII chart */}
        <div className="space-y-2">
          {trends.map((trend, index) => {
            const barWidth = (trend.pathAccuracy / 100) * 100;
            const date = new Date(trend.date).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            });

            return (
              <div key={index} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground w-16">{date}</span>
                  <span className="font-mono text-muted-foreground">
                    {trend.totalAnnotations} annotations
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-8 bg-secondary rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        trend.pathAccuracy >= 90
                          ? 'bg-green-500'
                          : trend.pathAccuracy >= 70
                          ? 'bg-yellow-500'
                          : 'bg-red-500'
                      }`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium w-12 text-right">
                    {trend.pathAccuracy.toFixed(1)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary Stats */}
        <div className="mt-6 pt-6 border-t grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-sm text-muted-foreground">Average</p>
            <p className="text-2xl font-bold">{avgAccuracy.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Best</p>
            <p className="text-2xl font-bold text-green-600">{maxAccuracy.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Lowest</p>
            <p className="text-2xl font-bold text-red-600">{minAccuracy.toFixed(1)}%</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
