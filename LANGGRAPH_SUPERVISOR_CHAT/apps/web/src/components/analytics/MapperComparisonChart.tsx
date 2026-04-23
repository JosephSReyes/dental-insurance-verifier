'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Award, AlertTriangle } from 'lucide-react';

interface MapperData {
  mapper: string;
  pathAccuracy: number;
  totalAnnotations: number;
  correctPaths: number;
  incorrectPaths: number;
  effectiveSearches: number;
  ineffectiveSearches: number;
  edgeCases: number;
  avgConfidenceGap: number;
}

interface MapperComparisonChartProps {
  portalType?: string;
  officeId?: string;
}

export function MapperComparisonChart({
  portalType,
  officeId,
}: MapperComparisonChartProps) {
  const [mappers, setMappers] = useState<MapperData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMappers();
  }, [portalType, officeId]);

  const loadMappers = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (portalType) params.append('portalType', portalType);
      if (officeId) params.append('officeId', officeId);

      const response = await fetch(`/api/analytics/mapper-comparison?${params.toString()}`);
      const data = await response.json();

      if (data.error) {
        setError(data.error);
      } else {
        setMappers(data.mappers || []);
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
          <CardTitle>Mapper Comparison</CardTitle>
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
          <CardTitle>Mapper Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (mappers.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Mapper Comparison</CardTitle>
          <CardDescription>No mapper data available</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Sort by path accuracy
  const sortedMappers = [...mappers].sort((a, b) => b.pathAccuracy - a.pathAccuracy);
  const bestMapper = sortedMappers[0];
  const worstMapper = sortedMappers[sortedMappers.length - 1];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mapper Comparison</CardTitle>
        <CardDescription>
          Performance comparison across {mappers.length} mapper{mappers.length !== 1 ? 's' : ''}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Mapper Bars */}
        <div className="space-y-4">
          {sortedMappers.map((mapper, index) => (
            <div key={mapper.mapper} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{mapper.mapper}</span>
                  {mapper.mapper === bestMapper.mapper && (
                    <Award className="h-4 w-4 text-yellow-500" />
                  )}
                  {mapper.pathAccuracy < 70 && (
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {mapper.totalAnnotations} annotations
                  </Badge>
                  <span className="text-sm font-bold w-12 text-right">
                    {mapper.pathAccuracy.toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="h-6 bg-secondary rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    mapper.pathAccuracy >= 90
                      ? 'bg-green-500'
                      : mapper.pathAccuracy >= 70
                      ? 'bg-yellow-500'
                      : 'bg-red-500'
                  }`}
                  style={{ width: `${mapper.pathAccuracy}%` }}
                />
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>✓ {mapper.correctPaths} correct</span>
                <span>✗ {mapper.incorrectPaths} incorrect</span>
                <span>🎯 {mapper.effectiveSearches} effective searches</span>
                {mapper.edgeCases > 0 && (
                  <span>⚠️ {mapper.edgeCases} edge cases</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="mt-6 pt-6 border-t space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Best Performer:</span>
            <span className="font-medium">{bestMapper.mapper}</span>
          </div>
          {worstMapper.pathAccuracy < 70 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Needs Improvement:</span>
              <span className="font-medium text-red-600">{worstMapper.mapper}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
