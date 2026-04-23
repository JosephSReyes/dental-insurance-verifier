'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Target, AlertCircle } from 'lucide-react';

interface CalibrationBucket {
  confidenceRange: string;
  averageConfidence: number;
  actualAccuracy: number;
  count: number;
  calibrationGap: number;
}

interface ConfidenceCalibrationChartProps {
  mapper?: string;
}

export function ConfidenceCalibrationChart({ mapper }: ConfidenceCalibrationChartProps) {
  const [buckets, setBuckets] = useState<CalibrationBucket[]>([]);
  const [avgGap, setAvgGap] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCalibration();
  }, [mapper]);

  const loadCalibration = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (mapper) params.append('mapper', mapper);

      const response = await fetch(`/api/analytics/confidence-calibration?${params.toString()}`);
      const data = await response.json();

      if (data.error) {
        setError(data.error);
      } else {
        setBuckets(data.calibrationBuckets || []);
        setAvgGap(data.avgCalibrationGap || 0);
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
          <CardTitle>Confidence Calibration</CardTitle>
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
          <CardTitle>Confidence Calibration</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (buckets.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Confidence Calibration</CardTitle>
          <CardDescription>No confidence data available</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const isWellCalibrated = avgGap < 10;
  const isOverconfident = buckets.some(b => b.averageConfidence > b.actualAccuracy / 100 && b.calibrationGap > 15);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Confidence Calibration</CardTitle>
            <CardDescription>AI Confidence vs Actual Accuracy</CardDescription>
          </div>
          {isWellCalibrated ? (
            <Badge variant="default" className="bg-green-600">
              <Target className="h-3 w-3 mr-1" />
              Well Calibrated
            </Badge>
          ) : (
            <Badge variant="destructive">
              <AlertCircle className="h-3 w-3 mr-1" />
              Needs Calibration
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Calibration Visualization */}
        <div className="space-y-3">
          {buckets.map((bucket, index) => {
            const expectedAccuracy = bucket.averageConfidence * 100;
            const gap = bucket.calibrationGap;

            return (
              <div key={index} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{bucket.confidenceRange}</span>
                  <span className="text-xs text-muted-foreground">
                    {bucket.count} annotations
                  </span>
                </div>
                <div className="space-y-1">
                  {/* Expected accuracy bar */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-20">Expected:</span>
                    <div className="flex-1 h-4 bg-secondary rounded">
                      <div
                        className="h-full bg-blue-500 rounded"
                        style={{ width: `${expectedAccuracy}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono w-12 text-right">
                      {expectedAccuracy.toFixed(0)}%
                    </span>
                  </div>
                  {/* Actual accuracy bar */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-20">Actual:</span>
                    <div className="flex-1 h-4 bg-secondary rounded">
                      <div
                        className={`h-full rounded ${
                          gap > 15 ? 'bg-red-500' : gap > 10 ? 'bg-yellow-500' : 'bg-green-500'
                        }`}
                        style={{ width: `${bucket.actualAccuracy}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono w-12 text-right">
                      {bucket.actualAccuracy.toFixed(0)}%
                    </span>
                  </div>
                </div>
                {gap > 10 && (
                  <p className="text-xs text-red-600">
                    Gap: {gap.toFixed(1)}% - {expectedAccuracy > bucket.actualAccuracy ? 'Overconfident' : 'Underconfident'}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Summary */}
        <div className="mt-6 pt-6 border-t">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Average Calibration Gap:</span>
            <Badge variant={avgGap < 10 ? 'default' : 'destructive'}>
              {avgGap.toFixed(1)}%
            </Badge>
          </div>
          {isOverconfident && (
            <Alert className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Model shows overconfidence in some ranges. Consider adjusting confidence thresholds
                or providing more calibrated feedback during annotation.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
