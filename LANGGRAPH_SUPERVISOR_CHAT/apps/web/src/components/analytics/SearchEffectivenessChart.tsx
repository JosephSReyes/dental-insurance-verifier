'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Search, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

interface SearchData {
  mapper: string;
  field: string;
  effective: number;
  suboptimal: number;
  ineffective: number;
  totalSearches: number;
  effectivenessRate: number;
  avgToolCalls: number;
  bestSearchTerms: string[];
}

interface SearchEffectivenessChartProps {
  mapper?: string;
  portalType?: string;
  officeId?: string;
  groupBy?: 'mapper' | 'field';
}

export function SearchEffectivenessChart({
  mapper,
  portalType,
  officeId,
  groupBy = 'mapper',
}: SearchEffectivenessChartProps) {
  const [searches, setSearches] = useState<SearchData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSearchData();
  }, [mapper, portalType, officeId, groupBy]);

  const loadSearchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (mapper) params.append('mapper', mapper);
      if (portalType) params.append('portalType', portalType);
      if (officeId) params.append('officeId', officeId);
      params.append('groupBy', groupBy);

      const response = await fetch(`/api/analytics/search-effectiveness?${params.toString()}`);
      const data = await response.json();

      if (data.error) {
        setError(data.error);
      } else {
        setSearches(data.searches || []);
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
          <CardTitle>Search Effectiveness</CardTitle>
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
          <CardTitle>Search Effectiveness</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (searches.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Search Effectiveness</CardTitle>
          <CardDescription>No search data available</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Sort by effectiveness rate
  const sortedSearches = [...searches].sort((a, b) => b.effectivenessRate - a.effectivenessRate);

  const overallStats = {
    totalSearches: searches.reduce((sum, s) => sum + s.totalSearches, 0),
    totalEffective: searches.reduce((sum, s) => sum + s.effective, 0),
    totalSuboptimal: searches.reduce((sum, s) => sum + s.suboptimal, 0),
    totalIneffective: searches.reduce((sum, s) => sum + s.ineffective, 0),
    avgToolCalls: searches.reduce((sum, s) => sum + s.avgToolCalls, 0) / searches.length,
  };

  const overallEffectivenessRate =
    overallStats.totalSearches > 0
      ? (overallStats.totalEffective / overallStats.totalSearches) * 100
      : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Search Effectiveness</CardTitle>
            <CardDescription>
              Search strategy performance by {groupBy}
            </CardDescription>
          </div>
          <Badge
            variant={overallEffectivenessRate >= 80 ? 'default' : 'destructive'}
            className={overallEffectivenessRate >= 80 ? 'bg-green-600' : ''}
          >
            {overallEffectivenessRate.toFixed(1)}% effective
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* Search Effectiveness Bars */}
        <div className="space-y-4">
          {sortedSearches.map((search, index) => {
            const label = groupBy === 'mapper' ? search.mapper : search.field;
            const effectivePercent = (search.effective / search.totalSearches) * 100;
            const suboptimalPercent = (search.suboptimal / search.totalSearches) * 100;
            const ineffectivePercent = (search.ineffective / search.totalSearches) * 100;

            return (
              <div key={index} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{label}</span>
                    {search.effectivenessRate >= 90 && (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    )}
                    {search.effectivenessRate < 60 && (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {search.totalSearches} searches
                    </Badge>
                    <span className="text-sm font-bold w-12 text-right">
                      {search.effectivenessRate.toFixed(1)}%
                    </span>
                  </div>
                </div>

                {/* Stacked bar */}
                <div className="h-6 bg-secondary rounded-full overflow-hidden flex">
                  {search.effective > 0 && (
                    <div
                      className="bg-green-500 transition-all"
                      style={{ width: `${effectivePercent}%` }}
                      title={`${search.effective} effective`}
                    />
                  )}
                  {search.suboptimal > 0 && (
                    <div
                      className="bg-yellow-500 transition-all"
                      style={{ width: `${suboptimalPercent}%` }}
                      title={`${search.suboptimal} suboptimal`}
                    />
                  )}
                  {search.ineffective > 0 && (
                    <div
                      className="bg-red-500 transition-all"
                      style={{ width: `${ineffectivePercent}%` }}
                      title={`${search.ineffective} ineffective`}
                    />
                  )}
                </div>

                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                    {search.effective} effective
                  </span>
                  <span className="flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 text-yellow-500" />
                    {search.suboptimal} suboptimal
                  </span>
                  <span className="flex items-center gap-1">
                    <XCircle className="h-3 w-3 text-red-500" />
                    {search.ineffective} ineffective
                  </span>
                  <span className="flex items-center gap-1">
                    <Search className="h-3 w-3" />
                    {search.avgToolCalls.toFixed(1)} avg calls
                  </span>
                </div>

                {search.bestSearchTerms && search.bestSearchTerms.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">Best terms:</span>{' '}
                    {search.bestSearchTerms.slice(0, 3).join(', ')}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Overall Statistics */}
        <div className="mt-6 pt-6 border-t">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-sm text-muted-foreground">Total Searches</p>
              <p className="text-2xl font-bold">{overallStats.totalSearches}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Effective</p>
              <p className="text-2xl font-bold text-green-600">
                {overallStats.totalEffective}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Suboptimal</p>
              <p className="text-2xl font-bold text-yellow-600">
                {overallStats.totalSuboptimal}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Avg Tool Calls</p>
              <p className="text-2xl font-bold">{overallStats.avgToolCalls.toFixed(1)}</p>
            </div>
          </div>
        </div>

        {/* Recommendations */}
        {overallStats.totalIneffective > 0 && (
          <Alert className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              {overallStats.totalIneffective} ineffective searches detected. Review search
              strategies and consider adding better search terms from successful annotations.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
