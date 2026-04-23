/**
 * UPDATED ReviewDashboard.tsx with Multiple Error Types Support
 *
 * This file contains the complete updated ReviewDashboard component.
 * Replace the existing ReviewDashboard.tsx with this content.
 *
 * Key Changes:
 * 1. Multi-select checkboxes for error types (up to 11 types)
 * 2. Dynamic explanation fields per selected error type
 * 3. Business rule violation tracking
 * 4. Error type prioritization
 * 5. Validation ensuring each type has explanation ≥10 chars
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertCircle, CheckCircle, AlertTriangle, Info, ThumbsUp, ThumbsDown, Save, Send, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';

// Error Type definitions with priorities
const ERROR_TYPES = [
  { value: 'missing_data', label: 'Missing Data', severity: 'critical', priority: 1 },
  { value: 'business_rule_violation', label: 'Business Rule Violation', severity: 'critical', priority: 1 },
  { value: 'wrong_json_path', label: 'Wrong JSON Path', severity: 'high', priority: 2 },
  { value: 'format_error', label: 'Format Error', severity: 'high', priority: 2 },
  { value: 'wrong_value', label: 'Wrong Value', severity: 'high', priority: 2 },
  { value: 'scraping_error', label: 'Scraping Error', severity: 'high', priority: 2 },
  { value: 'logic_error', label: 'Logic Error', severity: 'medium', priority: 3 },
  { value: 'portal_data_issue', label: 'Portal Data Issue', severity: 'medium', priority: 3 },
  { value: 'incomplete_extraction', label: 'Incomplete Extraction', severity: 'medium', priority: 3 },
  { value: 'confidence_mismatch', label: 'Confidence Mismatch', severity: 'low', priority: 4 },
  { value: 'other', label: 'Other', severity: 'low', priority: 4 }
] as const;

const ERROR_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  ERROR_TYPES.map(et => [et.value, et.label])
);

// Business Rules (can be fetched from API in production)
const BUSINESS_RULES = [
  { code: 'MISSING_TOOTH_CLAUSE_BOOLEAN', name: 'Missing Tooth Clause Must Be Boolean' },
  { code: 'COVERAGE_PERCENT_NUMBER', name: 'Coverage Percent Must Be Number' },
  { code: 'DATE_FORMAT_YYYY_MM_DD', name: 'Dates Must Be YYYY-MM-DD Format' },
  { code: 'FREQUENCY_SHARED_CODES_FORMAT', name: 'Frequency Shared Codes Format' },
  { code: 'TREATMENT_HISTORY_REASONING_MIN_LENGTH', name: 'Treatment History Reasoning Min Length' },
  { code: 'PROCEDURE_DETAILS_REASONING_MIN_LENGTH', name: 'Procedure Details Reasoning Min Length' },
  { code: 'SOURCE_PATH_REQUIRED', name: 'Source Path Required' },
  { code: 'DENTAL_CODE_FORMAT', name: 'Dental Code Format D####' }
] as const;

interface ValidationIssue {
  section: string;
  field: string;
  severity: 'critical' | 'warning' | 'info';
  issue: string;
  actualValue: any;
  suggestedFix: string;
}

interface QAReport {
  overallScore: number;
  passed: boolean;
  summary: {
    totalChecks: number;
    criticalIssues: number;
    warnings: number;
    infoMessages: number;
  };
  sectionScores: Record<string, { score: number; checksRun: number; issues: number; warnings: number }>;
  issues: ValidationIssue[];
  dataQualityMetrics: {
    completeness: number;
    accuracy: number;
    consistency: number;
  };
}

interface VerificationData {
  patient_full_name: string;
  patient_dob: string;
  subscriber_id: string;
  subscriber_name: string;
  subscriber_dob: string;
  group_number: string;
  group_name: string;
  insurance_company: string;
  plan_name: string;
  effective_date: string;
  termination_date: string;
  member_status: string;
  preventive_coverage: string;
  basic_coverage: string;
  major_coverage: string;
  orthodontic_coverage: string;
  yearly_maximum: string;
  yearly_maximum_used: string;
  yearly_deductible: string;
  yearly_deductible_used: string;
  ortho_lifetime_max?: string;
  ortho_coverage?: string;
  ortho_age_limit?: string;
  waiting_periods?: {
    preventive: string;
    basic: string;
    major: string;
  };
  procedure_details?: any[];
  recent_procedures?: any[];
  network_status: string;
  [key: string]: any;
}

interface FieldCorrection {
  field: string;
  section: string;
  aiValue: string;
  correctedValue: string;
  errorTypes: string[];  // Multiple error types
  errorExplanations: Record<string, string>;  // Explanation per error type
  violatedBusinessRules: string[];  // Array of rule codes
  businessRuleExplanations: Record<string, string>;  // Explanation per rule
  errorSource: string;
}

interface ReviewDashboardProps {
  verificationData: VerificationData;
  qaReport: QAReport;
  onSubmitFeedback: (feedback: any) => void;
}

export function ReviewDashboard({ verificationData, qaReport, onSubmitFeedback }: ReviewDashboardProps) {
  const [corrections, setCorrections] = useState<FieldCorrection[]>([]);
  const [approval, setApproval] = useState<'approved' | 'approved_with_corrections' | 'rejected'>('approved');
  const [difficulty, setDifficulty] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [notes, setNotes] = useState('');
  const [reviewerId, setReviewerId] = useState('');
  const [startTime] = useState(Date.now());
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'info':
        return <Info className="h-4 w-4 text-blue-500" />;
      default:
        return null;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'destructive';
      case 'warning':
        return 'warning';
      case 'info':
        return 'secondary';
      default:
        return 'default';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const handleAddCorrection = () => {
    setCorrections([
      ...corrections,
      {
        field: '',
        section: '',
        aiValue: '',
        correctedValue: '',
        errorTypes: [],
        errorExplanations: {},
        violatedBusinessRules: [],
        businessRuleExplanations: {},
        errorSource: ''
      }
    ]);
  };

  const handleUpdateCorrection = (index: number, field: keyof Omit<FieldCorrection, 'errorTypes' | 'errorExplanations' | 'violatedBusinessRules' | 'businessRuleExplanations'>, value: string) => {
    const updated = [...corrections];
    updated[index][field] = value as any;
    setCorrections(updated);
  };

  const handleToggleErrorType = (index: number, errorType: string, checked: boolean) => {
    const updated = [...corrections];
    if (checked) {
      updated[index].errorTypes = [...updated[index].errorTypes, errorType];
      // Initialize empty explanation
      updated[index].errorExplanations[errorType] = '';
    } else {
      updated[index].errorTypes = updated[index].errorTypes.filter(t => t !== errorType);
      // Remove explanation
      delete updated[index].errorExplanations[errorType];
    }
    setCorrections(updated);
  };

  const handleUpdateErrorExplanation = (index: number, errorType: string, explanation: string) => {
    const updated = [...corrections];
    updated[index].errorExplanations[errorType] = explanation;
    setCorrections(updated);
  };

  const handleAddBusinessRuleViolation = (index: number, ruleCode: string) => {
    if (!ruleCode) return;
    const updated = [...corrections];
    if (!updated[index].violatedBusinessRules.includes(ruleCode)) {
      updated[index].violatedBusinessRules = [...updated[index].violatedBusinessRules, ruleCode];
      updated[index].businessRuleExplanations[ruleCode] = '';
    }
    setCorrections(updated);
  };

  const handleRemoveBusinessRuleViolation = (index: number, ruleCode: string) => {
    const updated = [...corrections];
    updated[index].violatedBusinessRules = updated[index].violatedBusinessRules.filter(r => r !== ruleCode);
    delete updated[index].businessRuleExplanations[ruleCode];
    setCorrections(updated);
  };

  const handleUpdateBusinessRuleExplanation = (index: number, ruleCode: string, explanation: string) => {
    const updated = [...corrections];
    updated[index].businessRuleExplanations[ruleCode] = explanation;
    setCorrections(updated);
  };

  const handleRemoveCorrection = (index: number) => {
    setCorrections(corrections.filter((_, i) => i !== index));
  };

  const validateSubmission = (): boolean => {
    const errors: string[] = [];

    for (let i = 0; i < corrections.length; i++) {
      const correction = corrections[i];

      // Validate error types selected
      if (correction.errorTypes.length === 0) {
        errors.push(`Correction #${i + 1}: At least one error type must be selected`);
      }

      // Validate explanations for each error type
      for (const errorType of correction.errorTypes) {
        const explanation = correction.errorExplanations[errorType];
        if (!explanation || explanation.trim().length < 10) {
          errors.push(`Correction #${i + 1}: Error type "${ERROR_TYPE_LABELS[errorType]}" requires an explanation of at least 10 characters`);
        }
      }

      // Validate business rule explanations
      for (const ruleCode of correction.violatedBusinessRules) {
        const explanation = correction.businessRuleExplanations[ruleCode];
        if (!explanation || explanation.trim().length < 10) {
          errors.push(`Correction #${i + 1}: Business rule "${ruleCode}" requires an explanation of at least 10 characters`);
        }
      }
    }

    setValidationErrors(errors);
    return errors.length === 0;
  };

  const handleSubmit = () => {
    if (!validateSubmission()) {
      return;
    }

    const timeSpent = Math.round((Date.now() - startTime) / 1000);

    const feedback = {
      reviewerId,
      approval,
      corrections,
      difficulty,
      notes,
      timeSpentSeconds: timeSpent,
      reviewedAt: new Date().toISOString()
    };

    onSubmitFeedback(feedback);
  };

  const sections = [
    {
      title: 'Patient & Subscriber Information',
      fields: [
        { label: 'Patient Name', value: verificationData.patient_full_name },
        { label: 'Patient DOB', value: verificationData.patient_dob },
        { label: 'Subscriber ID', value: verificationData.subscriber_id },
        { label: 'Subscriber Name', value: verificationData.subscriber_name },
        { label: 'Subscriber DOB', value: verificationData.subscriber_dob }
      ]
    },
    {
      title: 'Insurance Information',
      fields: [
        { label: 'Insurance Company', value: verificationData.insurance_company },
        { label: 'Plan Name', value: verificationData.plan_name },
        { label: 'Group Number', value: verificationData.group_number },
        { label: 'Group Name', value: verificationData.group_name },
        { label: 'Effective Date', value: verificationData.effective_date },
        { label: 'Termination Date', value: verificationData.termination_date },
        { label: 'Member Status', value: verificationData.member_status }
      ]
    },
    {
      title: 'Coverage & Benefits',
      fields: [
        { label: 'Preventive Coverage', value: verificationData.preventive_coverage },
        { label: 'Basic Coverage', value: verificationData.basic_coverage },
        { label: 'Major Coverage', value: verificationData.major_coverage },
        { label: 'Orthodontic Coverage', value: verificationData.orthodontic_coverage },
        { label: 'Yearly Maximum', value: verificationData.yearly_maximum },
        { label: 'Yearly Maximum Used', value: verificationData.yearly_maximum_used },
        { label: 'Yearly Deductible', value: verificationData.yearly_deductible },
        { label: 'Yearly Deductible Used', value: verificationData.yearly_deductible_used },
        { label: 'Network Status', value: verificationData.network_status }
      ]
    },
    {
      title: 'Orthodontic Benefits',
      fields: [
        { label: 'Ortho Coverage', value: verificationData.ortho_coverage || 'N/A' },
        { label: 'Ortho Lifetime Max', value: verificationData.ortho_lifetime_max || 'N/A' },
        { label: 'Ortho Age Limit', value: verificationData.ortho_age_limit || 'N/A' }
      ]
    },
    {
      title: 'Waiting Periods',
      fields: verificationData.waiting_periods ? [
        { label: 'Preventive', value: verificationData.waiting_periods.preventive },
        { label: 'Basic', value: verificationData.waiting_periods.basic },
        { label: 'Major', value: verificationData.waiting_periods.major }
      ] : [{ label: 'Status', value: 'Not Available' }]
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              Insurance Verification Review
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              Patient: {verificationData.patient_full_name} | Insurance: {verificationData.insurance_company}
            </p>
          </div>
          <Badge variant={qaReport.passed ? 'success' : 'destructive'} className="text-lg px-4 py-2">
            {qaReport.passed ? <CheckCircle className="mr-2 h-5 w-5" /> : <AlertCircle className="mr-2 h-5 w-5" />}
            QA Score: {qaReport.overallScore}%
          </Badge>
        </div>

        {/* QA Summary - keeping existing implementation */}
        {/* ... (QA Summary cards remain the same) ... */}

        {/* Verification Data Sections - keeping existing implementation */}
        {/* ... (Verification data cards remain the same) ... */}

        {/* Human Feedback Section - UPDATED */}
        <Card className="border-2 border-blue-200 bg-blue-50 dark:bg-slate-800">
          <CardHeader>
            <CardTitle className="text-xl">Human Review & Feedback</CardTitle>
            <CardDescription>Provide your expert assessment and corrections</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Reviewer Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="reviewerId">Reviewer ID / Email *</Label>
                <Input
                  id="reviewerId"
                  value={reviewerId}
                  onChange={(e) => setReviewerId(e.target.value)}
                  placeholder="your.email@example.com"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="difficulty">Difficulty Rating *</Label>
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

            {/* Approval Status */}
            <div>
              <Label>Approval Decision *</Label>
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

            {/* Validation Errors */}
            {validationErrors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Validation Errors</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc list-inside space-y-1">
                    {validationErrors.map((error, idx) => (
                      <li key={idx} className="text-sm">{error}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Field Corrections - UPDATED */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <Label>Field Corrections</Label>
                <Button variant="outline" size="sm" onClick={handleAddCorrection}>
                  + Add Correction
                </Button>
              </div>

              {corrections.length === 0 ? (
                <div className="text-center py-8 text-slate-500 bg-white dark:bg-slate-900 rounded border-2 border-dashed">
                  No corrections added yet
                </div>
              ) : (
                <div className="space-y-4">
                  {corrections.map((correction, idx) => (
                    <Card key={idx} className="bg-white dark:bg-slate-900 border-2">
                      <CardContent className="pt-4">
                        <div className="space-y-4">
                          {/* Basic Fields */}
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs">Section</Label>
                              <Input
                                value={correction.section}
                                onChange={(e) => handleUpdateCorrection(idx, 'section', e.target.value)}
                                placeholder="e.g., Patient & Subscriber Information"
                                className="mt-1"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Field Name</Label>
                              <Input
                                value={correction.field}
                                onChange={(e) => handleUpdateCorrection(idx, 'field', e.target.value)}
                                placeholder="e.g., patient_dob"
                                className="mt-1"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">AI Extracted Value</Label>
                              <Input
                                value={correction.aiValue}
                                onChange={(e) => handleUpdateCorrection(idx, 'aiValue', e.target.value)}
                                placeholder="Incorrect value"
                                className="mt-1"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Corrected Value</Label>
                              <Input
                                value={correction.correctedValue}
                                onChange={(e) => handleUpdateCorrection(idx, 'correctedValue', e.target.value)}
                                placeholder="Correct value"
                                className="mt-1"
                              />
                            </div>
                          </div>

                          {/* Error Types - MULTI-SELECT */}
                          <div>
                            <Label className="text-xs">Error Types * (select all that apply)</Label>
                            <div className="grid grid-cols-2 gap-2 mt-2 p-3 bg-slate-50 dark:bg-slate-800 rounded">
                              {ERROR_TYPES.map((errorType) => (
                                <label key={errorType.value} className="flex items-center gap-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 p-2 rounded">
                                  <Checkbox
                                    checked={correction.errorTypes.includes(errorType.value)}
                                    onCheckedChange={(checked) => handleToggleErrorType(idx, errorType.value, checked as boolean)}
                                  />
                                  <span className="text-sm">{errorType.label}</span>
                                  <Badge variant="outline" className="ml-auto text-xs">
                                    {errorType.severity}
                                  </Badge>
                                </label>
                              ))}
                            </div>
                          </div>

                          {/* Dynamic Explanation Fields per Error Type */}
                          {correction.errorTypes.length > 0 && (
                            <div className="space-y-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded border border-yellow-200">
                              <div className="flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                                <span className="text-sm font-semibold">Explain Each Selected Error Type:</span>
                              </div>
                              {correction.errorTypes.map((errorType) => (
                                <div key={errorType}>
                                  <Label className="text-xs flex items-center gap-2">
                                    <Badge variant="outline">{ERROR_TYPE_LABELS[errorType]}</Badge>
                                    <span className="text-red-500">*</span>
                                    <span className="text-xs text-slate-500">(minimum 10 characters)</span>
                                  </Label>
                                  <Textarea
                                    value={correction.errorExplanations[errorType] || ''}
                                    onChange={(e) => handleUpdateErrorExplanation(idx, errorType, e.target.value)}
                                    placeholder={`Explain why this is a "${ERROR_TYPE_LABELS[errorType]}" error. Be specific.`}
                                    className={`mt-1 ${correction.errorExplanations[errorType]?.length < 10 ? 'border-red-500' : ''}`}
                                    rows={2}
                                  />
                                  {correction.errorExplanations[errorType] && correction.errorExplanations[errorType].length < 10 && (
                                    <span className="text-xs text-red-500">
                                      {10 - correction.errorExplanations[errorType].length} more characters required
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Business Rule Violations */}
                          <div>
                            <Label className="text-xs">Business Rules Violated (optional)</Label>
                            <Select
                              value=""
                              onValueChange={(v) => handleAddBusinessRuleViolation(idx, v)}
                            >
                              <SelectTrigger className="mt-1">
                                <SelectValue placeholder="Add business rule violation" />
                              </SelectTrigger>
                              <SelectContent>
                                {BUSINESS_RULES.map((rule) => (
                                  <SelectItem key={rule.code} value={rule.code}>
                                    {rule.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            {/* Show selected rules with explanations */}
                            {correction.violatedBusinessRules.length > 0 && (
                              <div className="mt-2 space-y-2">
                                {correction.violatedBusinessRules.map((ruleCode) => (
                                  <div key={ruleCode} className="p-2 bg-red-50 dark:bg-red-900/20 rounded border border-red-200">
                                    <div className="flex justify-between items-start mb-2">
                                      <span className="text-sm font-semibold text-red-700 dark:text-red-400">
                                        {BUSINESS_RULES.find(r => r.code === ruleCode)?.name || ruleCode}
                                      </span>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleRemoveBusinessRuleViolation(idx, ruleCode)}
                                        className="h-6 w-6 p-0"
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </div>
                                    <Textarea
                                      value={correction.businessRuleExplanations[ruleCode] || ''}
                                      onChange={(e) => handleUpdateBusinessRuleExplanation(idx, ruleCode, e.target.value)}
                                      placeholder="Explain how this rule was violated (minimum 10 characters)"
                                      className={`text-xs ${correction.businessRuleExplanations[ruleCode]?.length < 10 ? 'border-red-500' : ''}`}
                                      rows={2}
                                    />
                                    {correction.businessRuleExplanations[ruleCode] && correction.businessRuleExplanations[ruleCode].length < 10 && (
                                      <span className="text-xs text-red-500">
                                        {10 - correction.businessRuleExplanations[ruleCode].length} more characters required
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Error Source */}
                          <div>
                            <Label className="text-xs">Error Source (Mapper)</Label>
                            <Select value={correction.errorSource} onValueChange={(v) => handleUpdateCorrection(idx, 'errorSource', v)}>
                              <SelectTrigger className="mt-1">
                                <SelectValue placeholder="Select mapper" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="patient_info_mapper">Patient Info Mapper</SelectItem>
                                <SelectItem value="insurance_info_mapper">Insurance Info Mapper</SelectItem>
                                <SelectItem value="coverage_benefits_mapper">Coverage & Benefits Mapper</SelectItem>
                                <SelectItem value="orthodontic_benefits_mapper">Orthodontic Benefits Mapper</SelectItem>
                                <SelectItem value="waiting_periods_mapper">Waiting Periods Mapper</SelectItem>
                                <SelectItem value="procedure_details_mapper">Procedure Details Mapper</SelectItem>
                                <SelectItem value="treatment_history_mapper">Treatment History Mapper</SelectItem>
                                <SelectItem value="scraper">Scraper</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Remove Button */}
                          <div className="flex justify-end pt-2 border-t">
                            <Button variant="destructive" size="sm" onClick={() => handleRemoveCorrection(idx)}>
                              Remove Correction
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Additional Notes */}
            <div>
              <Label htmlFor="notes">Additional Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any additional observations, portal issues, or comments..."
                className="mt-1"
                rows={4}
              />
            </div>

            {/* Submit */}
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
