'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Search,
  Filter,
  RefreshCw,
  BarChart3,
  CheckCircle,
  Clock,
  AlertCircle,
  ExternalLink,
  Loader2,
} from 'lucide-react';

interface QueueItem {
  id: string;
  patientName: string;
  insuranceProvider: string;
  verificationDate: string;
  qaScore: number | null;
  qaPassed: boolean | null;
  criticalIssues: number;
  warnings: number;
  officeKey: string;
  portalType: string;
  status: 'pending_review' | 'reviewed';
  annotationStatus?: 'not_started' | 'in_progress' | 'completed';
  annotatedFields?: number;
  totalFields?: number;
}

export default function AnnotationsQueuePage() {
  const router = useRouter();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'not_started' | 'in_progress' | 'completed'>('not_started');
  const [filterOffice, setFilterOffice] = useState<string>('all');
  const [filterPortal, setFilterPortal] = useState<string>('all');

  useEffect(() => {
    loadQueue();
  }, []);

  const loadQueue = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/queue');
      const data = await response.json();

      if (data.error) {
        console.error('Error loading queue:', data.error);
        return;
      }

      // Enhance with annotation status (mock for now - would query Label Studio)
      const enhancedItems = (data.items || []).map((item: QueueItem) => ({
        ...item,
        annotationStatus: 'not_started' as const,
        annotatedFields: 0,
        totalFields: 14, // Standard field count
      }));

      setItems(enhancedItems);
    } catch (error) {
      console.error('Failed to load queue:', error);
    } finally {
      setLoading(false);
    }
  };

  const syncToLabelStudio = async () => {
    setSyncing(true);
    try {
      const response = await fetch('/api/label-studio/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const data = await response.json();

      if (data.success) {
        alert(`Successfully synced ${data.tasksCreated} tasks to Label Studio!`);
        await loadQueue();
      } else {
        alert(`Sync failed: ${data.error}`);
      }
    } catch (error) {
      console.error('Sync failed:', error);
      alert('Failed to sync tasks');
    } finally {
      setSyncing(false);
    }
  };

  // Filter items
  const filteredItems = items.filter(item => {
    if (searchQuery && !item.patientName.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !item.insuranceProvider.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    if (filterStatus !== 'all' && item.annotationStatus !== filterStatus) {
      return false;
    }
    if (filterOffice !== 'all' && item.officeKey !== filterOffice) {
      return false;
    }
    if (filterPortal !== 'all' && item.portalType !== filterPortal) {
      return false;
    }
    return true;
  });

  // Statistics
  const stats = {
    total: items.length,
    notStarted: items.filter(i => i.annotationStatus === 'not_started').length,
    inProgress: items.filter(i => i.annotationStatus === 'in_progress').length,
    completed: items.filter(i => i.annotationStatus === 'completed').length,
  };

  // Unique values for filters
  const offices = Array.from(new Set(items.map(i => i.officeKey)));
  const portals = Array.from(new Set(items.map(i => i.portalType)));

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Annotation Queue</h1>
          <p className="text-muted-foreground">
            Manage and track verification annotations
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={loadQueue} variant="outline" disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={syncToLabelStudio} disabled={syncing}>
            {syncing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <ExternalLink className="h-4 w-4 mr-2" />
                Sync to Label Studio
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total Tasks</CardDescription>
            <CardTitle className="text-3xl">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Not Started
            </CardDescription>
            <CardTitle className="text-3xl text-yellow-600">{stats.notStarted}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              In Progress
            </CardDescription>
            <CardTitle className="text-3xl text-blue-600">{stats.inProgress}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Completed
            </CardDescription>
            <CardTitle className="text-3xl text-green-600">{stats.completed}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search patient or insurance..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterStatus} onValueChange={(value: any) => setFilterStatus(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Annotation Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="not_started">Not Started</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterOffice} onValueChange={setFilterOffice}>
              <SelectTrigger>
                <SelectValue placeholder="Office" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Offices</SelectItem>
                {offices.map(office => (
                  <SelectItem key={office} value={office}>{office}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterPortal} onValueChange={setFilterPortal}>
              <SelectTrigger>
                <SelectValue placeholder="Portal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Portals</SelectItem>
                {portals.map(portal => (
                  <SelectItem key={portal} value={portal}>{portal}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Queue Table */}
      <Card>
        <CardHeader>
          <CardTitle>Verification Tasks</CardTitle>
          <CardDescription>
            {filteredItems.length} task{filteredItems.length !== 1 ? 's' : ''} matching filters
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No tasks found. Try adjusting your filters or syncing from Label Studio.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Insurance</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Office</TableHead>
                  <TableHead>Portal</TableHead>
                  <TableHead>QA Score</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.patientName}</TableCell>
                    <TableCell>{item.insuranceProvider}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(item.verificationDate).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{item.officeKey}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{item.portalType}</Badge>
                    </TableCell>
                    <TableCell>
                      {item.qaScore !== null ? (
                        <div className="flex items-center gap-2">
                          <span className={item.qaPassed ? 'text-green-600' : 'text-red-600'}>
                            {item.qaScore}
                          </span>
                          {item.criticalIssues > 0 && (
                            <Badge variant="destructive" className="text-xs">
                              {item.criticalIssues} critical
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">N/A</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <div className="h-2 bg-secondary rounded-full overflow-hidden w-20">
                            <div
                              className="h-full bg-primary"
                              style={{
                                width: `${((item.annotatedFields || 0) / (item.totalFields || 1)) * 100}%`
                              }}
                            />
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {item.annotatedFields}/{item.totalFields}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {item.annotationStatus === 'completed' && (
                        <Badge variant="default" className="bg-green-600">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Completed
                        </Badge>
                      )}
                      {item.annotationStatus === 'in_progress' && (
                        <Badge variant="default" className="bg-blue-600">
                          <Clock className="h-3 w-3 mr-1" />
                          In Progress
                        </Badge>
                      )}
                      {item.annotationStatus === 'not_started' && (
                        <Badge variant="secondary">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Not Started
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        onClick={() => router.push(`/annotate/${item.id}`)}
                        size="sm"
                      >
                        Annotate
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
