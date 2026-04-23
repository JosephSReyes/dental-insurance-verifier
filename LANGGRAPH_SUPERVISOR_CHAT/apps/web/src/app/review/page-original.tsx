'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, CheckCircle, AlertTriangle, Info, ChevronDown, ChevronRight, Search, Filter, ThumbsUp, ThumbsDown, Save, Send, Moon, Sun, RotateCcw, Check, X, BarChart3, Eye, EyeOff, Lightbulb } from 'lucide-react';
import { useTheme } from 'next-themes';
import { VerificationContextBadges } from '@/components/VerificationContextBadges';
import { LearningIndicator } from '@/components/LearningIndicator';
import { ConfidenceMeter } from '@/components/ConfidenceMeter';
import Link from 'next/link';

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
}

interface FieldReviewState {
  status: 'correct' | 'incorrect' | 'flagged' | 'unchecked';
  correctedValue?: string;
  errorType?: string;
  errorSource?: string;
  reasoning?: string;
  confidence?: number;
}

export default function ReviewQueuePage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [verificationData, setVerificationData] = useState<any>(null);
  const [qaReport, setQaReport] = useState<any>(null);
  const [metadata, setMetadata] = useState<any>(null);
  const [existingFeedback, setExistingFeedback] = useState<any>(null);

  const [fieldReviews, setFieldReviews] = useState<Record<string, FieldReviewState>>({});
  const [approval, setApproval] = useState<'approved' | 'approved_with_corrections' | 'rejected'>('approved');
  const [difficulty, setDifficulty] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [reviewerId, setReviewerId] = useState('');
  const [notes, setNotes] = useState('');
  const [startTime, setStartTime] = useState(Date.now());

  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'reviewed'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOffice, setFilterOffice] = useState<string>('all');
  const [filterPortal, setFilterPortal] = useState<string>('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterQAMin, setFilterQAMin] = useState<number>(0);
  const [filterQAMax, setFilterQAMax] = useState<number>(100);
  const [showFilters, setShowFilters] = useState(false);
  const [queueFilter, setQueueFilter] = useState<'all' | 'high-priority' | 'low-confidence' | 'critical-issues'>('all');

  // NEW: Field view filter
  const [fieldViewFilter, setFieldViewFilter] = useState<'needs-attention' | 'all' | 'reviewed' | 'pending'>('needs-attention');
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadQueue();
  }, [filterStatus]);

  const loadQueue = async () => {
    setLoading(true);
    try {
      const queryParam = filterStatus === 'all' ? '' : `?status=${filterStatus}`;
      const response = await fetch(`/api/queue${queryParam}`);
      const data = await response.json();

      if (data.error) {
        console.error('Error loading queue:', data.error);
        return;
      }

      setItems(data.items || []);
    } catch (error) {
      console.error('Failed to load queue:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadVerificationDetails = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setVerificationData(null);
      setQaReport(null);
      setMetadata(null);
      setExistingFeedback(null);
      return;
    }

    try {
      const response = await fetch(`/api/verification/${id}`);
      const data = await response.json();

      if (data.error) {
        console.error('Error:', data.error);
        return;
      }

      setVerificationData(data.verificationData);
      setQaReport(data.qaReport);
      setMetadata(data.metadata);
      setExistingFeedback(data.existingFeedback);
      setExpandedId(id);
      setStartTime(Date.now());

      // Load existing feedback into the form if it exists
      if (data.existingFeedback) {
        loadExistingFeedback(data.existingFeedback, data.verificationData);
      } else {
        initializeFieldReviews(data.verificationData, data.qaReport);
      }
    } catch (error) {
      console.error('Failed to load verification:', error);
    }
  };

  const loadExistingFeedback = (feedback: any, verification: any) => {
    const reviews: Record<string, FieldReviewState> = {};
    const allFields = getAllFields(verification);

    // Initialize all fields
    for (const field of allFields) {
      reviews[field] = { status: 'unchecked' };
    }

    // Load field reviews from feedback
    if (feedback.fieldReviews && Array.isArray(feedback.fieldReviews)) {
      for (const review of feedback.fieldReviews) {
        if (review.field && reviews[review.field]) {
          reviews[review.field] = {
            status: review.status || 'unchecked',
            correctedValue: review.humanValue !== review.aiValue ? review.humanValue : undefined,
            reasoning: review.reasoning
          };
        }
      }
    }

    // Load corrections from fieldCorrections
    if (feedback.fieldCorrections && Array.isArray(feedback.fieldCorrections)) {
      for (const correction of feedback.fieldCorrections) {
        if (correction.field && reviews[correction.field]) {
          reviews[correction.field] = {
            status: 'incorrect',
            correctedValue: correction.correctedValue,
            errorType: correction.errorType,
            errorSource: correction.errorSource,
            reasoning: correction.humanReasoning,
            confidence: correction.confidence
          };
        }
      }
    }

    setFieldReviews(reviews);

    // Load reviewer info
    if (feedback.reviewerInfo) {
      setReviewerId(feedback.reviewerInfo.reviewerId || '');
      setDifficulty(feedback.difficultyRating || 3);
      setNotes(feedback.additionalNotes || '');
      setApproval(feedback.overallApproval || 'approved');
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
    const baseFields = [
      // Patient & Subscriber Information
      'patient_full_name',
      'patient_dob',
      'subscriber_name',
      'subscriber_dob',
      'subscriber_id',
      'group_number',

      // Insurance Information
      'insurance_company',
      'plan_name',
      'claims_address',
      'insurance_phone',
      'payor_id',
      'network_status',
      'fee_schedule',
      'benefit_period',
      'effective_date',
      'termination_date',

      // Coverage & Benefits
      'preventive_coverage',
      'basic_coverage',
      'major_coverage',
      'yearly_maximum',
      'yearly_maximum_used',
      'yearly_deductible',
      'yearly_deductible_used',
      'dependent_coverage_age',
      'missing_tooth_clause',

      // Orthodontic Benefits
      'ortho_lifetime_maximum',
      'ortho_coverage_percentage',
      'ortho_age_limit',
      'ortho_deductible',
      'ortho_payment_schedule',

      // Waiting Periods
      'waiting_periods.preventive',
      'waiting_periods.basic',
      'waiting_periods.major',

      // Verification Information
      'verified_by',
      'verification_date',
      'representative',
      'reference_number'
    ];

    // Add procedure detail fields
    const procedureFields: string[] = [];
    if (data?.procedure_details && Array.isArray(data.procedure_details)) {
      data.procedure_details.forEach((proc: any, idx: number) => {
        procedureFields.push(
          `procedure_details[${idx}].code`,
          `procedure_details[${idx}].description`,
          `procedure_details[${idx}].category`,
          `procedure_details[${idx}].coverage_percent`,
          `procedure_details[${idx}].network_used`,
          `procedure_details[${idx}].deductible_applies`,
          `procedure_details[${idx}].maximum_applies`,
          `procedure_details[${idx}].frequency_limitation`,
          `procedure_details[${idx}].frequency_shared_codes`,
          `procedure_details[${idx}].age_limitation`,
          `procedure_details[${idx}].waiting_period`,
          `procedure_details[${idx}].pre_auth_required`
        );
      });
    }

    // Add treatment history fields (stored as recent_procedures in verification data)
    const treatmentFields: string[] = [];
    if (data?.treatment_history && Array.isArray(data.treatment_history)) {
      data.treatment_history.forEach((record: any, idx: number) => {
        treatmentFields.push(
          `treatment_history[${idx}].serviceDate`,
          `treatment_history[${idx}].procedureCode`,
          `treatment_history[${idx}].description`,
          `treatment_history[${idx}].tooth`,
          `treatment_history[${idx}].surface`,
          `treatment_history[${idx}].status`
        );
      });
    }

    // Also check for recent_procedures (alternative field name used in BCBS verifications)
    if (data?.recent_procedures && Array.isArray(data.recent_procedures)) {
      data.recent_procedures.forEach((record: any, idx: number) => {
        treatmentFields.push(
          `recent_procedures[${idx}].serviceDate`,
          `recent_procedures[${idx}].code`,
          `recent_procedures[${idx}].description`,
          `recent_procedures[${idx}].toothNumber`,
          `recent_procedures[${idx}].surfaces`
        );
      });
    }

    return [...baseFields, ...procedureFields, ...treatmentFields];
  };

  const getFieldValue = (fieldPath: string): any => {
    if (!verificationData) return null;

    // Handle array notation like procedure_details[0].code
    const arrayMatch = fieldPath.match(/^(\w+)\[(\d+)\]\.(.+)$/);
    if (arrayMatch) {
      const [, arrayName, index, fieldName] = arrayMatch;
      const array = verificationData[arrayName];
      if (Array.isArray(array) && array[parseInt(index)]) {
        return array[parseInt(index)][fieldName];
      }
      return null;
    }

    // Handle regular dot notation
    const parts = fieldPath.split('.');
    let value = verificationData;
    for (const part of parts) {
      value = value?.[part];
    }
    return value;
  };

  const getFieldMetadata = (fieldPath: string): any => {
    // Handle array notation like procedure_details[0].code
    const arrayMatch = fieldPath.match(/^(\w+)\[(\d+)\]\.(.+)$/);
    if (arrayMatch) {
      const [, arrayName, index, fieldName] = arrayMatch;
      const array = verificationData?.[arrayName];
      if (Array.isArray(array) && array[parseInt(index)]) {
        const item = array[parseInt(index)];
        // Return extraction reasoning from the item itself
        return {
          value: item[fieldName],
          sourcePath: item.source_path || 'unknown',
          reasoning: item.extraction_reasoning || 'No reasoning provided',
          confidence: item.extraction_confidence
        };
      }
      return null;
    }

    const fieldName = fieldPath.split('.').pop() || fieldPath;

    if (verificationData?._metadata?.[fieldName]) {
      return verificationData._metadata[fieldName];
    }

    if (metadata?.mapperResults) {
      for (const mapper of Object.values(metadata.mapperResults)) {
        const mapperData = mapper as any;
        if (mapperData?.fields?.[fieldName]) {
          return mapperData.fields[fieldName];
        }
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

  const getQACheck = (fieldPath: string): any => {
    if (!qaReport?.checks) return null;

    // Handle array notation like procedure_details[0].code
    const arrayMatch = fieldPath.match(/^(\w+)\[(\d+)\]\.(.+)$/);
    if (arrayMatch) {
      const [, arrayName, index, fieldName] = arrayMatch;
      const value = getFieldValue(fieldPath);

      // Generate synthetic QA check for procedure/treatment fields
      if (arrayName === 'procedure_details') {
        const proc = verificationData?.procedure_details?.[parseInt(index)];
        if (!proc) return null;

        // Define validation rules for each field
        let passed = true;
        let reasoning = '';

        switch (fieldName) {
          case 'code':
            passed = !!value && /^D\d{4}$/.test(value);
            reasoning = passed
              ? `Procedure code format is valid (${value})`
              : `Procedure code missing or invalid format (expected D#### format)`;
            break;
          case 'description':
            passed = !!value && value !== 'N/A' && value.length > 5;
            reasoning = passed
              ? `Description is present and detailed (${value.length} characters)`
              : `Description missing or too short (should be at least 5 characters)`;
            break;
          case 'coverage_percent':
            passed = typeof value === 'number' && value >= 0 && value <= 100;
            reasoning = passed
              ? `Coverage percentage is valid (${value}%)`
              : `Coverage percentage invalid or out of range (0-100)`;
            break;
          case 'frequency_limitation':
            passed = value === null || (typeof value === 'string' && value.length > 0);
            reasoning = passed
              ? value ? `Frequency limitation is specified: ${value}` : `No frequency limitation (null is valid)`
              : `Frequency limitation has invalid format`;
            break;
          case 'pre_auth_required':
            passed = typeof value === 'boolean';
            reasoning = passed
              ? `Pre-authorization requirement is clear: ${value ? 'Required' : 'Not required'}`
              : `Pre-authorization field should be boolean`;
            break;
          default:
            passed = value !== undefined;
            reasoning = passed ? `Field has value: ${value}` : `Field is undefined`;
        }

        return {
          section: 'Procedure Details',
          field: fieldPath,
          passed,
          checkType: 'format',
          actualValue: value,
          reasoning: reasoning
        };
      }

      if (arrayName === 'treatment_history') {
        const record = verificationData?.treatment_history?.[parseInt(index)];
        if (!record) return null;

        let passed = true;
        let reasoning = '';

        switch (fieldName) {
          case 'serviceDate':
            passed = !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
            reasoning = passed
              ? `Service date is in valid ISO-8601 format (${value})`
              : `Service date missing or invalid format (expected YYYY-MM-DD)`;
            break;
          case 'procedureCode':
            passed = !!value && /^D\d{4}$/.test(value);
            reasoning = passed
              ? `Procedure code format is valid (${value})`
              : `Procedure code missing or invalid format (expected D#### format)`;
            break;
          case 'description':
            passed = !!value && value.length > 5;
            reasoning = passed
              ? `Description is present (${value.length} characters)`
              : `Description missing or too short`;
            break;
          default:
            passed = value !== undefined && value !== null;
            reasoning = passed ? `Field has value: ${value}` : `Field is null or undefined`;
        }

        return {
          section: 'Treatment History',
          field: fieldPath,
          passed,
          checkType: 'format',
          actualValue: value,
          reasoning: reasoning
        };
      }
    }

    return qaReport.checks.find((check: any) =>
      check.field === fieldPath || check.field.includes(fieldPath)
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
      verificationId: expandedId,
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
          feedback,
          reviewType: 'human_feedback'
        })
      });

      if (response.ok) {
        alert('Feedback submitted successfully!');
        setExpandedId(null);
        loadQueue();
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
    if (field.includes('procedure_details')) return 'Procedure Details';
    if (field.includes('treatment_history') || field.includes('recent_procedures')) return 'Treatment History';
    return 'Other';
  };

  const getFieldLabel = (field: string): string => {
    // Handle array notation like procedure_details[0].code or recent_procedures[0].code
    const arrayMatch = field.match(/^(\w+)\[(\d+)\]\.(.+)$/);
    if (arrayMatch) {
      const [, arrayName, index, fieldName] = arrayMatch;
      let itemLabel = `#${parseInt(index) + 1}`;

      if (arrayName === 'recent_procedures') {
        const proc = verificationData?.recent_procedures?.[parseInt(index)];
        if (proc?.code) {
          // Pad the code to 4 digits (e.g., 431 -> D0431, 1110 -> D1110)
          const paddedCode = String(proc.code).padStart(4, '0');
          itemLabel = `D${paddedCode}`;
        } else if (proc?.description) {
          itemLabel = proc.description.substring(0, 20);
        }
      } else {
        itemLabel = verificationData?.[arrayName]?.[parseInt(index)]?.code || itemLabel;
      }

      const formattedFieldName = fieldName
        .replace(/([A-Z])/g, ' $1')
        .split('_')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
        .trim();

      return `${formattedFieldName} (${itemLabel})`;
    }

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

  const getStatusBadge = (item: QueueItem) => {
    if (item.status === 'reviewed') {
      return <Badge className="bg-green-600">✓ Reviewed</Badge>;
    }
    if (item.qaScore === null) {
      return <Badge variant="secondary">No QA</Badge>;
    }
    if (item.criticalIssues > 0) {
      return <Badge className="bg-red-600 text-white border-red-700">🔴 {item.criticalIssues} Critical</Badge>;
    }
    if (item.qaScore < 70) {
      return <Badge className="bg-red-600 text-white border-red-700">❌ Failed</Badge>;
    }
    if (item.qaScore < 90) {
      return <Badge className="bg-yellow-600">⚠️ {item.warnings} Warnings</Badge>;
    }
    return <Badge className="bg-blue-600">⏳ Pending</Badge>;
  };

  const filteredItems = items.filter(item => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matches = (
        item.patientName.toLowerCase().includes(query) ||
        item.insuranceProvider.toLowerCase().includes(query) ||
        item.id.toLowerCase().includes(query) ||
        item.officeKey.toLowerCase().includes(query)
      );
      if (!matches) return false;
    }

    if (filterOffice !== 'all' && item.officeKey !== filterOffice) return false;
    if (filterPortal !== 'all' && item.portalType !== filterPortal) return false;

    if (filterDateFrom) {
      const itemDate = new Date(item.verificationDate);
      const fromDate = new Date(filterDateFrom);
      if (itemDate < fromDate) return false;
    }

    if (filterDateTo) {
      const itemDate = new Date(item.verificationDate);
      const toDate = new Date(filterDateTo);
      if (itemDate > toDate) return false;
    }

    if (item.qaScore !== null) {
      if (item.qaScore < filterQAMin || item.qaScore > filterQAMax) return false;
    }

    // Apply queue filters
    if (queueFilter === 'high-priority') {
      return item.qaScore !== null && item.qaScore < 50;
    } else if (queueFilter === 'low-confidence') {
      return item.qaScore !== null && item.qaScore < 70;
    } else if (queueFilter === 'critical-issues') {
      return item.criticalIssues > 0;
    }

    return true;
  });

  const uniqueOffices = Array.from(new Set(items.map(i => i.officeKey)));
  const uniquePortals = Array.from(new Set(items.map(i => i.portalType)));

  const reviewedCount = Object.values(fieldReviews).filter(r => r.status !== 'unchecked').length;
  const totalFields = getAllFields(verificationData || {}).length;
  const progressPercent = totalFields > 0 ? Math.round((reviewedCount / totalFields) * 100) : 0;

  // NEW: Filter fields based on view mode
  const getFilteredFields = () => {
    const allFields = getAllFields(verificationData || {});

    switch (fieldViewFilter) {
      case 'needs-attention':
        return allFields.filter(field => {
          const qaIssue = getQAIssue(field);
          const qaCheck = getQACheck(field);
          const review = fieldReviews[field];

          // Show if: has QA issue, QA check failed, or already marked incorrect/flagged
          return qaIssue || (qaCheck && !qaCheck.passed) || review.status === 'incorrect' || review.status === 'flagged';
        });
      case 'reviewed':
        return allFields.filter(field => fieldReviews[field].status !== 'unchecked');
      case 'pending':
        return allFields.filter(field => fieldReviews[field].status === 'unchecked');
      case 'all':
      default:
        return allFields;
    }
  };

  const toggleFieldExpanded = (field: string) => {
    setExpandedFields(prev => {
      const newSet = new Set(prev);
      if (newSet.has(field)) {
        newSet.delete(field);
      } else {
        newSet.add(field);
      }
      return newSet;
    });
  };

  const approveAllClean = () => {
    const updates: Record<string, FieldReviewState> = {};
    getAllFields(verificationData).forEach(field => {
      const qaIssue = getQAIssue(field);
      const qaCheck = getQACheck(field);

      // Auto-approve if no issues and QA passed
      if (!qaIssue && (!qaCheck || qaCheck.passed)) {
        updates[field] = { ...fieldReviews[field], status: 'correct' };
      }
    });
    setFieldReviews(prev => ({ ...prev, ...updates }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-6">
      <div className="max-w-[1800px] mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              Verification Review Queue
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              Click any row to expand and review field-by-field
            </p>
          </div>
          <div className="flex gap-3 items-center">
            <Link href="/analytics">
              <Button variant="outline" size="sm">
                <BarChart3 className="mr-2 h-4 w-4" />
                Analytics
              </Button>
            </Link>
            {mounted && (
              <Button
                variant="outline"
                size="icon"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="h-9 w-9"
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Button
                variant={filterStatus === 'pending' ? 'default' : 'outline'}
                onClick={() => setFilterStatus('pending')}
              >
                Pending
              </Button>
              <Button
                variant={filterStatus === 'reviewed' ? 'default' : 'outline'}
                onClick={() => setFilterStatus('reviewed')}
              >
                Reviewed
              </Button>
              <Button
                variant={filterStatus === 'all' ? 'default' : 'outline'}
                onClick={() => setFilterStatus('all')}
              >
                All
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                variant={queueFilter === 'high-priority' ? 'default' : 'outline'}
                onClick={() => setQueueFilter('high-priority')}
                size="sm"
              >
                🔥 High Priority
              </Button>
              <Button
                variant={queueFilter === 'low-confidence' ? 'default' : 'outline'}
                onClick={() => setQueueFilter('low-confidence')}
                size="sm"
              >
                ⚠️ Low Confidence
              </Button>
              <Button
                variant={queueFilter === 'critical-issues' ? 'default' : 'outline'}
                onClick={() => setQueueFilter('critical-issues')}
                size="sm"
              >
                🚨 Critical Issues
              </Button>
              <Button
                variant={queueFilter === 'all' ? 'default' : 'outline'}
                onClick={() => setQueueFilter('all')}
                size="sm"
              >
                All
              </Button>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search by patient, insurance, ID, or office..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <Filter className="mr-2 h-4 w-4" />
                  Filters {showFilters ? '▲' : '▼'}
                </Button>
              </div>

              {showFilters && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <div>
                    <label className="text-sm font-medium">Office</label>
                    <Select value={filterOffice} onValueChange={setFilterOffice}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Offices</SelectItem>
                        {uniqueOffices.map(office => (
                          <SelectItem key={office} value={office}>{office}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Portal</label>
                    <Select value={filterPortal} onValueChange={setFilterPortal}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Portals</SelectItem>
                        {uniquePortals.map(portal => (
                          <SelectItem key={portal} value={portal}>{portal}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Date From</label>
                    <Input
                      type="date"
                      value={filterDateFrom}
                      onChange={(e) => setFilterDateFrom(e.target.value)}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium">Date To</label>
                    <Input
                      type="date"
                      value={filterDateTo}
                      onChange={(e) => setFilterDateTo(e.target.value)}
                      className="mt-1"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="text-sm font-medium">QA Score Range: {filterQAMin}% - {filterQAMax}%</label>
                    <div className="flex gap-2 mt-1">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={filterQAMin}
                        onChange={(e) => setFilterQAMin(parseInt(e.target.value) || 0)}
                        placeholder="Min"
                      />
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={filterQAMax}
                        onChange={(e) => setFilterQAMax(parseInt(e.target.value) || 100)}
                        placeholder="Max"
                      />
                    </div>
                  </div>

                  <div className="col-span-2 flex items-end">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setFilterOffice('all');
                        setFilterPortal('all');
                        setFilterDateFrom('');
                        setFilterDateTo('');
                        setFilterQAMin(0);
                        setFilterQAMax(100);
                      }}
                      className="w-full"
                    >
                      Clear Filters
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardHeader>

          <CardContent>
            {loading ? (
              <div className="text-center py-12 text-slate-500">Loading queue...</div>
            ) : filteredItems.length === 0 ? (
              <div className="text-center py-12 text-slate-500">No verifications found</div>
            ) : (
              <div className="space-y-2">
                {filteredItems.map((item) => (
                  <div key={item.id} className="border-2 rounded-lg overflow-hidden">
                    <div
                      className={`p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                        expandedId === item.id ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-400 dark:border-blue-600' : ''
                      }`}
                      onClick={() => loadVerificationDetails(item.id)}
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex items-center justify-center w-6">
                          {expandedId === item.id ? (
                            <ChevronDown className="h-5 w-5 text-blue-600" />
                          ) : (
                            <ChevronRight className="h-5 w-5 text-slate-400" />
                          )}
                        </div>

                        <div className="flex-1 grid grid-cols-6 gap-4 items-center">
                          <div>
                            {item.qaScore !== null && item.qaScore < 50 && (
                              <Badge variant="destructive" className="mb-1">
                                🔥 High Priority
                              </Badge>
                            )}
                            <div className="font-semibold text-slate-900 dark:text-slate-100">
                              {item.patientName}
                            </div>
                            <div className="text-xs text-slate-500">{item.id}</div>
                          </div>

                          <div className="text-sm">
                            <div className="font-medium">{item.insuranceProvider}</div>
                            <div className="text-xs text-slate-500">{item.officeKey}</div>
                          </div>

                          <div className="text-sm text-slate-600">
                            {new Date(item.verificationDate).toLocaleDateString()}
                          </div>

                          <div>
                            {getStatusBadge(item)}
                          </div>

                          <div className="text-center">
                            {item.qaScore !== null ? (
                              <div>
                                <div className={`text-2xl font-bold ${
                                  item.qaScore >= 90 ? 'text-green-600' :
                                  item.qaScore >= 70 ? 'text-yellow-600' : 'text-red-600'
                                }`}>
                                  {item.qaScore}%
                                </div>
                                <div className="text-xs text-slate-500">QA Score</div>
                              </div>
                            ) : (
                              <div className="text-sm text-slate-400">No QA</div>
                            )}
                          </div>

                          <div className="text-sm text-slate-600">
                            {item.portalType}
                          </div>
                        </div>
                      </div>
                    </div>

                    {expandedId === item.id && verificationData && (
                      <div className="border-t-2 bg-white dark:bg-slate-900/50">
                        <div className="p-6 space-y-6">
                          {existingFeedback && (
                            <div className="bg-green-50 dark:bg-green-900/20 border-2 border-green-300 p-4 rounded-lg">
                              <div className="flex items-center gap-2 mb-2">
                                <CheckCircle className="h-5 w-5 text-green-600" />
                                <h3 className="text-lg font-semibold text-green-800 dark:text-green-300">Already Reviewed</h3>
                              </div>
                              <div className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                                <p><strong>Reviewed by:</strong> {existingFeedback.reviewerInfo?.reviewerId || 'Unknown'}</p>
                                <p><strong>Reviewed at:</strong> {existingFeedback.reviewerInfo?.reviewedAt ? new Date(existingFeedback.reviewerInfo.reviewedAt).toLocaleString() : 'Unknown'}</p>
                                <p><strong>Approval:</strong> {existingFeedback.overallApproval || 'N/A'}</p>
                                <p><strong>Corrections made:</strong> {existingFeedback.fieldCorrections?.length || 0} fields</p>
                                {existingFeedback.additionalNotes && (
                                  <p><strong>Notes:</strong> {existingFeedback.additionalNotes}</p>
                                )}
                              </div>
                            </div>
                          )}

                          <div className="flex items-center justify-between bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/30 dark:to-purple-900/30 p-6 rounded-xl border-2 border-blue-200 dark:border-blue-800">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-3">
                                <h3 className="text-2xl font-bold text-blue-900 dark:text-blue-100">Field-by-Field Review</h3>
                                <VerificationContextBadges
                                  officeContext={{
                                    officeKey: verificationData.office_key || item.officeKey,
                                    officeName: verificationData.office_key || item.officeKey
                                  }}
                                  portalContext={{
                                    portalType: verificationData.portal_type || item.portalType,
                                    portalVersion: verificationData.portal_type || item.portalType
                                  }}
                                />
                              </div>

                              {/* NEW: Smart filtering tabs */}
                              <div className="flex gap-2 mb-3">
                                <Button
                                  variant={fieldViewFilter === 'needs-attention' ? 'default' : 'outline'}
                                  onClick={() => setFieldViewFilter('needs-attention')}
                                  size="sm"
                                  className={fieldViewFilter === 'needs-attention' ? 'bg-red-600 hover:bg-red-700' : ''}
                                >
                                  🎯 Needs Attention ({getFilteredFields().length})
                                </Button>
                                <Button
                                  variant={fieldViewFilter === 'all' ? 'default' : 'outline'}
                                  onClick={() => setFieldViewFilter('all')}
                                  size="sm"
                                >
                                  📋 All Fields ({getAllFields(verificationData).length})
                                </Button>
                                <Button
                                  variant={fieldViewFilter === 'reviewed' ? 'default' : 'outline'}
                                  onClick={() => setFieldViewFilter('reviewed')}
                                  size="sm"
                                  className={fieldViewFilter === 'reviewed' ? 'bg-green-600 hover:bg-green-700' : ''}
                                >
                                  ✓ Reviewed ({reviewedCount})
                                </Button>
                                <Button
                                  variant={fieldViewFilter === 'pending' ? 'default' : 'outline'}
                                  onClick={() => setFieldViewFilter('pending')}
                                  size="sm"
                                >
                                  ⏳ Pending ({totalFields - reviewedCount})
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={approveAllClean}
                                  size="sm"
                                  className="ml-auto"
                                >
                                  <Lightbulb className="mr-2 h-4 w-4" />
                                  Auto-Approve Clean Fields
                                </Button>
                              </div>

                              <p className="text-sm text-slate-700 dark:text-slate-300">
                                {existingFeedback ? 'Viewing previous review feedback' : 'Focus on fields that need your attention first, then review the rest'}
                              </p>
                            </div>
                            <div className="text-right ml-6">
                              <div className="text-4xl font-bold text-blue-600 mb-1">{progressPercent}%</div>
                              <div className="text-sm text-slate-700 dark:text-slate-300">{reviewedCount}/{totalFields} reviewed</div>
                              <div className="mt-2 w-32 h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
                                  style={{ width: `${progressPercent}%` }}
                                />
                              </div>
                            </div>
                          </div>

                          {/* NEW: Card-based field review */}
                          <div className="space-y-3 max-h-[calc(100vh-400px)] overflow-y-auto px-1">
                            {getFilteredFields().length === 0 ? (
                              <div className="text-center py-12 bg-slate-50 dark:bg-slate-800/50 rounded-lg border-2 border-dashed">
                                <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
                                <p className="text-lg font-semibold text-slate-700 dark:text-slate-300">
                                  {fieldViewFilter === 'needs-attention' ? 'No issues found!' : 'No fields in this view'}
                                </p>
                                <p className="text-sm text-slate-500 mt-1">
                                  {fieldViewFilter === 'needs-attention' ? 'All fields passed QA checks' : 'Try switching to a different view'}
                                </p>
                              </div>
                            ) : (
                              getFilteredFields().map((field) => {
                                const value = getFieldValue(field);
                                const fieldMeta = getFieldMetadata(field);
                                const qaIssue = getQAIssue(field);
                                const qaCheck = getQACheck(field);
                                const review = fieldReviews[field];
                                const isExpanded = expandedFields.has(field);

                                // Determine card color/style based on status
                                let borderColor = 'border-slate-200 dark:border-slate-700';
                                let bgColor = 'bg-white dark:bg-slate-900';

                                if (review.status === 'incorrect') {
                                  borderColor = 'border-red-400 dark:border-red-600';
                                  bgColor = 'bg-red-50 dark:bg-red-900/10';
                                } else if (review.status === 'flagged') {
                                  borderColor = 'border-yellow-400 dark:border-yellow-600';
                                  bgColor = 'bg-yellow-50 dark:bg-yellow-900/10';
                                } else if (review.status === 'correct') {
                                  borderColor = 'border-green-400 dark:border-green-600';
                                  bgColor = 'bg-green-50 dark:bg-green-900/10';
                                } else if (qaIssue || (qaCheck && !qaCheck.passed)) {
                                  borderColor = 'border-orange-400 dark:border-orange-600';
                                  bgColor = 'bg-orange-50 dark:bg-orange-900/10';
                                }

                                return (
                                  <Card key={field} className={`${borderColor} ${bgColor} border-2 transition-all hover:shadow-md`}>
                                    <CardContent className="p-4">
                                      <div className="space-y-3">
                                        {/* Header Row */}
                                        <div className="flex items-start justify-between gap-4">
                                          <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                              <h4 className="font-semibold text-lg text-slate-900 dark:text-slate-100">
                                                {getFieldLabel(field)}
                                              </h4>
                                              {qaIssue && (
                                                <Badge variant="destructive" className="text-xs">
                                                  {qaIssue.severity.toUpperCase()}
                                                </Badge>
                                              )}
                                              {qaCheck && !qaIssue && (
                                                <Badge variant={qaCheck.passed ? 'default' : 'secondary'} className={`text-xs ${qaCheck.passed ? 'bg-green-600' : 'bg-orange-600'}`}>
                                                  {qaCheck.passed ? '✓ PASSED' : '⚠ FAILED'}
                                                </Badge>
                                              )}
                                              <LearningIndicator
                                                field={field}
                                                mapper={getSectionForField(field)}
                                                officeId={verificationData.office_key || item.officeKey}
                                                portalType={verificationData.portal_type || item.portalType}
                                              />
                                            </div>
                                            <div className="text-xs font-mono text-slate-500 dark:text-slate-400">{getSectionForField(field)} › {field}</div>
                                          </div>

                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => toggleFieldExpanded(field)}
                                            className="shrink-0"
                                          >
                                            {isExpanded ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            {isExpanded ? 'Hide Details' : 'Show Details'}
                                          </Button>
                                        </div>

                                        {/* AI Value */}
                                        <div>
                                          <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">AI Extracted Value</div>
                                          <div className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 font-mono text-sm">
                                            {value !== null && value !== undefined ? String(value) : <span className="text-slate-400 italic">null</span>}
                                          </div>
                                        </div>

                                        {/* Expandable Details */}
                                        {isExpanded && (
                                          <div className="space-y-3 border-t pt-3">
                                            {/* AI Reasoning */}
                                            {fieldMeta && (
                                              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                                                <div className="text-xs font-semibold text-blue-900 dark:text-blue-200 mb-2 flex items-center gap-1">
                                                  <Lightbulb className="h-3 w-3" />
                                                  AI Extraction Reasoning
                                                </div>
                                                <div className="text-sm text-blue-800 dark:text-blue-300 mb-2">{fieldMeta.reasoning || 'No reasoning provided'}</div>
                                                <div className="text-xs text-blue-700 dark:text-blue-400">📍 Source: {fieldMeta.sourcePath || 'Unknown'}</div>
                                                {fieldMeta.confidence && (
                                                  <div className="mt-2">
                                                    <ConfidenceMeter value={fieldMeta.confidence} size="sm" />
                                                  </div>
                                                )}
                                              </div>
                                            )}

                                            {/* QA Analysis */}
                                            {(qaIssue || qaCheck) && (
                                              <div className={`border rounded-lg p-3 ${
                                                qaIssue ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' :
                                                qaCheck.passed ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' :
                                                'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
                                              }`}>
                                                <div className="text-xs font-semibold mb-2 flex items-center gap-1">
                                                  {qaIssue ? getSeverityIcon(qaIssue.severity) : qaCheck.passed ? <CheckCircle className="h-3 w-3 text-green-600" /> : <AlertCircle className="h-3 w-3 text-orange-600" />}
                                                  QA Analysis
                                                </div>
                                                {qaIssue ? (
                                                  <div className="space-y-1">
                                                    <div className="text-sm text-red-800 dark:text-red-300"><strong>Issue:</strong> {qaIssue.issue}</div>
                                                    <div className="text-sm text-red-700 dark:text-red-400"><strong>Reasoning:</strong> {qaIssue.reasoning}</div>
                                                    {qaIssue.expectedFormat && (
                                                      <div className="text-sm text-blue-700 dark:text-blue-300"><strong>Expected:</strong> {qaIssue.expectedFormat}</div>
                                                    )}
                                                    {qaIssue.suggestedFix && (
                                                      <div className="text-sm text-green-700 dark:text-green-300"><strong>Suggested Fix:</strong> {qaIssue.suggestedFix}</div>
                                                    )}
                                                  </div>
                                                ) : qaCheck && (
                                                  <div className="text-sm">{qaCheck.reasoning}</div>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        )}

                                        {/* Your Review Section */}
                                        <div className="border-t pt-3">
                                          <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">Your Review</div>

                                          {/* Action Buttons */}
                                          <div className="flex gap-2 mb-3">
                                            <Button
                                              size="sm"
                                              variant={review.status === 'correct' ? 'default' : 'outline'}
                                              onClick={() => updateFieldReview(field, { status: 'correct' })}
                                              className={`flex-1 ${review.status === 'correct' ? 'bg-green-600 hover:bg-green-700 border-green-600' : ''}`}
                                            >
                                              <Check className="mr-1 h-4 w-4" />
                                              Correct
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant={review.status === 'incorrect' ? 'destructive' : 'outline'}
                                              onClick={() => updateFieldReview(field, { status: 'incorrect' })}
                                              className={`flex-1 ${review.status === 'incorrect' ? 'bg-red-600 hover:bg-red-700 border-red-600' : ''}`}
                                            >
                                              <X className="mr-1 h-4 w-4" />
                                              Incorrect
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant={review.status === 'flagged' ? 'default' : 'outline'}
                                              onClick={() => updateFieldReview(field, { status: 'flagged' })}
                                              className={`flex-1 ${review.status === 'flagged' ? 'bg-yellow-600 hover:bg-yellow-700 text-white border-yellow-600' : ''}`}
                                            >
                                              🚩 Flag
                                            </Button>
                                            {review.status !== 'unchecked' && (
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => updateFieldReview(field, { status: 'unchecked', correctedValue: '', reasoning: '' })}
                                              >
                                                <RotateCcw className="h-4 w-4" />
                                              </Button>
                                            )}
                                          </div>

                                          {/* Feedback Forms */}
                                          {review.status === 'incorrect' && (
                                            <div className="space-y-2 bg-red-50 dark:bg-red-900/10 p-3 rounded-lg border border-red-200 dark:border-red-800">
                                              <div>
                                                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Corrected Value</label>
                                                <Input
                                                  placeholder="Enter the correct value"
                                                  value={review.correctedValue || ''}
                                                  onChange={(e) => updateFieldReview(field, { correctedValue: e.target.value })}
                                                  className="mt-1"
                                                />
                                              </div>
                                              <div>
                                                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Explanation (Why is this incorrect?)</label>
                                                <Textarea
                                                  placeholder="Explain what the AI got wrong and why the corrected value is accurate..."
                                                  value={review.reasoning || ''}
                                                  onChange={(e) => updateFieldReview(field, { reasoning: e.target.value })}
                                                  rows={3}
                                                  className="mt-1"
                                                />
                                              </div>
                                            </div>
                                          )}

                                          {review.status === 'flagged' && (
                                            <div className="bg-yellow-50 dark:bg-yellow-900/10 p-3 rounded-lg border border-yellow-200 dark:border-yellow-800">
                                              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">What's concerning about this field?</label>
                                              <Textarea
                                                placeholder="Describe why this field seems suspicious, ambiguous, or needs further verification..."
                                                value={review.reasoning || ''}
                                                onChange={(e) => updateFieldReview(field, { reasoning: e.target.value })}
                                                rows={3}
                                                className="mt-1"
                                              />
                                            </div>
                                          )}

                                          {review.status === 'correct' && (
                                            <div className="text-sm text-green-700 dark:text-green-400 font-medium flex items-center gap-2 bg-green-50 dark:bg-green-900/10 p-2 rounded border border-green-200 dark:border-green-800">
                                              <CheckCircle className="h-4 w-4" />
                                              Confirmed as correct
                                            </div>
                                          )}

                                          {review.status === 'unchecked' && (
                                            <div className="text-sm text-slate-400 dark:text-slate-500 italic text-center py-2">
                                              Not yet reviewed - select an action above
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </CardContent>
                                  </Card>
                                );
                              })
                            )}
                          </div>

                          <div className="border-2 border-blue-200 dark:border-blue-800 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/30 dark:to-purple-900/30 rounded-xl p-6 space-y-4">
                            <div>
                              <h3 className="text-xl font-bold text-blue-900 dark:text-blue-100 mb-1">Submit Review</h3>
                              <p className="text-sm text-slate-700 dark:text-slate-300">
                                Complete your review by providing your email, rating the difficulty, and approving or rejecting the verification.
                                Your feedback trains the AI through corrections saved to the RAG system.
                              </p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Reviewer Email *</label>
                                <Select value={reviewerId} onValueChange={setReviewerId}>
                                  <SelectTrigger className="mt-1">
                                    <SelectValue placeholder="Select your email" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="reviewer1@example.com">reviewer1@example.com</SelectItem>
                                    <SelectItem value="reviewer2@example.com">reviewer2@example.com</SelectItem>
                                    <SelectItem value="assistant@example.com">assistant@example.com</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Difficulty Rating *</label>
                                <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">How complex was this verification to review?</p>
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
                              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Approval Decision *</label>
                              <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">Approved = All correct | With Corrections = Fixed errors | Rejected = Critical failures</p>
                              <div className="flex gap-3 mt-2">
                                <Button
                                  variant={approval === 'approved' ? 'default' : 'outline'}
                                  onClick={() => setApproval('approved')}
                                  className={`flex-1 ${approval === 'approved' ? 'bg-green-600 hover:bg-green-700 border-green-600' : ''}`}
                                >
                                  <ThumbsUp className="mr-2 h-4 w-4" />
                                  Approved
                                </Button>
                                <Button
                                  variant={approval === 'approved_with_corrections' ? 'default' : 'outline'}
                                  onClick={() => setApproval('approved_with_corrections')}
                                  className={`flex-1 ${approval === 'approved_with_corrections' ? 'bg-yellow-600 hover:bg-yellow-700 border-yellow-600 text-white' : ''}`}
                                >
                                  <Save className="mr-2 h-4 w-4" />
                                  With Corrections
                                </Button>
                                <Button
                                  variant={approval === 'rejected' ? 'destructive' : 'outline'}
                                  onClick={() => setApproval('rejected')}
                                  className={`flex-1 ${approval === 'rejected' ? 'bg-red-600 hover:bg-red-700 border-red-600' : ''}`}
                                >
                                  <ThumbsDown className="mr-2 h-4 w-4" />
                                  Rejected
                                </Button>
                              </div>
                            </div>

                            <div>
                              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Additional Notes</label>
                              <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Portal issues, special circumstances, or recommendations</p>
                              <Textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Any portal issues, observations, or general comments..."
                                className="mt-1"
                                rows={3}
                              />
                            </div>

                            <div className="flex justify-between items-center pt-4 border-t border-blue-200 dark:border-blue-800">
                              <div className="text-sm text-slate-700 dark:text-slate-300">
                                Time spent: {Math.round((Date.now() - startTime) / 1000)}s
                              </div>
                              <div className="flex gap-3">
                                <Button
                                  variant="outline"
                                  size="lg"
                                  onClick={() => setExpandedId(null)}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  size="lg"
                                  onClick={handleSubmit}
                                  disabled={!reviewerId}
                                  className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold"
                                >
                                  <Send className="mr-2 h-4 w-4" />
                                  Submit Review
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
