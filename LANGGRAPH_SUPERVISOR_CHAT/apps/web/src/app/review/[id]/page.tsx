'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, CheckCircle, AlertTriangle, Info, ThumbsUp, ThumbsDown, Save, Send, ArrowLeft, Eye } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface FieldReviewState {
  status: 'correct' | 'incorrect' | 'flagged' | 'unchecked';
  correctedValue?: string;
  errorType?: string;
  errorSource?: string;
  reasoning?: string;
  confidence?: number;
}

export default function ReviewPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [verificationData, setVerificationData] = useState<any>(null);
  const [qaReport, setQaReport] = useState<any>(null);
  const [metadata, setMetadata] = useState<any>(null);
  
  const [fieldReviews, setFieldReviews] = useState<Record<string, FieldReviewState>>({});
  const [approval, setApproval] = useState<'approved' | 'approved_with_corrections' | 'rejected'>('approved');
  const [difficulty, setDifficulty] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [reviewerId, setReviewerId] = useState('');
  const [notes, setNotes] = useState('');
  const [startTime] = useState(Date.now());

  const [currentSection, setCurrentSection] = useState<string>('all');

  useEffect(() => {
    loadVerification();
  }, [params.id]);

  const loadVerification = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/verification/${params.id}`);
      const data = await response.json();
      
      if (data.error) {
        console.error('Error:', data.error);
        return;
      }

      setVerificationData(data.verificationData);
      setQaReport(data.qaReport);
      setMetadata(data.metadata);
      
      initializeFieldReviews(data.verificationData, data.qaReport);
    } catch (error) {
      console.error('Failed to load verification:', error);
    } finally {
      setLoading(false);
    }
  };

  const initializeFieldReviews = (verification: any, qa: any) => {
    const reviews: Record<string, FieldReviewState> = {};
    
    const allFields = getAllFields(verification);
    for (const field of allFields) {
      reviews[field] = { status: 'unchecked' };
    }

    setFieldReviews(reviews);
  };

  const getAllFields = (data: any): string[] => {
    const fields = [
      'patient_full_name', 'patient_dob', 'subscriber_name', 'subscriber_dob',
      'subscriber_id', 'group_number', 'insurance_company', 'plan_name',
      'effective_date', 'termination_date', 'network_status',
      'preventive_coverage', 'basic_coverage', 'major_coverage',
      'yearly_maximum', 'yearly_maximum_used', 'yearly_deductible', 'yearly_deductible_used',
      'orthodontic_coverage', 'ortho_lifetime_maximum', 'ortho_age_limit',
      'waiting_periods.preventive', 'waiting_periods.basic', 'waiting_periods.major',
      'dependent_coverage_age', 'missing_tooth_clause', 'benefit_period'
    ];
    return fields;
  };

  const getFieldValue = (fieldPath: string): any => {
    if (!verificationData) return null;
    
    const parts = fieldPath.split('.');
    let value = verificationData;
    for (const part of parts) {
      value = value?.[part];
    }
    return value;
  };

  const getFieldMetadata = (fieldPath: string): any => {
    if (!metadata?.mapperResults) return null;
    
    const fieldName = fieldPath.split('.').pop();
    
    for (const mapper of Object.values(metadata.mapperResults)) {
      const mapperData = mapper as any;
      if (mapperData?.fields?.[fieldName!]) {
        return mapperData.fields[fieldName];
      }
    }
    
    return null;
  };

  const getQAIssue = (fieldPath: string): any => {
    if (!qaReport?.issues) return null;
    
    return qaReport.issues.find((issue: any) => 
      issue.field === fieldPath || issue.field.includes(fieldPath)
    );
  };

  const updateFieldReview = (field: string, updates: Partial<FieldReviewState>) => {
    setFieldReviews(prev => ({
      ...prev,
      [field]: { ...prev[field], ...updates }
    }));
  };

  const handleSubmit = async () => {
    const timeSpent = Math.round((Date.now() - startTime) / 1000);
    
    const corrections = Object.entries(fieldReviews)
      .filter(([_, review]) => review.status === 'incorrect')
      .map(([field, review]) => ({
        field,
        section: getSectionForField(field),
        aiValue: getFieldValue(field),
        correctedValue: review.correctedValue,
        errorType: review.errorType,
        errorSource: review.errorSource,
        humanReasoning: review.reasoning,
        confidence: review.confidence
      }));

    const feedback = {
      verificationId: params.id,
      reviewerId,
      approval,
      corrections,
      difficulty,
      notes,
      timeSpentSeconds: timeSpent,
      reviewedAt: new Date().toISOString(),
      fieldReviews: Object.entries(fieldReviews).map(([field, review]) => ({
        field,
        status: review.status,
        aiValue: getFieldValue(field),
        humanValue: review.correctedValue || getFieldValue(field),
        reasoning: review.reasoning
      }))
    };

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verificationData,
          qaReport,
          feedback
        })
      });

      if (response.ok) {
        alert('Feedback submitted successfully!');
        router.push('/review/queue');
      }
    } catch (error) {
      console.error('Failed to submit feedback:', error);
      alert('Failed to submit feedback');
    }
  };

  const getSectionForField = (field: string): string => {
    if (field.includes('patient') || field.includes('subscriber')) return 'Patient & Subscriber Information';
    if (field.includes('member') || field.includes('group') || field.includes('insurance') || field.includes('plan')) return 'Insurance Information';
    if (field.includes('coverage') || field.includes('maximum') || field.includes('deductible') || field.includes('network')) return 'Coverage & Benefits';
    if (field.includes('ortho')) return 'Orthodontic Benefits';
    if (field.includes('waiting')) return 'Waiting Periods';
    return 'Other';
  };

  const getFieldLabel = (field: string): string => {
    return field
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
      .replace(/\./g, ' → ');
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'info': return <Info className="h-4 w-4 text-blue-500" />;
      default: return null;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading verification...</div>
      </div>
    );
  }

  if (!verificationData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg text-red-600">Verification not found</div>
      </div>
    );
  }

  const allFields = getAllFields(verificationData);
  const reviewedCount = Object.values(fieldReviews).filter(r => r.status !== 'unchecked').length;
  const progressPercent = Math.round((reviewedCount / allFields.length) * 100);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => router.push('/review/queue')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Queue
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {verificationData.patient_full_name}
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {verificationData.insurance_company} | {verificationData.reference_number}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {qaReport && (
              <Badge variant={qaReport.passed ? 'default' : 'destructive'} className="text-lg px-4 py-2">
                QA Score: {qaReport.overallScore}%
              </Badge>
            )}
            <div className="text-right">
              <div className="text-sm font-medium text-slate-700">Progress</div>
              <div className="text-2xl font-bold text-blue-600">{progressPercent}%</div>
              <div className="text-xs text-slate-500">{reviewedCount}/{allFields.length} fields</div>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Field-by-Field Review</CardTitle>
            <CardDescription>Review each extracted field with AI reasoning, QA analysis, and provide your expert assessment</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <div className="grid grid-cols-12 gap-4 px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-t font-semibold text-xs uppercase text-slate-600">
                <div className="col-span-2">Field</div>
                <div className="col-span-2">AI Extraction</div>
                <div className="col-span-2">QA Analysis</div>
                <div className="col-span-3">Your Review</div>
                <div className="col-span-3">Actions</div>
              </div>

              {allFields.map((field) => {
                const value = getFieldValue(field);
                const fieldMeta = getFieldMetadata(field);
                const qaIssue = getQAIssue(field);
                const review = fieldReviews[field];

                return (
                  <div
                    key={field}
                    className={`grid grid-cols-12 gap-4 px-4 py-3 border-b hover:bg-slate-50 dark:hover:bg-slate-800 ${
                      review.status === 'incorrect' ? 'bg-red-50 dark:bg-red-900/10' :
                      review.status === 'flagged' ? 'bg-yellow-50 dark:bg-yellow-900/10' :
                      review.status === 'correct' ? 'bg-green-50 dark:bg-green-900/10' : ''
                    }`}
                  >
                    <div className="col-span-2">
                      <div className="font-medium text-sm">{getFieldLabel(field)}</div>
                      <div className="text-xs text-slate-500 mt-1">{field}</div>
                    </div>

                    <div className="col-span-2">
                      <div className="text-sm font-mono bg-white dark:bg-slate-900 px-2 py-1 rounded border">
                        {value || <span className="text-slate-400">null</span>}
                      </div>
                      {fieldMeta && (
                        <div className="mt-1 text-xs space-y-1">
                          <div className="text-slate-600">
                            <span className="font-medium">Path:</span> {fieldMeta.sourcePath}
                          </div>
                          <div className="text-slate-600">
                            <Eye className="inline h-3 w-3 mr-1" />
                            {fieldMeta.reasoning?.substring(0, 60)}...
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="col-span-2">
                      {qaIssue ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1">
                            {getSeverityIcon(qaIssue.severity)}
                            <span className="text-xs font-medium">{qaIssue.severity.toUpperCase()}</span>
                          </div>
                          <div className="text-xs text-slate-600">{qaIssue.issue}</div>
                          <div className="text-xs text-blue-600">{qaIssue.suggestedFix}</div>
                        </div>
                      ) : (
                        <span className="text-xs text-green-600">✓ No issues</span>
                      )}
                    </div>

                    <div className="col-span-3">
                      {review.status === 'incorrect' && (
                        <div className="space-y-2">
                          <Input
                            placeholder="Corrected value"
                            value={review.correctedValue || ''}
                            onChange={(e) => updateFieldReview(field, { correctedValue: e.target.value })}
                            className="text-sm"
                          />
                          <Textarea
                            placeholder="Why is this incorrect?"
                            value={review.reasoning || ''}
                            onChange={(e) => updateFieldReview(field, { reasoning: e.target.value })}
                            rows={2}
                            className="text-xs"
                          />
                        </div>
                      )}
                      {review.status === 'flagged' && (
                        <Textarea
                          placeholder="What's concerning about this?"
                          value={review.reasoning || ''}
                          onChange={(e) => updateFieldReview(field, { reasoning: e.target.value })}
                          rows={2}
                          className="text-xs"
                        />
                      )}
                      {review.status === 'correct' && (
                        <div className="text-sm text-green-600 font-medium">✓ Confirmed Correct</div>
                      )}
                      {review.status === 'unchecked' && (
                        <div className="text-sm text-slate-400">Not reviewed</div>
                      )}
                    </div>

                    <div className="col-span-3 flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={review.status === 'correct' ? 'default' : 'outline'}
                        onClick={() => updateFieldReview(field, { status: 'correct' })}
                        className="flex-1"
                      >
                        ✓ Correct
                      </Button>
                      <Button
                        size="sm"
                        variant={review.status === 'incorrect' ? 'destructive' : 'outline'}
                        onClick={() => updateFieldReview(field, { status: 'incorrect' })}
                        className="flex-1"
                      >
                        ✗ Wrong
                      </Button>
                      <Button
                        size="sm"
                        variant={review.status === 'flagged' ? 'default' : 'outline'}
                        onClick={() => updateFieldReview(field, { status: 'flagged' })}
                        className="flex-1 bg-yellow-600"
                      >
                        🚩 Flag
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-blue-200 bg-blue-50 dark:bg-slate-800">
          <CardHeader>
            <CardTitle>Submit Review</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Reviewer ID / Email *</label>
                <Input
                  value={reviewerId}
                  onChange={(e) => setReviewerId(e.target.value)}
                  placeholder="your.email@example.com"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Difficulty Rating *</label>
                <Select value={difficulty.toString()} onValueChange={(v) => setDifficulty(parseInt(v) as any)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 - Very Easy</SelectItem>
                    <SelectItem value="2">2 - Easy</SelectItem>
                    <SelectItem value="3">3 - Moderate</SelectItem>
                    <SelectItem value="4">4 - Hard</SelectItem>
                    <SelectItem value="5">5 - Very Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Approval Decision *</label>
              <div className="flex gap-3 mt-2">
                <Button
                  variant={approval === 'approved' ? 'default' : 'outline'}
                  onClick={() => setApproval('approved')}
                  className="flex-1"
                >
                  <ThumbsUp className="mr-2 h-4 w-4" />
                  Approved
                </Button>
                <Button
                  variant={approval === 'approved_with_corrections' ? 'default' : 'outline'}
                  onClick={() => setApproval('approved_with_corrections')}
                  className="flex-1"
                >
                  <Save className="mr-2 h-4 w-4" />
                  Approved with Corrections
                </Button>
                <Button
                  variant={approval === 'rejected' ? 'destructive' : 'outline'}
                  onClick={() => setApproval('rejected')}
                  className="flex-1"
                >
                  <ThumbsDown className="mr-2 h-4 w-4" />
                  Rejected
                </Button>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Additional Notes</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any additional observations, portal issues, or comments..."
                className="mt-1"
                rows={4}
              />
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" size="lg">
                Save Draft
              </Button>
              <Button
                size="lg"
                onClick={handleSubmit}
                disabled={!reviewerId}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Send className="mr-2 h-4 w-4" />
                Submit Review
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
