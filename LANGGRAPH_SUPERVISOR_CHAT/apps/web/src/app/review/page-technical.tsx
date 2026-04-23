'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, CheckCircle, AlertTriangle, Info, ChevronDown, ChevronRight, Search, Filter, ThumbsUp, ThumbsDown, Save, Send, Moon, Sun, RotateCcw, Check, X, BarChart3, Eye, EyeOff, Lightbulb, Zap, Clock, Activity } from 'lucide-react';
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

    for (const field of allFields) {
      reviews[field] = { status: 'unchecked' };
    }

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
      'patient_full_name',
      'patient_dob',
      'subscriber_name',
      'subscriber_dob',
      'subscriber_id',
      'group_number',
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
      'preventive_coverage',
      'basic_coverage',
      'major_coverage',
      'yearly_maximum',
      'yearly_maximum_used',
      'yearly_deductible',
      'yearly_deductible_used',
      'dependent_coverage_age',
      'missing_tooth_clause',
      'ortho_lifetime_maximum',
      'ortho_coverage_percentage',
      'ortho_age_limit',
      'ortho_deductible',
      'ortho_payment_schedule',
      'waiting_periods.preventive',
      'waiting_periods.basic',
      'waiting_periods.major',
      'verified_by',
      'verification_date',
      'representative',
      'reference_number'
    ];

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

    const arrayMatch = fieldPath.match(/^(\w+)\[(\d+)\]\.(.+)$/);
    if (arrayMatch) {
      const [, arrayName, index, fieldName] = arrayMatch;
      const array = verificationData[arrayName];
      if (Array.isArray(array) && array[parseInt(index)]) {
        return array[parseInt(index)][fieldName];
      }
      return null;
    }

    const parts = fieldPath.split('.');
    let value = verificationData;
    for (const part of parts) {
      value = value?.[part];
    }
    return value;
  };

  const getFieldMetadata = (fieldPath: string): any => {
    const arrayMatch = fieldPath.match(/^(\w+)\[(\d+)\]\.(.+)$/);
    if (arrayMatch) {
      const [, arrayName, index, fieldName] = arrayMatch;
      const array = verificationData?.[arrayName];
      if (Array.isArray(array) && array[parseInt(index)]) {
        const item = array[parseInt(index)];
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

    const arrayMatch = fieldPath.match(/^(\w+)\[(\d+)\]\.(.+)$/);
    if (arrayMatch) {
      const [, arrayName, index, fieldName] = arrayMatch;
      const value = getFieldValue(fieldPath);

      if (arrayName === 'procedure_details') {
        const proc = verificationData?.procedure_details?.[parseInt(index)];
        if (!proc) return null;

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
    const arrayMatch = field.match(/^(\w+)\[(\d+)\]\.(.+)$/);
    if (arrayMatch) {
      const [, arrayName, index, fieldName] = arrayMatch;
      let itemLabel = `#${parseInt(index) + 1}`;

      if (arrayName === 'recent_procedures') {
        const proc = verificationData?.recent_procedures?.[parseInt(index)];
        if (proc?.code) {
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
      return <Badge className="bg-cyan-500 border-cyan-600 text-white font-mono">VERIFIED</Badge>;
    }
    if (item.qaScore === null) {
      return <Badge variant="secondary" className="font-mono">NO_QA</Badge>;
    }
    if (item.criticalIssues > 0) {
      return <Badge className="bg-red-600 text-white border-red-700 font-mono animate-pulse">{item.criticalIssues} CRITICAL</Badge>;
    }
    if (item.qaScore < 70) {
      return <Badge className="bg-red-600 text-white border-red-700 font-mono">FAILED</Badge>;
    }
    if (item.qaScore < 90) {
      return <Badge className="bg-amber-500 border-amber-600 text-white font-mono">{item.warnings} WARN</Badge>;
    }
    return <Badge className="bg-blue-600 border-blue-700 text-white font-mono">PENDING</Badge>;
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

  const getFilteredFields = () => {
    const allFields = getAllFields(verificationData || {});

    switch (fieldViewFilter) {
      case 'needs-attention':
        return allFields.filter(field => {
          const qaIssue = getQAIssue(field);
          const qaCheck = getQACheck(field);
          const review = fieldReviews[field];
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

      if (!qaIssue && (!qaCheck || qaCheck.passed)) {
        updates[field] = { ...fieldReviews[field], status: 'correct' };
      }
    });
    setFieldReviews(prev => ({ ...prev, ...updates }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700;800&family=IBM+Plex+Sans:wght@400;500;600;700&family=Instrument+Sans:wght@400;500;600;700&display=swap');

        * {
          font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        }

        h1, h2, h3, h4, h5, h6, .font-display {
          font-family: 'JetBrains Mono', 'Courier New', monospace;
          font-weight: 700;
          letter-spacing: -0.02em;
        }

        .font-mono, code, pre {
          font-family: 'JetBrains Mono', 'Courier New', monospace;
        }

        .font-ui {
          font-family: 'Instrument Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        .animate-slide-down {
          animation: slideDown 0.3s ease-out forwards;
        }

        .animate-fade-in {
          animation: fadeIn 0.4s ease-out forwards;
        }

        .animate-scale-in {
          animation: scaleIn 0.3s ease-out forwards;
        }

        .stagger-1 {
          animation-delay: 0.05s;
        }

        .stagger-2 {
          animation-delay: 0.1s;
        }

        .stagger-3 {
          animation-delay: 0.15s;
        }

        .card-hover {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .card-hover:hover {
          transform: translateY(-2px);
          box-shadow: 0 20px 40px -12px rgba(0, 0, 0, 0.15);
        }

        .glass-effect {
          background: rgba(255, 255, 255, 0.8);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .dark .glass-effect {
          background: rgba(15, 23, 42, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .gradient-border {
          position: relative;
        }

        .gradient-border::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          padding: 2px;
          background: linear-gradient(135deg, #06b6d4, #3b82f6);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
        }

        .scan-line {
          position: relative;
          overflow: hidden;
        }

        .scan-line::after {
          content: '';
          position: absolute;
          top: -50%;
          left: -50%;
          width: 200%;
          height: 200%;
          background: linear-gradient(
            to bottom,
            transparent,
            rgba(6, 182, 212, 0.1) 48%,
            rgba(6, 182, 212, 0.2) 50%,
            rgba(6, 182, 212, 0.1) 52%,
            transparent
          );
          animation: scan 3s linear infinite;
          pointer-events: none;
        }

        @keyframes scan {
          0% {
            transform: translateY(-50%);
          }
          100% {
            transform: translateY(50%);
          }
        }

        .data-grid {
          background-image:
            linear-gradient(rgba(6, 182, 212, 0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(6, 182, 212, 0.05) 1px, transparent 1px);
          background-size: 20px 20px;
        }
      `}</style>

      <div className="sticky top-0 z-50 glass-effect border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-[1800px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30">
                  <Activity className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-display font-bold text-slate-900 dark:text-white tracking-tight">
                    VERIFICATION_COMMAND
                  </h1>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                    v2.1.0 • Insurance Review Queue
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Link href="/analytics">
                <Button variant="outline" size="sm" className="font-ui border-2 hover:border-cyan-500 hover:text-cyan-600 dark:hover:text-cyan-400 transition-all">
                  <BarChart3 className="mr-2 h-4 w-4" />
                  Analytics
                </Button>
              </Link>
              {mounted && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className="h-9 w-9 border-2 hover:border-cyan-500 transition-all"
                >
                  {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1800px] mx-auto p-6 space-y-6">
        {/* Status Filter Bar */}
        <div className="flex items-center justify-between animate-fade-in">
          <div className="flex gap-2">
            {(['pending', 'reviewed', 'all'] as const).map((status, idx) => (
              <Button
                key={status}
                variant={filterStatus === status ? 'default' : 'outline'}
                onClick={() => setFilterStatus(status)}
                className={`font-mono uppercase text-xs tracking-wider transition-all border-2 ${
                  filterStatus === status
                    ? 'bg-cyan-500 hover:bg-cyan-600 border-cyan-600 text-white shadow-lg shadow-cyan-500/30'
                    : 'border-slate-300 dark:border-slate-600 hover:border-cyan-500'
                } stagger-${idx + 1}`}
              >
                {status}
              </Button>
            ))}
          </div>

          <div className="flex gap-2">
            {([
              { key: 'high-priority', label: 'HIGH_PRIORITY', icon: '⚡' },
              { key: 'low-confidence', label: 'LOW_CONF', icon: '⚠' },
              { key: 'critical-issues', label: 'CRITICAL', icon: '🔴' },
              { key: 'all', label: 'ALL', icon: '📊' }
            ] as const).map((filter) => (
              <Button
                key={filter.key}
                variant={queueFilter === filter.key ? 'default' : 'outline'}
                onClick={() => setQueueFilter(filter.key)}
                size="sm"
                className={`font-mono text-xs tracking-wider transition-all border-2 ${
                  queueFilter === filter.key
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white shadow-lg'
                    : 'border-slate-300 dark:border-slate-600 hover:border-slate-900 dark:hover:border-white'
                }`}
              >
                <span className="mr-1.5">{filter.icon}</span>
                {filter.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Search & Filters Card */}
        <Card className="border-2 border-slate-200 dark:border-slate-700 shadow-xl card-hover animate-scale-in">
          <CardHeader className="border-b-2 border-slate-200 dark:border-slate-700 bg-gradient-to-r from-slate-50 to-transparent dark:from-slate-800 dark:to-transparent">
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex-1 relative group">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 group-focus-within:text-cyan-500 transition-colors" />
                  <Input
                    placeholder="SEARCH: patient • insurance • ID • office..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-12 h-12 border-2 border-slate-300 dark:border-slate-600 focus:border-cyan-500 font-mono text-sm tracking-wide transition-all"
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={() => setShowFilters(!showFilters)}
                  className="h-12 px-6 border-2 border-slate-300 dark:border-slate-600 hover:border-cyan-500 font-mono text-sm transition-all"
                >
                  <Filter className="mr-2 h-4 w-4" />
                  FILTERS {showFilters ? '▲' : '▼'}
                </Button>
              </div>

              {showFilters && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 bg-slate-100 dark:bg-slate-800/50 rounded-xl border-2 border-slate-200 dark:border-slate-700 animate-slide-down">
                  <div>
                    <label className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">Office</label>
                    <Select value={filterOffice} onValueChange={setFilterOffice}>
                      <SelectTrigger className="mt-2 border-2 font-mono">
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
                    <label className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">Portal</label>
                    <Select value={filterPortal} onValueChange={setFilterPortal}>
                      <SelectTrigger className="mt-2 border-2 font-mono">
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
                    <label className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">Date From</label>
                    <Input
                      type="date"
                      value={filterDateFrom}
                      onChange={(e) => setFilterDateFrom(e.target.value)}
                      className="mt-2 border-2 font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">Date To</label>
                    <Input
                      type="date"
                      value={filterDateTo}
                      onChange={(e) => setFilterDateTo(e.target.value)}
                      className="mt-2 border-2 font-mono"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      QA Score: {filterQAMin}% - {filterQAMax}%
                    </label>
                    <div className="flex gap-3 mt-2">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={filterQAMin}
                        onChange={(e) => setFilterQAMin(parseInt(e.target.value) || 0)}
                        placeholder="Min"
                        className="border-2 font-mono"
                      />
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={filterQAMax}
                        onChange={(e) => setFilterQAMax(parseInt(e.target.value) || 100)}
                        placeholder="Max"
                        className="border-2 font-mono"
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
                      className="w-full border-2 font-mono hover:bg-red-50 hover:border-red-500 hover:text-red-600 dark:hover:bg-red-900/20"
                    >
                      CLEAR_FILTERS
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardHeader>

          <CardContent className="p-6">
            {loading ? (
              <div className="text-center py-24">
                <div className="inline-flex items-center gap-3 text-slate-500">
                  <div className="w-2 h-2 bg-cyan-500 rounded-full animate-ping"></div>
                  <div className="w-2 h-2 bg-cyan-500 rounded-full animate-ping" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 bg-cyan-500 rounded-full animate-ping" style={{ animationDelay: '0.4s' }}></div>
                  <span className="ml-3 font-mono text-sm">LOADING_QUEUE...</span>
                </div>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="text-center py-24">
                <div className="inline-flex flex-col items-center gap-4">
                  <div className="w-16 h-16 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <Search className="h-8 w-8 text-slate-400" />
                  </div>
                  <p className="font-mono text-sm text-slate-500">NO_VERIFICATIONS_FOUND</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredItems.map((item, idx) => (
                  <div
                    key={item.id}
                    className={`border-2 rounded-xl overflow-hidden transition-all card-hover animate-scale-in ${
                      expandedId === item.id
                        ? 'border-cyan-500 shadow-2xl shadow-cyan-500/20 ring-4 ring-cyan-500/10'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                    style={{ animationDelay: `${idx * 0.05}s` }}
                  >
                    <div
                      className={`p-5 cursor-pointer transition-all ${
                        expandedId === item.id
                          ? 'bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-900/20 dark:to-blue-900/20'
                          : 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                      onClick={() => loadVerificationDetails(item.id)}
                    >
                      <div className="flex items-center gap-5">
                        <div className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all ${
                          expandedId === item.id
                            ? 'bg-cyan-500 text-white rotate-180'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                        }`}>
                          <ChevronDown className="h-5 w-5" />
                        </div>

                        <div className="flex-1 grid grid-cols-6 gap-6 items-center">
                          <div>
                            {item.qaScore !== null && item.qaScore < 50 && (
                              <div className="inline-flex items-center gap-1 mb-2 px-2 py-1 rounded-md bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700">
                                <Zap className="h-3 w-3 text-red-600 dark:text-red-400" />
                                <span className="text-xs font-mono font-bold text-red-600 dark:text-red-400">URGENT</span>
                              </div>
                            )}
                            <div className="font-display font-bold text-slate-900 dark:text-white text-lg">
                              {item.patientName}
                            </div>
                            <div className="text-xs font-mono text-slate-500 mt-1">{item.id}</div>
                          </div>

                          <div>
                            <div className="font-semibold text-slate-700 dark:text-slate-300">{item.insuranceProvider}</div>
                            <div className="text-xs font-mono text-slate-500 mt-1">{item.officeKey}</div>
                          </div>

                          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                            <Clock className="h-4 w-4" />
                            <span className="font-mono">{new Date(item.verificationDate).toLocaleDateString()}</span>
                          </div>

                          <div>
                            {getStatusBadge(item)}
                          </div>

                          <div className="text-center">
                            {item.qaScore !== null ? (
                              <div className="inline-flex flex-col items-center">
                                <div className={`text-3xl font-display font-bold tracking-tighter ${
                                  item.qaScore >= 90 ? 'text-emerald-600 dark:text-emerald-400' :
                                  item.qaScore >= 70 ? 'text-amber-600 dark:text-amber-400' :
                                  'text-red-600 dark:text-red-400'
                                }`}>
                                  {item.qaScore}
                                </div>
                                <div className="text-xs font-mono text-slate-500 mt-0.5">QA_SCORE</div>
                              </div>
                            ) : (
                              <div className="text-sm font-mono text-slate-400">NULL</div>
                            )}
                          </div>

                          <div>
                            <Badge variant="outline" className="font-mono text-xs border-2">
                              {item.portalType}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </div>

                    {expandedId === item.id && verificationData && (
                      <div className="border-t-2 border-cyan-200 dark:border-cyan-800 bg-slate-50 dark:bg-slate-900/50 animate-slide-down">
                        <div className="p-8 space-y-8">
                          {existingFeedback && (
                            <div className="border-2 border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-6 scan-line">
                              <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-lg bg-emerald-500 flex items-center justify-center">
                                  <CheckCircle className="h-6 w-6 text-white" />
                                </div>
                                <h3 className="text-xl font-display font-bold text-emerald-900 dark:text-emerald-100">
                                  ALREADY_REVIEWED
                                </h3>
                              </div>
                              <div className="grid grid-cols-2 gap-4 font-mono text-sm">
                                <div>
                                  <span className="text-emerald-700 dark:text-emerald-400 font-semibold">REVIEWER:</span>{' '}
                                  <span className="text-slate-700 dark:text-slate-300">{existingFeedback.reviewerInfo?.reviewerId || 'UNKNOWN'}</span>
                                </div>
                                <div>
                                  <span className="text-emerald-700 dark:text-emerald-400 font-semibold">TIMESTAMP:</span>{' '}
                                  <span className="text-slate-700 dark:text-slate-300">
                                    {existingFeedback.reviewerInfo?.reviewedAt ? new Date(existingFeedback.reviewerInfo.reviewedAt).toLocaleString() : 'UNKNOWN'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-emerald-700 dark:text-emerald-400 font-semibold">STATUS:</span>{' '}
                                  <span className="text-slate-700 dark:text-slate-300 uppercase">{existingFeedback.overallApproval || 'N/A'}</span>
                                </div>
                                <div>
                                  <span className="text-emerald-700 dark:text-emerald-400 font-semibold">CORRECTIONS:</span>{' '}
                                  <span className="text-slate-700 dark:text-slate-300">{existingFeedback.fieldCorrections?.length || 0} fields</span>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Field Review Header */}
                          <div className="border-2 border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
                            <div className="bg-gradient-to-r from-cyan-500 to-blue-600 p-6 text-white">
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-4 mb-4">
                                    <h3 className="text-2xl font-display font-bold tracking-tight">
                                      FIELD_REVIEW_PROTOCOL
                                    </h3>
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

                                  <div className="flex gap-2 mb-3">
                                    {[
                                      { key: 'needs-attention', label: 'CRITICAL', icon: '🎯' },
                                      { key: 'all', label: 'ALL_FIELDS', icon: '📋' },
                                      { key: 'reviewed', label: 'REVIEWED', icon: '✓' },
                                      { key: 'pending', label: 'PENDING', icon: '⏳' }
                                    ].map((filter) => (
                                      <Button
                                        key={filter.key}
                                        variant={fieldViewFilter === filter.key ? 'secondary' : 'outline'}
                                        onClick={() => setFieldViewFilter(filter.key as any)}
                                        size="sm"
                                        className={`font-mono text-xs tracking-wider transition-all ${
                                          fieldViewFilter === filter.key
                                            ? 'bg-white text-cyan-700 hover:bg-white/90 font-bold border-2 border-white shadow-lg'
                                            : 'bg-cyan-600/20 text-white border-2 border-white/30 hover:bg-white/20 hover:border-white/50'
                                        }`}
                                      >
                                        {filter.icon} {filter.label} ({
                                          filter.key === 'needs-attention' ? getFilteredFields().length :
                                          filter.key === 'all' ? getAllFields(verificationData).length :
                                          filter.key === 'reviewed' ? reviewedCount :
                                          totalFields - reviewedCount
                                        })
                                      </Button>
                                    ))}
                                    <Button
                                      variant="outline"
                                      onClick={approveAllClean}
                                      size="sm"
                                      className="ml-auto bg-cyan-600/20 text-white border-2 border-white/30 hover:bg-white/20 hover:border-white/50 font-mono text-xs"
                                    >
                                      <Lightbulb className="mr-2 h-4 w-4" />
                                      AUTO_APPROVE_CLEAN
                                    </Button>
                                  </div>

                                  <p className="text-sm text-cyan-50 font-ui">
                                    {existingFeedback ? 'Viewing previous review feedback' : 'Review fields requiring attention, then validate remaining data'}
                                  </p>
                                </div>

                                <div className="text-right ml-8 border-l-2 border-white/30 pl-8">
                                  <div className="text-5xl font-display font-bold mb-2">{progressPercent}%</div>
                                  <div className="text-sm text-cyan-50 mb-4 font-mono">
                                    {reviewedCount}/{totalFields} COMPLETE
                                  </div>
                                  <div className="w-40 h-4 bg-white/20 rounded-full overflow-hidden border-2 border-white/30">
                                    <div
                                      className="h-full bg-gradient-to-r from-emerald-400 to-cyan-300 transition-all duration-500 shadow-lg"
                                      style={{ width: `${progressPercent}%` }}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Fields List */}
                            <div className="p-6 space-y-4 max-h-[calc(100vh-500px)] overflow-y-auto data-grid">
                              {getFilteredFields().length === 0 ? (
                                <div className="text-center py-16 bg-slate-50 dark:bg-slate-800/30 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600">
                                  <div className="inline-flex flex-col items-center gap-4">
                                    <div className="w-16 h-16 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                                      <CheckCircle className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
                                    </div>
                                    <p className="text-lg font-display font-bold text-slate-700 dark:text-slate-300">
                                      {fieldViewFilter === 'needs-attention' ? 'NO_ISSUES_DETECTED' : 'NO_FIELDS_IN_VIEW'}
                                    </p>
                                    <p className="text-sm font-mono text-slate-500">
                                      {fieldViewFilter === 'needs-attention' ? 'All fields passed QA validation' : 'Switch to different view mode'}
                                    </p>
                                  </div>
                                </div>
                              ) : (
                                getFilteredFields().map((field, idx) => {
                                  const value = getFieldValue(field);
                                  const fieldMeta = getFieldMetadata(field);
                                  const qaIssue = getQAIssue(field);
                                  const qaCheck = getQACheck(field);
                                  const review = fieldReviews[field];
                                  const isExpanded = expandedFields.has(field);

                                  let borderColor = 'border-slate-300 dark:border-slate-700';
                                  let bgColor = 'bg-white dark:bg-slate-900';
                                  let accentBar = '';

                                  if (review.status === 'incorrect') {
                                    borderColor = 'border-red-500 dark:border-red-500';
                                    bgColor = 'bg-red-50 dark:bg-red-900/10';
                                    accentBar = 'bg-red-500';
                                  } else if (review.status === 'flagged') {
                                    borderColor = 'border-amber-500 dark:border-amber-500';
                                    bgColor = 'bg-amber-50 dark:bg-amber-900/10';
                                    accentBar = 'bg-amber-500';
                                  } else if (review.status === 'correct') {
                                    borderColor = 'border-emerald-500 dark:border-emerald-500';
                                    bgColor = 'bg-emerald-50 dark:bg-emerald-900/10';
                                    accentBar = 'bg-emerald-500';
                                  } else if (qaIssue || (qaCheck && !qaCheck.passed)) {
                                    borderColor = 'border-orange-500 dark:border-orange-500';
                                    bgColor = 'bg-orange-50 dark:bg-orange-900/10';
                                    accentBar = 'bg-orange-500';
                                  }

                                  return (
                                    <Card
                                      key={field}
                                      className={`${borderColor} ${bgColor} border-2 transition-all card-hover relative overflow-hidden animate-scale-in`}
                                      style={{ animationDelay: `${idx * 0.03}s` }}
                                    >
                                      {accentBar && <div className={`absolute top-0 left-0 right-0 h-1 ${accentBar}`} />}
                                      <CardContent className="p-5">
                                        <div className="space-y-4">
                                          {/* Header */}
                                          <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1">
                                              <div className="flex items-center gap-3 mb-2">
                                                <h4 className="font-display font-bold text-lg text-slate-900 dark:text-white">
                                                  {getFieldLabel(field)}
                                                </h4>
                                                {qaIssue && (
                                                  <Badge variant="destructive" className="font-mono text-xs animate-pulse">
                                                    {qaIssue.severity.toUpperCase()}
                                                  </Badge>
                                                )}
                                                {qaCheck && !qaIssue && (
                                                  <Badge
                                                    variant={qaCheck.passed ? 'default' : 'secondary'}
                                                    className={`font-mono text-xs ${
                                                      qaCheck.passed
                                                        ? 'bg-emerald-600 border-emerald-700 text-white'
                                                        : 'bg-orange-600 border-orange-700 text-white'
                                                    }`}
                                                  >
                                                    {qaCheck.passed ? '✓ PASS' : '⚠ FAIL'}
                                                  </Badge>
                                                )}
                                                <LearningIndicator
                                                  field={field}
                                                  mapper={getSectionForField(field)}
                                                  officeId={verificationData.office_key || item.officeKey}
                                                  portalType={verificationData.portal_type || item.portalType}
                                                />
                                              </div>
                                              <div className="text-xs font-mono text-slate-500">
                                                {getSectionForField(field)} › {field}
                                              </div>
                                            </div>

                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => toggleFieldExpanded(field)}
                                              className="shrink-0 border-2 border-transparent hover:border-slate-300 dark:hover:border-slate-600 font-mono text-xs"
                                            >
                                              {isExpanded ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                                              {isExpanded ? 'HIDE' : 'SHOW'}
                                            </Button>
                                          </div>

                                          {/* AI Value */}
                                          <div>
                                            <div className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">
                                              AI_EXTRACTED_VALUE
                                            </div>
                                            <div className="bg-slate-100 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 rounded-lg px-4 py-3 font-mono text-sm">
                                              {value !== null && value !== undefined ? (
                                                <span className="text-slate-900 dark:text-white">{String(value)}</span>
                                              ) : (
                                                <span className="text-slate-400 italic">null</span>
                                              )}
                                            </div>
                                          </div>

                                          {/* Expandable Details */}
                                          {isExpanded && (
                                            <div className="space-y-4 border-t-2 border-slate-200 dark:border-slate-700 pt-4 animate-slide-down">
                                              {fieldMeta && (
                                                <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-lg p-4">
                                                  <div className="text-xs font-mono font-bold uppercase tracking-wider text-blue-900 dark:text-blue-200 mb-3 flex items-center gap-2">
                                                    <Lightbulb className="h-4 w-4" />
                                                    AI_REASONING
                                                  </div>
                                                  <div className="text-sm text-blue-800 dark:text-blue-300 mb-3 font-ui">
                                                    {fieldMeta.reasoning || 'No reasoning provided'}
                                                  </div>
                                                  <div className="text-xs font-mono text-blue-700 dark:text-blue-400">
                                                    SOURCE: {fieldMeta.sourcePath || 'Unknown'}
                                                  </div>
                                                  {fieldMeta.confidence && (
                                                    <div className="mt-3">
                                                      <ConfidenceMeter value={fieldMeta.confidence} size="sm" />
                                                    </div>
                                                  )}
                                                </div>
                                              )}

                                              {(qaIssue || qaCheck) && (
                                                <div className={`border-2 rounded-lg p-4 ${
                                                  qaIssue
                                                    ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                                                    : qaCheck.passed
                                                      ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
                                                      : 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
                                                }`}>
                                                  <div className="text-xs font-mono font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
                                                    {qaIssue ? getSeverityIcon(qaIssue.severity) : qaCheck.passed ? <CheckCircle className="h-4 w-4 text-emerald-600" /> : <AlertCircle className="h-4 w-4 text-orange-600" />}
                                                    QA_ANALYSIS
                                                  </div>
                                                  {qaIssue ? (
                                                    <div className="space-y-2 text-sm font-ui">
                                                      <div className="text-red-900 dark:text-red-200">
                                                        <span className="font-bold">ISSUE:</span> {qaIssue.issue}
                                                      </div>
                                                      <div className="text-red-800 dark:text-red-300">
                                                        <span className="font-bold">REASON:</span> {qaIssue.reasoning}
                                                      </div>
                                                      {qaIssue.suggestedFix && (
                                                        <div className="text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/30 p-3 rounded-lg border border-emerald-300 dark:border-emerald-700 mt-2">
                                                          <span className="font-bold">FIX:</span> {qaIssue.suggestedFix}
                                                        </div>
                                                      )}
                                                    </div>
                                                  ) : qaCheck && (
                                                    <div className="text-sm font-ui">{qaCheck.reasoning}</div>
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                          )}

                                          {/* Review Actions */}
                                          <div className="border-t-2 border-slate-200 dark:border-slate-700 pt-4">
                                            <div className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-3">
                                              YOUR_REVIEW
                                            </div>

                                            <div className="flex gap-2 mb-4">
                                              <Button
                                                size="sm"
                                                variant={review.status === 'correct' ? 'default' : 'outline'}
                                                onClick={() => updateFieldReview(field, { status: 'correct' })}
                                                className={`flex-1 border-2 font-mono text-xs transition-all ${
                                                  review.status === 'correct'
                                                    ? 'bg-emerald-600 hover:bg-emerald-700 border-emerald-600 text-white shadow-lg shadow-emerald-500/30'
                                                    : 'border-slate-300 dark:border-slate-600 hover:border-emerald-500'
                                                }`}
                                              >
                                                <Check className="mr-1.5 h-4 w-4" />
                                                CORRECT
                                              </Button>
                                              <Button
                                                size="sm"
                                                variant={review.status === 'incorrect' ? 'destructive' : 'outline'}
                                                onClick={() => updateFieldReview(field, { status: 'incorrect' })}
                                                className={`flex-1 border-2 font-mono text-xs transition-all ${
                                                  review.status === 'incorrect'
                                                    ? 'bg-red-600 hover:bg-red-700 border-red-600 shadow-lg shadow-red-500/30'
                                                    : 'border-slate-300 dark:border-slate-600 hover:border-red-500'
                                                }`}
                                              >
                                                <X className="mr-1.5 h-4 w-4" />
                                                INCORRECT
                                              </Button>
                                              <Button
                                                size="sm"
                                                variant={review.status === 'flagged' ? 'default' : 'outline'}
                                                onClick={() => updateFieldReview(field, { status: 'flagged' })}
                                                className={`flex-1 border-2 font-mono text-xs transition-all ${
                                                  review.status === 'flagged'
                                                    ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-600 shadow-lg shadow-amber-500/30'
                                                    : 'border-slate-300 dark:border-slate-600 hover:border-amber-500'
                                                }`}
                                              >
                                                🚩 FLAG
                                              </Button>
                                              {review.status !== 'unchecked' && (
                                                <Button
                                                  size="sm"
                                                  variant="ghost"
                                                  onClick={() => updateFieldReview(field, { status: 'unchecked', correctedValue: '', reasoning: '' })}
                                                  className="border-2 border-transparent hover:border-slate-300 dark:hover:border-slate-600"
                                                >
                                                  <RotateCcw className="h-4 w-4" />
                                                </Button>
                                              )}
                                            </div>

                                            {/* Correction Form */}
                                            {review.status === 'incorrect' && (
                                              <div className="space-y-3 bg-red-50 dark:bg-red-900/10 p-4 rounded-lg border-2 border-red-200 dark:border-red-800 animate-slide-down">
                                                <div>
                                                  <label className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                                                    CORRECTED_VALUE
                                                  </label>
                                                  <Input
                                                    placeholder="Enter correct value..."
                                                    value={review.correctedValue || ''}
                                                    onChange={(e) => updateFieldReview(field, { correctedValue: e.target.value })}
                                                    className="mt-2 border-2 font-mono"
                                                  />
                                                </div>
                                                <div>
                                                  <label className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                                                    EXPLANATION
                                                  </label>
                                                  <Textarea
                                                    placeholder="Why is this incorrect? What should it be?"
                                                    value={review.reasoning || ''}
                                                    onChange={(e) => updateFieldReview(field, { reasoning: e.target.value })}
                                                    rows={3}
                                                    className="mt-2 border-2 font-mono text-sm"
                                                  />
                                                </div>
                                              </div>
                                            )}

                                            {review.status === 'flagged' && (
                                              <div className="bg-amber-50 dark:bg-amber-900/10 p-4 rounded-lg border-2 border-amber-200 dark:border-amber-800 animate-slide-down">
                                                <label className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                                                  FLAG_REASON
                                                </label>
                                                <Textarea
                                                  placeholder="What's concerning or suspicious about this field?"
                                                  value={review.reasoning || ''}
                                                  onChange={(e) => updateFieldReview(field, { reasoning: e.target.value })}
                                                  rows={3}
                                                  className="mt-2 border-2 font-mono text-sm"
                                                />
                                              </div>
                                            )}

                                            {review.status === 'correct' && (
                                              <div className="text-sm text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/10 p-3 rounded-lg border-2 border-emerald-200 dark:border-emerald-800">
                                                <CheckCircle className="h-5 w-5" />
                                                <span className="font-mono">CONFIRMED_CORRECT</span>
                                              </div>
                                            )}

                                            {review.status === 'unchecked' && (
                                              <div className="text-sm text-slate-400 dark:text-slate-500 italic text-center py-3 font-mono">
                                                AWAITING_REVIEW
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
                          </div>

                          {/* Submit Section */}
                          <div className="border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl overflow-hidden shadow-xl">
                            <div className="bg-gradient-to-r from-slate-900 to-slate-800 dark:from-slate-800 dark:to-slate-700 p-6 border-b-2 border-slate-700">
                              <h3 className="text-2xl font-display font-bold text-white mb-2">
                                SUBMIT_REVIEW
                              </h3>
                              <p className="text-sm text-slate-300 font-ui">
                                Complete review and train AI system with your feedback
                              </p>
                            </div>

                            <div className="p-6 space-y-6">
                              <div className="grid grid-cols-2 gap-6">
                                <div>
                                  <label className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2 block">
                                    REVIEWER_EMAIL
                                  </label>
                                  <Select value={reviewerId} onValueChange={setReviewerId}>
                                    <SelectTrigger className="border-2 font-mono">
                                      <SelectValue placeholder="Select email..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="reviewer1@example.com">reviewer1@example.com</SelectItem>
                                      <SelectItem value="reviewer2@example.com">reviewer2@example.com</SelectItem>
                                      <SelectItem value="assistant@example.com">assistant@example.com</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <label className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2 block">
                                    DIFFICULTY_RATING
                                  </label>
                                  <Select value={difficulty.toString()} onValueChange={(v) => setDifficulty(parseInt(v) as any)}>
                                    <SelectTrigger className="border-2 font-mono">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="1">1 - VERY_EASY</SelectItem>
                                      <SelectItem value="2">2 - EASY</SelectItem>
                                      <SelectItem value="3">3 - MODERATE</SelectItem>
                                      <SelectItem value="4">4 - HARD</SelectItem>
                                      <SelectItem value="5">5 - VERY_HARD</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>

                              <div>
                                <label className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-3 block">
                                  APPROVAL_DECISION
                                </label>
                                <div className="flex gap-3">
                                  <Button
                                    variant={approval === 'approved' ? 'default' : 'outline'}
                                    onClick={() => setApproval('approved')}
                                    className={`flex-1 h-14 border-2 font-mono text-sm transition-all ${
                                      approval === 'approved'
                                        ? 'bg-emerald-600 hover:bg-emerald-700 border-emerald-600 text-white shadow-lg shadow-emerald-500/30'
                                        : 'border-slate-300 dark:border-slate-600 hover:border-emerald-500'
                                    }`}
                                  >
                                    <ThumbsUp className="mr-2 h-5 w-5" />
                                    APPROVED
                                  </Button>
                                  <Button
                                    variant={approval === 'approved_with_corrections' ? 'default' : 'outline'}
                                    onClick={() => setApproval('approved_with_corrections')}
                                    className={`flex-1 h-14 border-2 font-mono text-sm transition-all ${
                                      approval === 'approved_with_corrections'
                                        ? 'bg-amber-600 hover:bg-amber-700 border-amber-600 text-white shadow-lg shadow-amber-500/30'
                                        : 'border-slate-300 dark:border-slate-600 hover:border-amber-500'
                                    }`}
                                  >
                                    <Save className="mr-2 h-5 w-5" />
                                    WITH_CORRECTIONS
                                  </Button>
                                  <Button
                                    variant={approval === 'rejected' ? 'destructive' : 'outline'}
                                    onClick={() => setApproval('rejected')}
                                    className={`flex-1 h-14 border-2 font-mono text-sm transition-all ${
                                      approval === 'rejected'
                                        ? 'bg-red-600 hover:bg-red-700 border-red-600 shadow-lg shadow-red-500/30'
                                        : 'border-slate-300 dark:border-slate-600 hover:border-red-500'
                                    }`}
                                  >
                                    <ThumbsDown className="mr-2 h-5 w-5" />
                                    REJECTED
                                  </Button>
                                </div>
                              </div>

                              <div>
                                <label className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2 block">
                                  ADDITIONAL_NOTES
                                </label>
                                <Textarea
                                  value={notes}
                                  onChange={(e) => setNotes(e.target.value)}
                                  placeholder="Portal issues, special circumstances, recommendations..."
                                  className="border-2 font-mono text-sm"
                                  rows={3}
                                />
                              </div>

                              <div className="flex justify-between items-center pt-4 border-t-2 border-slate-200 dark:border-slate-700">
                                <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
                                  <Clock className="h-4 w-4" />
                                  <span className="font-mono">
                                    TIME_SPENT: {Math.round((Date.now() - startTime) / 1000)}s
                                  </span>
                                </div>
                                <div className="flex gap-3">
                                  <Button
                                    variant="outline"
                                    size="lg"
                                    onClick={() => setExpandedId(null)}
                                    className="border-2 font-mono hover:border-red-500 hover:text-red-600 dark:hover:text-red-400"
                                  >
                                    CANCEL
                                  </Button>
                                  <Button
                                    size="lg"
                                    onClick={handleSubmit}
                                    disabled={!reviewerId}
                                    className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-mono font-bold border-2 border-cyan-600 shadow-xl shadow-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    <Send className="mr-2 h-5 w-5" />
                                    SUBMIT_REVIEW
                                  </Button>
                                </div>
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
