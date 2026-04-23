'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BarChart3, X } from 'lucide-react';
import Link from 'next/link';

import { PathAccuracyTrendChart } from '@/components/analytics/PathAccuracyTrendChart';
import { MapperComparisonChart } from '@/components/analytics/MapperComparisonChart';
import { ConfidenceCalibrationChart } from '@/components/analytics/ConfidenceCalibrationChart';
import { PortalQuirksHeatmap } from '@/components/analytics/PortalQuirksHeatmap';
import { SearchEffectivenessChart } from '@/components/analytics/SearchEffectivenessChart';
import { PerformanceMetricsTimeline } from '@/components/analytics/PerformanceMetricsTimeline';
import { ExportReports } from '@/components/analytics/ExportReports';

export default function AnalyticsPage() {
  const [mapper, setMapper] = useState<string>('');
  const [portalType, setPortalType] = useState<string>('');
  const [officeId, setOfficeId] = useState<string>('');
  const [days, setDays] = useState<number>(30);

  const clearFilters = () => {
    setMapper('');
    setPortalType('');
    setOfficeId('');
    setDays(30);
  };

  const hasFilters = mapper || portalType || officeId || days !== 30;

  // Example data - in production, these would come from an API
  const mappers = [
    'patient_info_mapper',
    'eligibility_mapper',
    'coverage_mapper',
    'deductible_mapper',
    'copay_mapper',
    'oop_mapper',
    'network_mapper',
  ];

  const portalTypes = ['availity', 'navinet', 'change_healthcare', 'waystar'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2 text-slate-900 dark:text-slate-100">
              <BarChart3 className="h-8 w-8" />
              Analytics Dashboard
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              Monitor path accuracy, confidence calibration, and performance metrics
            </p>
          </div>
          <Link
            href="/annotations"
            className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            Go to Annotation Queue →
          </Link>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Filters</CardTitle>
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-1" />
                  Clear All
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Mapper Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Mapper</label>
                <Select value={mapper} onValueChange={setMapper}>
                  <SelectTrigger>
                    <SelectValue placeholder="All mappers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All mappers</SelectItem>
                    {mappers.map(m => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Portal Type Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Portal Type</label>
                <Select value={portalType} onValueChange={setPortalType}>
                  <SelectTrigger>
                    <SelectValue placeholder="All portals" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All portals</SelectItem>
                    {portalTypes.map(p => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Office ID Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Office ID</label>
                <input
                  type="text"
                  value={officeId}
                  onChange={e => setOfficeId(e.target.value)}
                  placeholder="All offices"
                  className="w-full px-3 py-2 border rounded-md text-sm bg-background"
                />
              </div>

              {/* Time Range Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Time Range</label>
                <Select value={days.toString()} onValueChange={v => setDays(parseInt(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Last 7 days</SelectItem>
                    <SelectItem value="14">Last 14 days</SelectItem>
                    <SelectItem value="30">Last 30 days</SelectItem>
                    <SelectItem value="60">Last 60 days</SelectItem>
                    <SelectItem value="90">Last 90 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Active Filters Display */}
            {hasFilters && (
              <div className="mt-4 flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground">Active filters:</span>
                {mapper && (
                  <Badge variant="secondary" className="gap-1">
                    Mapper: {mapper}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => setMapper('')}
                    />
                  </Badge>
                )}
                {portalType && (
                  <Badge variant="secondary" className="gap-1">
                    Portal: {portalType}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => setPortalType('')}
                    />
                  </Badge>
                )}
                {officeId && (
                  <Badge variant="secondary" className="gap-1">
                    Office: {officeId}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => setOfficeId('')}
                    />
                  </Badge>
                )}
                {days !== 30 && (
                  <Badge variant="secondary" className="gap-1">
                    {days} days
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => setDays(30)}
                    />
                  </Badge>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Path Accuracy Trend */}
          <PathAccuracyTrendChart
            mapper={mapper || undefined}
            portalType={portalType || undefined}
            officeId={officeId || undefined}
            days={days}
          />

          {/* Mapper Comparison */}
          <MapperComparisonChart
            portalType={portalType || undefined}
            officeId={officeId || undefined}
          />

          {/* Confidence Calibration */}
          <ConfidenceCalibrationChart mapper={mapper || undefined} />

          {/* Search Effectiveness */}
          <SearchEffectivenessChart
            mapper={mapper || undefined}
            portalType={portalType || undefined}
            officeId={officeId || undefined}
            groupBy={mapper ? 'field' : 'mapper'}
          />

          {/* Performance Metrics Timeline */}
          <div className="lg:col-span-2">
            <PerformanceMetricsTimeline
              mapper={mapper || undefined}
              portalType={portalType || undefined}
              officeId={officeId || undefined}
              days={days}
            />
          </div>

          {/* Portal Quirks Heatmap */}
          <div className="lg:col-span-2">
            <PortalQuirksHeatmap
              mapper={mapper || undefined}
              officeId={officeId || undefined}
            />
          </div>

          {/* Export Reports */}
          <div className="lg:col-span-2">
            <ExportReports
              mapper={mapper || undefined}
              portalType={portalType || undefined}
              officeId={officeId || undefined}
            />
          </div>
        </div>

        {/* Summary Footer */}
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-sm text-muted-foreground">
              <p>
                Analytics dashboard powered by enhanced annotations from Label Studio.
                All metrics update in real-time as new annotations are added.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
