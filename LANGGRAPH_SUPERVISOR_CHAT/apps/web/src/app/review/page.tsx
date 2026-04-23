'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, CheckCircle, AlertTriangle, Search, X, Check, Flag, Send, ChevronRight, Zap, Info } from 'lucide-react';
import { ConfidenceMeter } from '@/components/ConfidenceMeter';

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
  reasoning?: string;

  // JSON Path Annotations
  aiJsonPath?: string;
  correctJsonPath?: string;

  // Error Classification
  errorType?: 'wrong_json_path' | 'calculation_error' | 'business_rule_violation' |
              'mapping_error' | 'format_error' | 'missing_data' | null;

  // Business Logic & Provider Notes
  businessRule?: string;
  providerNotes?: string;

  // Confidence
  confidence?: 1 | 2 | 3 | 4 | 5;
}

export default function ReviewQueuePage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [verificationData, setVerificationData] = useState<any>(null);
  const [qaReport, setQaReport] = useState<any>(null);
  const [metadata, setMetadata] = useState<any>(null);
  const [mapperMetadata, setMapperMetadata] = useState<Record<string, any> | null>(null);
  const [fieldReviews, setFieldReviews] = useState<Record<string, FieldReviewState>>({});
  const [approval, setApproval] = useState<'approved' | 'approved_with_corrections' | 'rejected'>('approved');
  const [difficulty, setDifficulty] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [reviewerId, setReviewerId] = useState('');
  const [notes, setNotes] = useState('');
  const [startTime, setStartTime] = useState(Date.now());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFieldIndex, setSelectedFieldIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'needs-attention' | 'all'>('needs-attention');

  useEffect(() => {
    loadQueue();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!selectedId || !verificationData) return;

      const fields = getFilteredFields();
      if (fields.length === 0) return;

      const currentField = fields[selectedFieldIndex];

      // 1 = Correct
      if (e.key === '1') {
        e.preventDefault();
        updateFieldReview(currentField, { status: 'correct' });
        moveToNextField();
      }
      // 2 = Incorrect
      else if (e.key === '2') {
        e.preventDefault();
        updateFieldReview(currentField, { status: 'incorrect' });
      }
      // 3 = Flag
      else if (e.key === '3') {
        e.preventDefault();
        updateFieldReview(currentField, { status: 'flagged' });
        moveToNextField();
      }
      // Tab = Next field
      else if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        moveToNextField();
      }
      // Shift+Tab = Previous field
      else if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        moveToPrevField();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [selectedId, selectedFieldIndex, verificationData, fieldReviews]);

  const moveToNextField = () => {
    const fields = getFilteredFields();
    if (selectedFieldIndex < fields.length - 1) {
      setSelectedFieldIndex(prev => prev + 1);
    }
  };

  const moveToPrevField = () => {
    if (selectedFieldIndex > 0) {
      setSelectedFieldIndex(prev => prev - 1);
    }
  };

  const loadQueue = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/queue?status=pending');
      const data = await response.json();
      if (!data.error) {
        setItems(data.items || []);
      }
    } catch (error) {
      console.error('Failed to load queue:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadVerification = async (id: string) => {
    try {
      const response = await fetch(`/api/verification/${id}`);
      const data = await response.json();
      if (data.error) return;

      setVerificationData(data.verificationData);
      setQaReport(data.qaReport);
      setMetadata(data.metadata);
      setMapperMetadata(data.mapperMetadata || null);
      setSelectedId(id);
      setStartTime(Date.now());
      setSelectedFieldIndex(0);

      const reviews: Record<string, FieldReviewState> = {};
      getAllFields(data.verificationData).forEach(field => {
        reviews[field] = { status: 'unchecked' };
      });
      setFieldReviews(reviews);
    } catch (error) {
      console.error('Failed to load verification:', error);
    }
  };

  const getAllFields = (data: any): string[] => {
    const baseFields = [
      'patient_full_name', 'patient_dob', 'subscriber_name', 'subscriber_dob', 'subscriber_id', 'group_number',
      'insurance_company', 'plan_name', 'claims_address', 'insurance_phone', 'payor_id', 'network_status',
      'fee_schedule', 'benefit_period', 'effective_date', 'termination_date', 'preventive_coverage',
      'basic_coverage', 'major_coverage', 'yearly_maximum', 'yearly_maximum_used', 'yearly_deductible',
      'yearly_deductible_used', 'dependent_coverage_age', 'missing_tooth_clause', 'ortho_lifetime_maximum',
      'ortho_coverage_percentage', 'ortho_age_limit', 'ortho_deductible', 'ortho_payment_schedule',
      'waiting_periods.preventive', 'waiting_periods.basic', 'waiting_periods.major',
      'verified_by', 'verification_date', 'representative', 'reference_number'
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

    // Add treatment history fields
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

    // Add recent_procedures fields (alternative field name used in some verifications)
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

  const getQAIssue = (fieldPath: string): any => {
    if (!qaReport?.issues) return null;
    return qaReport.issues.find((issue: any) => issue.field === fieldPath || issue.field.includes(fieldPath));
  };

  const getQACheck = (fieldPath: string): any => {
    if (!qaReport?.checks) return null;
    return qaReport.checks.find((check: any) => check.field === fieldPath || check.field.includes(fieldPath));
  };

  const getJsonPathForField = useCallback((fieldPath: string): string | null => {
    if (!mapperMetadata) return null;

    // Field to mapper mapping
    const fieldToMapper: Record<string, string> = {
      'patient_full_name': 'patient_info_mapper',
      'patient_dob': 'patient_info_mapper',
      'subscriber_name': 'patient_info_mapper',
      'subscriber_dob': 'patient_info_mapper',
      'subscriber_id': 'patient_info_mapper',
      'group_number': 'patient_info_mapper',
      'insurance_company': 'insurance_info_mapper',
      'plan_name': 'insurance_info_mapper',
      'claims_address': 'insurance_info_mapper',
      'insurance_phone': 'insurance_info_mapper',
      'payor_id': 'insurance_info_mapper',
      'network_status': 'coverage_and_benefits_mapper',
      'fee_schedule': 'coverage_and_benefits_mapper',
      'preventive_coverage': 'coverage_and_benefits_mapper',
      'basic_coverage': 'coverage_and_benefits_mapper',
      'major_coverage': 'coverage_and_benefits_mapper',
      'yearly_maximum': 'coverage_and_benefits_mapper',
      'yearly_maximum_used': 'coverage_and_benefits_mapper',
      'yearly_deductible': 'coverage_and_benefits_mapper',
      'yearly_deductible_used': 'coverage_and_benefits_mapper',
      'dependent_coverage_age': 'coverage_and_benefits_mapper',
      'missing_tooth_clause': 'coverage_and_benefits_mapper',
      'ortho_lifetime_maximum': 'orthodontic_benefits_mapper',
      'ortho_coverage_percentage': 'orthodontic_benefits_mapper',
      'ortho_age_limit': 'orthodontic_benefits_mapper',
      'ortho_deductible': 'orthodontic_benefits_mapper',
      'waiting_periods': 'waiting_periods_mapper',
      'procedure_details': 'procedure_details_mapper',
      'treatment_history': 'treatment_history_mapper',
    };

    // Handle array notation
    const baseField = fieldPath.replace(/\[\d+\]\..*$/, '').replace(/\..*$/, '');

    const mapperName = fieldToMapper[fieldPath] || fieldToMapper[baseField];
    if (!mapperName || !mapperMetadata[mapperName]) return null;

    // Convert snake_case to camelCase for metadata lookup
    const metadataFieldName = fieldPath
      .split('.').pop()!
      .replace(/_(.)/g, (_, letter) => letter.toUpperCase())
      .replace(/\[\d+\]/, '');

    const fieldMetadata = mapperMetadata[mapperName].fields?.[metadataFieldName];
    return fieldMetadata?.sourcePath || null;
  }, [mapperMetadata]);

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
        humanReasoning: review.reasoning
      }));

    const feedback = {
      verificationId: selectedId,
      reviewerId,
      approval,
      corrections,
      difficulty,
      notes,
      timeSpentSeconds: timeSpent,
      reviewedAt: new Date().toISOString(),
      fieldReviews: Object.entries(fieldReviews).map(([field, review]) => {
        const jsonPath = getJsonPathForField(field);

        return {
          field,
          status: review.status,
          aiValue: getFieldValue(field),
          humanValue: review.correctedValue || getFieldValue(field),
          reasoning: review.reasoning,

          // JSON Path data
          errorSource: jsonPath ? { path: jsonPath } : undefined,
          correctedPath: review.correctJsonPath,

          // Error classification
          errorType: review.errorType,

          // Business logic
          businessRule: review.businessRule,

          // Provider notes
          providerNotes: review.providerNotes,

          // Confidence
          confidence: review.confidence
        };
      })
    };

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verificationData, qaReport, feedback, reviewType: 'human_feedback' })
      });

      if (response.ok) {
        alert('Review submitted successfully!');
        setSelectedId(null);
        loadQueue();
      }
    } catch (error) {
      console.error('Failed to submit feedback:', error);
      alert('Failed to submit feedback');
    }
  };

  const getSectionForField = (field: string): string => {
    if (field.includes('patient') || field.includes('subscriber')) return 'Patient Info';
    if (field.includes('insurance') || field.includes('plan')) return 'Insurance Info';
    if (field.includes('coverage') || field.includes('maximum') || field.includes('deductible')) return 'Coverage';
    return 'Other';
  };

  const getFieldLabel = (field: string): string => {
    // Handle array notation like procedure_details[0].code
    const arrayMatch = field.match(/^(\w+)\[(\d+)\]\.(.+)$/);
    if (arrayMatch) {
      const [, arrayName, index, fieldName] = arrayMatch;
      const idx = parseInt(index);
      let itemLabel = `#${idx + 1}`;

      // Get the procedure/treatment code for better labeling
      if (verificationData) {
        // For recent_procedures - pad code to 4 digits and add D prefix
        if (arrayName === 'recent_procedures') {
          const proc = verificationData.recent_procedures?.[idx];
          if (proc?.code) {
            const code = String(proc.code);
            // If code already starts with D, use it as-is, otherwise pad and add D
            itemLabel = code.startsWith('D') ? code : `D${code.padStart(4, '0')}`;
          } else if (proc?.description) {
            itemLabel = proc.description.substring(0, 20);
          }
        }
        // For procedure_details - use code directly or pad if needed
        else if (arrayName === 'procedure_details') {
          const proc = verificationData.procedure_details?.[idx];
          if (proc?.code) {
            const code = String(proc.code);
            itemLabel = code.startsWith('D') ? code : `D${code.padStart(4, '0')}`;
          }
        }
        // For treatment_history - try procedureCode, procedure_code, or code
        else if (arrayName === 'treatment_history') {
          const record = verificationData.treatment_history?.[idx];
          const code = record?.procedureCode || record?.procedure_code || record?.code;
          if (code) {
            const codeStr = String(code);
            itemLabel = codeStr.startsWith('D') ? codeStr : `D${codeStr.padStart(4, '0')}`;
          }
        }
        // Default: try to get code from any array
        else {
          const item = verificationData[arrayName]?.[idx];
          if (item?.code) {
            const code = String(item.code);
            itemLabel = code.startsWith('D') ? code : `D${code.padStart(4, '0')}`;
          }
        }
      }

      const formattedFieldName = fieldName
        .replace(/([A-Z])/g, ' $1')
        .split('_')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
        .trim();

      return `${formattedFieldName} (${itemLabel})`;
    }

    // Regular fields
    return field
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
      .replace(/\./g, ' › ');
  };

  const getFilteredFields = () => {
    const allFields = getAllFields(verificationData || {});
    if (viewMode === 'needs-attention') {
      return allFields.filter(field => {
        const qaIssue = getQAIssue(field);
        const qaCheck = getQACheck(field);
        const review = fieldReviews[field];
        return qaIssue || (qaCheck && !qaCheck.passed) || (review && (review.status === 'incorrect' || review.status === 'flagged'));
      });
    }
    return allFields;
  };

  const filteredItems = items.filter(item => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return item.patientName.toLowerCase().includes(query) ||
             item.insuranceProvider.toLowerCase().includes(query) ||
             item.id.toLowerCase().includes(query);
    }
    return true;
  });

  const reviewedCount = Object.values(fieldReviews).filter(r => r.status !== 'unchecked').length;
  const totalFields = getFilteredFields().length;
  const progressPercent = totalFields > 0 ? Math.round((reviewedCount / totalFields) * 100) : 0;

  const selectedItem = items.find(i => i.id === selectedId);
  const fields = getFilteredFields();
  const currentField = fields[selectedFieldIndex];
  const currentValue = currentField ? getFieldValue(currentField) : null;
  const currentReview = currentField ? fieldReviews[currentField] : null;
  const currentQAIssue = currentField ? getQAIssue(currentField) : null;
  const currentQACheck = currentField ? getQACheck(currentField) : null;

  return (
    <div className="h-screen flex flex-col bg-slate-950 text-slate-100 font-sans overflow-hidden">
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap');

        :root {
          --purple-primary: #673499;
          --purple-light: #7848AB;
          --cyan: #63DAE0;
          --green: #0ED11C;
        }

        * {
          font-family: 'DM Sans', -apple-system, sans-serif;
        }

        .font-mono {
          font-family: 'JetBrains Mono', 'Courier New', monospace;
        }

        .status-correct { background: #0ED11C; color: white; }
        .status-incorrect { background: #EF4444; color: white; }
        .status-flagged { background: #F59E0B; color: white; }
        .status-unchecked { background: #475569; color: #94A3B8; }
      `}</style>

      {/* Header */}
      <div className="h-14 border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-cyan-500 flex items-center justify-center">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-lg font-bold font-mono" style={{ color: 'var(--cyan)' }}>VERIFICATION REVIEW SYSTEM</h1>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono text-slate-400">
          <div>HOTKEYS: <span className="text-cyan-400">1</span>=Correct <span className="text-cyan-400">2</span>=Wrong <span className="text-cyan-400">3</span>=Flag <span className="text-cyan-400">TAB</span>=Next</div>
        </div>
      </div>

      {/* Main 3-Column Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT: Queue List */}
        <div className="w-72 border-r border-slate-800 bg-slate-900/30 flex flex-col">
          <div className="p-3 border-b border-slate-800">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <Input
                placeholder="Search queue..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 bg-slate-800 border-slate-700 text-sm font-mono"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-slate-500 text-sm">Loading...</div>
            ) : filteredItems.length === 0 ? (
              <div className="p-4 text-center text-slate-500 text-sm">No items</div>
            ) : (
              <div className="p-2 space-y-1">
                {filteredItems.map(item => (
                  <button
                    key={item.id}
                    onClick={() => loadVerification(item.id)}
                    className={`w-full text-left p-3 rounded-lg transition-all ${
                      selectedId === item.id
                        ? 'bg-purple-600 text-white'
                        : 'hover:bg-slate-800 text-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <div className="font-semibold text-sm truncate flex-1">{item.patientName}</div>
                      {item.qaScore !== null && (
                        <div className={`text-xs font-mono ml-2 px-1.5 py-0.5 rounded ${
                          item.qaScore >= 90 ? 'bg-green-500/20 text-green-400' :
                          item.qaScore >= 70 ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-red-500/20 text-red-400'
                        }`}>
                          {item.qaScore}
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 truncate">{item.insuranceProvider}</div>
                    <div className="flex items-center gap-2 mt-1.5">
                      {item.criticalIssues > 0 && (
                        <Badge className="bg-red-600 text-white text-[10px] px-1.5 py-0">{item.criticalIssues} critical</Badge>
                      )}
                      <span className="text-[10px] text-slate-500 font-mono">{item.id.slice(0, 12)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* CENTER: Field Review Grid */}
        {selectedId && verificationData ? (
          <div className="flex-1 flex flex-col bg-slate-900/20">
            {/* Controls */}
            <div className="h-12 border-b border-slate-800 flex items-center justify-between px-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setViewMode('needs-attention')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded transition-all ${
                    viewMode === 'needs-attention'
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  NEEDS ATTENTION ({getFilteredFields().length})
                </button>
                <button
                  onClick={() => setViewMode('all')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded transition-all ${
                    viewMode === 'all'
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  ALL FIELDS ({getAllFields(verificationData).length})
                </button>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-xs font-mono text-slate-400">
                  Progress: <span style={{ color: 'var(--cyan)' }}>{progressPercent}%</span>
                </div>
                <div className="w-32 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-600 to-cyan-500 transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Field Grid */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-3 gap-3">
                {fields.map((field, idx) => {
                  const value = getFieldValue(field);
                  const review = fieldReviews[field];
                  const isSelected = idx === selectedFieldIndex;
                  const qaIssue = getQAIssue(field);
                  const qaCheck = getQACheck(field);

                  let statusClass = 'status-unchecked';
                  if (review.status === 'correct') statusClass = 'status-correct';
                  else if (review.status === 'incorrect') statusClass = 'status-incorrect';
                  else if (review.status === 'flagged') statusClass = 'status-flagged';

                  return (
                    <button
                      key={field}
                      onClick={() => setSelectedFieldIndex(idx)}
                      className={`p-3 rounded-lg border-2 transition-all text-left ${
                        isSelected
                          ? 'border-cyan-500 bg-slate-800 ring-2 ring-cyan-500/30'
                          : qaIssue || (qaCheck && !qaCheck.passed)
                            ? 'border-red-500/30 bg-slate-800/50 hover:border-red-500/50'
                            : 'border-slate-700 bg-slate-800/30 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="text-xs font-semibold text-slate-300 truncate flex-1">
                          {getFieldLabel(field)}
                        </div>
                        <div className={`ml-2 px-2 py-0.5 rounded text-[10px] font-bold ${statusClass}`}>
                          {review.status === 'correct' ? '✓' :
                           review.status === 'incorrect' ? '✗' :
                           review.status === 'flagged' ? '⚑' : '−'}
                        </div>
                      </div>
                      <div className="text-xs font-mono text-slate-400 truncate">
                        {value !== null && value !== undefined ? String(value) : <span className="italic">null</span>}
                      </div>
                      {(qaIssue || (qaCheck && !qaCheck.passed)) && (
                        <div className="mt-2 flex items-center gap-1 text-[10px] text-red-400">
                          <AlertCircle className="h-3 w-3" />
                          <span>QA Issue</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-slate-900/20">
            <div className="text-center">
              <ChevronRight className="h-16 w-16 text-slate-700 mx-auto mb-4" />
              <p className="text-slate-500 font-mono text-sm">Select a verification from the queue</p>
            </div>
          </div>
        )}

        {/* RIGHT: Context Panel */}
        {selectedId && verificationData && currentField ? (
          <div className="w-80 border-l border-slate-800 bg-slate-900/30 flex flex-col">
            <div className="p-4 border-b border-slate-800">
              <h3 className="text-sm font-bold text-cyan-400 mb-1 font-mono">FIELD DETAILS</h3>
              <p className="text-xs text-slate-400 font-mono">{currentField}</p>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Value */}
              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2 block">Current Value</label>
                <div className="bg-slate-800 border border-slate-700 p-3 rounded font-mono text-sm text-slate-200">
                  {currentValue !== null && currentValue !== undefined ? String(currentValue) : <span className="italic text-slate-500">null</span>}
                </div>
              </div>

              {/* Current Path */}
              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2 block">Current Path</label>
                <div className="bg-slate-800 border border-slate-700 p-3 rounded">
                  {(() => {
                    const jsonPath = getJsonPathForField(currentField);
                    return jsonPath ? (
                      <code className="text-xs text-cyan-400 font-mono break-all">
                        {jsonPath}
                      </code>
                    ) : (
                      <span className="text-xs text-slate-500 italic">No path metadata available</span>
                    );
                  })()}
                </div>
              </div>

              {/* QA Issues */}
              {currentQAIssue && (
                <div className="bg-red-500/10 border border-red-500/30 p-3 rounded">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="h-4 w-4 text-red-400" />
                    <span className="text-xs font-bold text-red-400 uppercase">QA Issue</span>
                  </div>
                  <p className="text-xs text-slate-300 mb-2">{currentQAIssue.reasoning}</p>
                  {currentQAIssue.suggestedFix && (
                    <div className="mt-2 pt-2 border-t border-red-500/20">
                      <p className="text-[10px] uppercase text-slate-500 mb-1">Suggested Fix:</p>
                      <p className="text-xs text-green-400">{currentQAIssue.suggestedFix}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Review Actions */}
              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2 block">Your Review</label>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <button
                    onClick={() => updateFieldReview(currentField, { status: 'correct' })}
                    className={`h-12 flex flex-col items-center justify-center rounded border-2 transition-all ${
                      currentReview?.status === 'correct'
                        ? 'bg-green-500 border-green-600 text-white'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-green-500'
                    }`}
                  >
                    <Check className="h-4 w-4 mb-1" />
                    <span className="text-[10px] font-bold">1</span>
                  </button>
                  <button
                    onClick={() => updateFieldReview(currentField, { status: 'incorrect' })}
                    className={`h-12 flex flex-col items-center justify-center rounded border-2 transition-all ${
                      currentReview?.status === 'incorrect'
                        ? 'bg-red-500 border-red-600 text-white'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-red-500'
                    }`}
                  >
                    <X className="h-4 w-4 mb-1" />
                    <span className="text-[10px] font-bold">2</span>
                  </button>
                  <button
                    onClick={() => updateFieldReview(currentField, { status: 'flagged' })}
                    className={`h-12 flex flex-col items-center justify-center rounded border-2 transition-all ${
                      currentReview?.status === 'flagged'
                        ? 'bg-yellow-500 border-yellow-600 text-white'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-yellow-500'
                    }`}
                  >
                    <Flag className="h-4 w-4 mb-1" />
                    <span className="text-[10px] font-bold">3</span>
                  </button>
                </div>

                {/* Confidence Rating - Show for all reviewed fields */}
                {currentReview && currentReview.status !== 'unchecked' && (
                  <div className="mt-3 pt-3 border-t border-slate-700">
                    <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2 block">
                      Confidence Level
                    </label>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map(rating => (
                        <button
                          key={rating}
                          onClick={() => updateFieldReview(currentField, { confidence: rating as any })}
                          className={`flex-1 h-10 rounded border-2 transition-all text-xs font-bold ${
                            currentReview.confidence === rating
                              ? 'bg-yellow-500 border-yellow-600 text-white'
                              : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-yellow-500'
                          }`}
                        >
                          {rating}★
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1 text-center">
                      1 = Uncertain • 5 = Very Confident
                    </p>
                  </div>
                )}

                {currentReview?.status === 'incorrect' && (
                  <div className="space-y-3 mt-3">
                    {/* Correct Value */}
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2 block">
                        Correct Value
                      </label>
                      <Input
                        placeholder="Enter correct value..."
                        value={currentReview.correctedValue || ''}
                        onChange={(e) => updateFieldReview(currentField, { correctedValue: e.target.value })}
                        className="bg-slate-800 border-slate-700 text-sm h-9 font-mono"
                      />
                    </div>

                    {/* Correct Path */}
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2 block">
                        Correct Path
                      </label>
                      <Textarea
                        placeholder="e.g. coverage.accumulators[1].remaining.individual.inNetwork"
                        value={currentReview.correctJsonPath || ''}
                        onChange={(e) => updateFieldReview(currentField, { correctJsonPath: e.target.value })}
                        rows={2}
                        className="bg-slate-800 border-slate-700 text-xs font-mono"
                      />
                    </div>

                    {/* Error Type Dropdown */}
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2 block">
                        Error Type
                      </label>
                      <Select
                        value={currentReview.errorType || ''}
                        onValueChange={(v: any) => updateFieldReview(currentField, { errorType: v })}
                      >
                        <SelectTrigger className="bg-slate-800 border-slate-700 text-xs h-9">
                          <SelectValue placeholder="Select error type..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="wrong_json_path">Wrong JSON Path</SelectItem>
                          <SelectItem value="calculation_error">Calculation Error</SelectItem>
                          <SelectItem value="business_rule_violation">Business Rule Violation</SelectItem>
                          <SelectItem value="mapping_error">Mapping Error</SelectItem>
                          <SelectItem value="format_error">Format Error</SelectItem>
                          <SelectItem value="missing_data">Missing Data</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Business Rule - only show if error is business_rule_violation */}
                    {currentReview.errorType === 'business_rule_violation' && (
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2 block">
                          Business Rule Violated
                        </label>
                        <Textarea
                          placeholder="e.g. Deductible must be applied before coinsurance"
                          value={currentReview.businessRule || ''}
                          onChange={(e) => updateFieldReview(currentField, { businessRule: e.target.value })}
                          rows={2}
                          className="bg-slate-800 border-slate-700 text-xs"
                        />
                      </div>
                    )}

                    {/* Provider Notes */}
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2 block">
                        Provider Notes (Optional)
                      </label>
                      <Textarea
                        placeholder="Provider-specific observations..."
                        value={currentReview.providerNotes || ''}
                        onChange={(e) => updateFieldReview(currentField, { providerNotes: e.target.value })}
                        rows={2}
                        className="bg-slate-800 border-slate-700 text-xs"
                      />
                    </div>

                    {/* Reasoning */}
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2 block">
                        Why is this incorrect?
                      </label>
                      <Textarea
                        placeholder="Explain the error..."
                        value={currentReview.reasoning || ''}
                        onChange={(e) => updateFieldReview(currentField, { reasoning: e.target.value })}
                        rows={3}
                        className="bg-slate-800 border-slate-700 text-xs font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Navigation */}
              <div className="flex gap-2">
                <button
                  onClick={moveToPrevField}
                  disabled={selectedFieldIndex === 0}
                  className="flex-1 h-9 bg-slate-800 border border-slate-700 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed rounded text-xs font-bold transition-all"
                >
                  ← PREV
                </button>
                <button
                  onClick={moveToNextField}
                  disabled={selectedFieldIndex >= fields.length - 1}
                  className="flex-1 h-9 bg-slate-800 border border-slate-700 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed rounded text-xs font-bold transition-all"
                >
                  NEXT →
                </button>
              </div>
            </div>

            {/* Patient Info */}
            {selectedItem && (
              <div className="p-4 border-t border-slate-800 bg-slate-900/50">
                <h4 className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">Verification Info</h4>
                <div className="space-y-1 text-xs font-mono text-slate-400">
                  <div><span className="text-slate-500">Patient:</span> {selectedItem.patientName}</div>
                  <div><span className="text-slate-500">Insurance:</span> {selectedItem.insuranceProvider}</div>
                  <div><span className="text-slate-500">Office:</span> {selectedItem.officeKey}</div>
                  {selectedItem.qaScore !== null && (
                    <div><span className="text-slate-500">QA Score:</span> <span className={
                      selectedItem.qaScore >= 90 ? 'text-green-400' :
                      selectedItem.qaScore >= 70 ? 'text-yellow-400' :
                      'text-red-400'
                    }>{selectedItem.qaScore}%</span></div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : selectedId && (
          <div className="w-80 border-l border-slate-800 bg-slate-900/30 flex items-center justify-center">
            <p className="text-slate-500 text-sm">Select a field</p>
          </div>
        )}
      </div>

      {/* FOOTER: Submit Controls (Sticky) */}
      {selectedId && verificationData && (
        <div className="h-20 border-t border-slate-800 bg-slate-900 flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Select value={reviewerId} onValueChange={setReviewerId}>
              <SelectTrigger className="w-64 h-10 bg-slate-800 border-slate-700 font-mono text-xs">
                <SelectValue placeholder="Select reviewer email..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="reviewer1@example.com">reviewer1@example.com</SelectItem>
                <SelectItem value="reviewer2@example.com">reviewer2@example.com</SelectItem>
                <SelectItem value="assistant@example.com">assistant@example.com</SelectItem>
              </SelectContent>
            </Select>

            <Select value={approval} onValueChange={(v: any) => setApproval(v)}>
              <SelectTrigger className="w-48 h-10 bg-slate-800 border-slate-700 font-mono text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="approved_with_corrections">With Corrections</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>

            <Input
              placeholder="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-64 h-10 bg-slate-800 border-slate-700 font-mono text-xs"
            />
          </div>

          <div className="flex items-center gap-4">
            <div className="text-xs font-mono text-slate-400">
              Time: {Math.round((Date.now() - startTime) / 1000)}s
            </div>
            <Button
              onClick={() => setSelectedId(null)}
              variant="outline"
              className="h-10 px-6 bg-slate-800 border-slate-700 hover:bg-slate-700 text-xs font-bold"
            >
              CANCEL
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!reviewerId}
              className="h-10 px-8 bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-700 hover:to-cyan-700 text-white font-bold text-xs disabled:opacity-50"
            >
              <Send className="mr-2 h-4 w-4" />
              SUBMIT REVIEW
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
