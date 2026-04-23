'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertTriangle } from 'lucide-react';

interface QuirkData {
  portal: string;
  quirk: string;
  frequency: number;
  affectedFields: string[];
  examples: string[];
}

interface PortalQuirksHeatmapProps {
  mapper?: string;
  officeId?: string;
}

const quirkLabels: Record<string, string> = {
  unusual_nesting: 'Unusual Nesting',
  missing_fields: 'Missing Fields',
  version_change: 'Version Change',
  inconsistent_format: 'Inconsistent Format',
  unexpected_type: 'Unexpected Type',
  ambiguous_structure: 'Ambiguous Structure',
};

const quirkColors: Record<number, string> = {
  0: 'bg-gray-100',
  1: 'bg-yellow-100 text-yellow-900',
  2: 'bg-yellow-200 text-yellow-900',
  3: 'bg-orange-200 text-orange-900',
  4: 'bg-orange-300 text-orange-900',
  5: 'bg-red-200 text-red-900',
};

function getColorForFrequency(frequency: number): string {
  if (frequency === 0) return quirkColors[0];
  if (frequency === 1) return quirkColors[1];
  if (frequency <= 3) return quirkColors[2];
  if (frequency <= 5) return quirkColors[3];
  if (frequency <= 10) return quirkColors[4];
  return quirkColors[5];
}

export function PortalQuirksHeatmap({ mapper, officeId }: PortalQuirksHeatmapProps) {
  const [quirks, setQuirks] = useState<QuirkData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadQuirks();
  }, [mapper, officeId]);

  const loadQuirks = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (mapper) params.append('mapper', mapper);
      if (officeId) params.append('officeId', officeId);

      const response = await fetch(`/api/analytics/portal-quirks?${params.toString()}`);
      const data = await response.json();

      if (data.error) {
        setError(data.error);
      } else {
        setQuirks(data.quirks || []);
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
          <CardTitle>Portal Quirks Heatmap</CardTitle>
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
          <CardTitle>Portal Quirks Heatmap</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (quirks.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Portal Quirks Heatmap</CardTitle>
          <CardDescription>No portal quirks detected</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Group quirks by portal and quirk type
  const portals = Array.from(new Set(quirks.map(q => q.portal))).sort();
  const quirkTypes = Array.from(new Set(quirks.map(q => q.quirk))).sort();

  const getQuirkData = (portal: string, quirkType: string): QuirkData | null => {
    return quirks.find(q => q.portal === portal && q.quirk === quirkType) || null;
  };

  const totalQuirks = quirks.reduce((sum, q) => sum + q.frequency, 0);
  const mostProblematicPortal = portals.reduce((max, portal) => {
    const portalTotal = quirks
      .filter(q => q.portal === portal)
      .reduce((sum, q) => sum + q.frequency, 0);
    const maxTotal = quirks
      .filter(q => q.portal === max)
      .reduce((sum, q) => sum + q.frequency, 0);
    return portalTotal > maxTotal ? portal : max;
  }, portals[0]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Portal Quirks Heatmap</CardTitle>
            <CardDescription>Data structure issues by portal type</CardDescription>
          </div>
          <Badge variant="outline" className="text-sm">
            {totalQuirks} total quirks
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* Heatmap Grid */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="border p-2 text-left text-xs font-medium text-muted-foreground">
                  Portal Type
                </th>
                {quirkTypes.map(quirkType => (
                  <th
                    key={quirkType}
                    className="border p-2 text-center text-xs font-medium text-muted-foreground"
                  >
                    {quirkLabels[quirkType] || quirkType}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {portals.map(portal => (
                <tr key={portal}>
                  <td className="border p-2 text-sm font-medium">
                    {portal}
                    {portal === mostProblematicPortal && (
                      <AlertTriangle className="inline h-3 w-3 ml-1 text-red-500" />
                    )}
                  </td>
                  {quirkTypes.map(quirkType => {
                    const quirkData = getQuirkData(portal, quirkType);
                    const frequency = quirkData?.frequency || 0;

                    return (
                      <td
                        key={`${portal}-${quirkType}`}
                        className={`border p-2 text-center transition-all hover:opacity-80 cursor-pointer ${getColorForFrequency(frequency)}`}
                        title={
                          quirkData
                            ? `${quirkData.frequency} occurrences\nFields: ${quirkData.affectedFields.join(', ')}`
                            : 'No occurrences'
                        }
                      >
                        <span className="text-sm font-medium">
                          {frequency > 0 ? frequency : '—'}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="mt-6 pt-6 border-t">
          <p className="text-sm text-muted-foreground mb-2">Frequency Scale:</p>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              <div className={`w-6 h-6 rounded ${quirkColors[0]} border`} />
              <span className="text-xs">None</span>
            </div>
            <div className="flex items-center gap-1">
              <div className={`w-6 h-6 rounded ${quirkColors[1]} border`} />
              <span className="text-xs">1</span>
            </div>
            <div className="flex items-center gap-1">
              <div className={`w-6 h-6 rounded ${quirkColors[2]} border`} />
              <span className="text-xs">2-3</span>
            </div>
            <div className="flex items-center gap-1">
              <div className={`w-6 h-6 rounded ${quirkColors[3]} border`} />
              <span className="text-xs">4-5</span>
            </div>
            <div className="flex items-center gap-1">
              <div className={`w-6 h-6 rounded ${quirkColors[4]} border`} />
              <span className="text-xs">6-10</span>
            </div>
            <div className="flex items-center gap-1">
              <div className={`w-6 h-6 rounded ${quirkColors[5]} border`} />
              <span className="text-xs">10+</span>
            </div>
          </div>
        </div>

        {/* Summary */}
        {mostProblematicPortal && (
          <div className="mt-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                <strong>{mostProblematicPortal}</strong> has the most portal quirks detected.
                Consider reviewing these patterns for targeted improvements.
              </AlertDescription>
            </Alert>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
