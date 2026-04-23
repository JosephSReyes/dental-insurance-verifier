'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  Loader2,
  ExternalLink,
  Info,
} from 'lucide-react';
import { LabelStudioEmbed } from '@/components/annotations/LabelStudioEmbed';

interface Field {
  field: string;
  value: any;
  mapper: string;
  sourcePath: string;
  reasoning: string;
  confidence?: number;
}

interface TaskData {
  verificationId: string;
  fields: Field[];
  context: {
    patientName: string;
    insuranceProvider: string;
    portalType: string;
    officeKey: string;
    verificationDate: string;
  };
  flattenedPaths: Array<{ path: string; value: any; type: string }>;
}

export default function AnnotatePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [taskData, setTaskData] = useState<TaskData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [annotatedFields, setAnnotatedFields] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadTaskData();
  }, [params.id]);

  const loadTaskData = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/label-studio/tasks/${params.id}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to load task data');
      }

      const data = await response.json();
      setTaskData(data);

      // Auto-select first field
      if (data.fields.length > 0) {
        setSelectedField(data.fields[0].field);
      }
    } catch (err: any) {
      console.error('Error loading task data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAnnotationComplete = (field: string) => {
    setAnnotatedFields(prev => new Set([...prev, field]));

    // Auto-advance to next field
    if (taskData) {
      const currentIndex = taskData.fields.findIndex(f => f.field === field);
      if (currentIndex < taskData.fields.length - 1) {
        setSelectedField(taskData.fields[currentIndex + 1].field);
      }
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-muted-foreground">Loading annotation task...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !taskData) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error || 'Failed to load task data'}
          </AlertDescription>
        </Alert>
        <Button onClick={() => router.back()} className="mt-4" variant="outline">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Go Back
        </Button>
      </div>
    );
  }

  const selectedFieldData = taskData.fields.find(f => f.field === selectedField);
  const progress = (annotatedFields.size / taskData.fields.length) * 100;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Button onClick={() => router.back()} variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-3xl font-bold mt-2">Annotate Verification</h1>
          <p className="text-muted-foreground">
            Validation of LLM JSON path extraction quality
          </p>
        </div>
        <Button
          onClick={() => window.open(
            process.env.NEXT_PUBLIC_LABEL_STUDIO_URL || 'http://localhost:8080',
            '_blank'
          )}
          variant="outline"
        >
          <ExternalLink className="h-4 w-4 mr-2" />
          Open Label Studio
        </Button>
      </div>

      {/* Context Card */}
      <Card>
        <CardHeader>
          <CardTitle>Verification Context</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Patient</p>
              <p className="font-medium">{taskData.context.patientName}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Insurance</p>
              <p className="font-medium">{taskData.context.insuranceProvider}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Portal</p>
              <Badge variant="secondary">{taskData.context.portalType}</Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Office</p>
              <Badge variant="outline">{taskData.context.officeKey}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Progress */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Annotation Progress</span>
              <span className="font-medium">
                {annotatedFields.size} / {taskData.fields.length} fields
              </span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Field List Sidebar */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Fields to Annotate</CardTitle>
            <CardDescription>
              Click a field to start annotating
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="space-y-1">
              {taskData.fields.map((field, index) => (
                <button
                  key={field.field}
                  onClick={() => setSelectedField(field.field)}
                  className={`w-full text-left px-4 py-3 border-b hover:bg-accent transition-colors ${
                    selectedField === field.field ? 'bg-accent' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-sm">{field.field}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {String(field.value).substring(0, 30)}...
                      </p>
                    </div>
                    {annotatedFields.has(field.field) && (
                      <CheckCircle className="h-4 w-4 text-green-500 ml-2 flex-shrink-0" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Annotation Interface */}
        <div className="lg:col-span-3 space-y-4">
          {selectedFieldData && (
            <>
              {/* Field Info */}
              <Card>
                <CardHeader>
                  <CardTitle>Field Details: {selectedFieldData.field}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Extracted Value</p>
                      <p className="font-mono text-sm bg-secondary p-2 rounded">
                        {String(selectedFieldData.value)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Source Path</p>
                      <p className="font-mono text-sm bg-secondary p-2 rounded">
                        {selectedFieldData.sourcePath}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">AI Reasoning</p>
                    <p className="text-sm p-2 bg-secondary rounded">
                      {selectedFieldData.reasoning}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge variant="outline">
                      Mapper: {selectedFieldData.mapper}
                    </Badge>
                    {selectedFieldData.confidence && (
                      <Badge variant="secondary">
                        Confidence: {(selectedFieldData.confidence * 100).toFixed(0)}%
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Annotation Instructions */}
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <strong>What to validate:</strong> Check if the LLM found the correct JSON path,
                  used effective search terms, and extracted the right value. Document any edge cases
                  or portal-specific quirks you notice.
                </AlertDescription>
              </Alert>

              {/* Label Studio Embed or Link */}
              <Tabs defaultValue="simple">
                <TabsList>
                  <TabsTrigger value="simple">Quick Annotation</TabsTrigger>
                  <TabsTrigger value="label-studio">Full Label Studio</TabsTrigger>
                </TabsList>

                <TabsContent value="simple">
                  <Card>
                    <CardContent className="pt-6">
                      <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          Quick annotation interface coming soon. For now, use the "Full Label Studio" tab.
                        </AlertDescription>
                      </Alert>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="label-studio">
                  <Alert className="mb-4">
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      Open Label Studio directly to annotate this field. Task ID: {params.id}_{selectedFieldData.field}
                    </AlertDescription>
                  </Alert>
                  <Button
                    onClick={() => window.open(
                      `${process.env.NEXT_PUBLIC_LABEL_STUDIO_URL || 'http://localhost:8080'}/projects/1/data`,
                      '_blank'
                    )}
                    className="w-full"
                    size="lg"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open in Label Studio
                  </Button>
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
