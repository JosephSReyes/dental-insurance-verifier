'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Download, FileJson, FileSpreadsheet, Loader2, CheckCircle2 } from 'lucide-react';

interface ExportReportsProps {
  mapper?: string;
  portalType?: string;
  officeId?: string;
}

export function ExportReports({ mapper, portalType, officeId }: ExportReportsProps) {
  const [exporting, setExporting] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const exportData = async (format: 'csv' | 'json', reportType: string) => {
    setExporting(`${reportType}-${format}`);
    setSuccess(null);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (mapper) params.append('mapper', mapper);
      if (portalType) params.append('portalType', portalType);
      if (officeId) params.append('officeId', officeId);
      params.append('format', format);

      const response = await fetch(`/api/analytics/export/${reportType}?${params.toString()}`);

      if (!response.ok) {
        throw new Error(`Export failed: ${response.statusText}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportType}-report-${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setSuccess(`${reportType} report exported successfully`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setExporting(null);
    }
  };

  const reports = [
    {
      id: 'annotations',
      title: 'Full Annotations Report',
      description: 'Complete annotation data with all metadata',
      icon: FileSpreadsheet,
    },
    {
      id: 'mapper-comparison',
      title: 'Mapper Comparison Report',
      description: 'Performance metrics across all mappers',
      icon: FileSpreadsheet,
    },
    {
      id: 'portal-quirks',
      title: 'Portal Quirks Report',
      description: 'Portal-specific data structure issues',
      icon: FileJson,
    },
    {
      id: 'trends',
      title: 'Accuracy Trends Report',
      description: 'Time-series path accuracy data',
      icon: FileSpreadsheet,
    },
    {
      id: 'search-effectiveness',
      title: 'Search Effectiveness Report',
      description: 'Search strategy performance metrics',
      icon: FileSpreadsheet,
    },
    {
      id: 'performance',
      title: 'Performance Metrics Report',
      description: 'Extraction time, tool calls, and cost data',
      icon: FileSpreadsheet,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Export Reports</CardTitle>
            <CardDescription>Download analytics data for external analysis</CardDescription>
          </div>
          <Download className="h-5 w-5 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        {/* Filter Summary */}
        {(mapper || portalType || officeId) && (
          <div className="mb-4 flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">Filters:</span>
            {mapper && <Badge variant="outline">{mapper}</Badge>}
            {portalType && <Badge variant="outline">{portalType}</Badge>}
            {officeId && <Badge variant="outline">Office: {officeId}</Badge>}
          </div>
        )}

        {/* Success/Error Messages */}
        {success && (
          <Alert className="mb-4">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-700">{success}</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Report Export Buttons */}
        <div className="space-y-3">
          {reports.map(report => {
            const Icon = report.icon;
            return (
              <div
                key={report.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-secondary/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{report.title}</p>
                    <p className="text-xs text-muted-foreground">{report.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportData('csv', report.id)}
                    disabled={exporting !== null}
                  >
                    {exporting === `${report.id}-csv` ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <FileSpreadsheet className="h-4 w-4 mr-1" />
                        CSV
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportData('json', report.id)}
                    disabled={exporting !== null}
                  >
                    {exporting === `${report.id}-json` ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <FileJson className="h-4 w-4 mr-1" />
                        JSON
                      </>
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Export Info */}
        <div className="mt-6 pt-6 border-t">
          <p className="text-xs text-muted-foreground">
            Reports are exported with current filter settings. CSV format is recommended for
            spreadsheet analysis, while JSON preserves complex data structures.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
