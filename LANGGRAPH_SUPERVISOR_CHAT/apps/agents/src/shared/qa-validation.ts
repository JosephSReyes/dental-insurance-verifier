import * as fs from 'fs/promises';
import * as path from 'path';
import { StandardVerificationData } from './verification-types.js';

export type ValidationSeverity = 'critical' | 'warning' | 'info';
export type ValidationCheckType = 'presence' | 'format' | 'logic' | 'consistency';

export interface ValidationIssue {
  section: string;
  field: string;
  severity: ValidationSeverity;
  checkType: ValidationCheckType;
  issue: string;
  actualValue: any;
  expectedFormat?: string;
  reasoning: string;
  suggestedFix: string;
  autoFixable: boolean;
  affectedDownstream: string[];
}

export interface SectionScore {
  score: number;
  checksRun: number;
  issues: number;
  warnings: number;
}

export interface ValidationCheck {
  section: string;
  field: string;
  passed: boolean;
  checkType: ValidationCheckType;
  actualValue: any;
  expectedFormat?: string;
  reasoning: string;
}

export interface ValidationReport {
  timestamp: string;
  verificationId: string;
  patientName: string;
  insuranceProvider: string;
  officeKey: string;
  
  overallScore: number;
  passed: boolean;
  
  summary: {
    totalChecks: number;
    criticalIssues: number;
    warnings: number;
    infoMessages: number;
  };
  
  sectionScores: {
    [section: string]: SectionScore;
  };
  
  issues: ValidationIssue[];
  checks: ValidationCheck[];
  
  dataQualityMetrics: {
    completeness: number;
    accuracy: number;
    consistency: number;
  };
}

export class QAValidator {
  private issues: ValidationIssue[] = [];
  private checks: ValidationCheck[] = [];
  private checksRun = 0;
  private sectionChecks: Map<string, { total: number; passed: number }> = new Map();

  constructor(
    private formData: StandardVerificationData,
    private requestedPatientName?: string
  ) {}

  private addIssue(issue: ValidationIssue): void {
    this.issues.push(issue);
  }

  private addCheck(check: ValidationCheck): void {
    this.checks.push(check);
  }

  private recordCheck(section: string, passed: boolean): void {
    this.checksRun++;
    if (!this.sectionChecks.has(section)) {
      this.sectionChecks.set(section, { total: 0, passed: 0 });
    }
    const stats = this.sectionChecks.get(section)!;
    stats.total++;
    if (passed) stats.passed++;
  }

  validatePatientSubscriberInfo(): void {
    const section = 'Patient & Subscriber Information';
    console.log(`[QA] Validating: ${section}`);

    this.checkField(section, 'patient_full_name', this.formData.patient_full_name, {
      required: true,
      minLength: 2,
      noErrorText: true
    });

    if (this.requestedPatientName && this.formData.patient_full_name) {
      const reqNorm = this.requestedPatientName.toLowerCase().replace(/\s+/g, ' ').trim();
      const formNorm = this.formData.patient_full_name.toLowerCase().replace(/\s+/g, ' ').trim();
      
      const namesMatch = reqNorm === formNorm || 
                        reqNorm.includes(formNorm) || 
                        formNorm.includes(reqNorm);
      
      this.recordCheck(section, namesMatch);
      this.addCheck({
        section,
        field: 'patient_full_name',
        passed: namesMatch,
        checkType: 'consistency',
        actualValue: this.formData.patient_full_name,
        expectedFormat: this.requestedPatientName,
        reasoning: namesMatch 
          ? `Patient name matches requested name (${this.requestedPatientName})` 
          : 'Patient name does not match requested patient, indicating wrong patient lookup or data corruption'
      });
      if (!namesMatch) {
        this.addIssue({
          section,
          field: 'patient_full_name',
          severity: 'critical',
          checkType: 'consistency',
          issue: 'Patient name does not match request',
          actualValue: this.formData.patient_full_name,
          expectedFormat: this.requestedPatientName,
          reasoning: 'The patient name extracted from portal does not match the requested patient, indicating wrong patient lookup or data corruption',
          suggestedFix: `Verify portal lookup for "${this.requestedPatientName}" and re-extract patient data`,
          autoFixable: false,
          affectedDownstream: ['all_sections', 'forms']
        });
      }
    }

    this.checkDateField(section, 'patient_dob', this.formData.patient_dob);
    this.checkField(section, 'subscriber_name', this.formData.subscriber_name, {
      required: true,
      minLength: 2
    });
    this.checkDateField(section, 'subscriber_dob', this.formData.subscriber_dob);
    
    if (this.formData.patient_dob && this.formData.subscriber_dob) {
      if (this.formData.patient_dob === this.formData.subscriber_dob && 
          this.formData.patient_full_name === this.formData.subscriber_name) {
        this.recordCheck(section, true);
        this.addCheck({
          section,
          field: 'subscriber_relationship',
          passed: true,
          checkType: 'logic',
          actualValue: { patient_dob: this.formData.patient_dob, subscriber_dob: this.formData.subscriber_dob },
          reasoning: 'Patient and subscriber have identical DOB and names, indicating patient is self-insured'
        });
        this.addIssue({
          section,
          field: 'subscriber_relationship',
          severity: 'info',
          checkType: 'logic',
          issue: 'Patient appears to be the subscriber',
          actualValue: { patient_dob: this.formData.patient_dob, subscriber_dob: this.formData.subscriber_dob },
          reasoning: 'Patient and subscriber have identical DOB and names, indicating patient is self-insured',
          suggestedFix: 'No action needed - verify this is correct relationship',
          autoFixable: false,
          affectedDownstream: []
        });
      }
    }
  }

  validateInsuranceInfo(): void {
    const section = 'Insurance Information';
    console.log(`[QA] Validating: ${section}`);

    this.checkField(section, 'subscriber_id', this.formData.subscriber_id, {
      required: true,
      minLength: 3,
      noErrorText: true
    });

    this.checkField(section, 'group_number', this.formData.group_number, {
      required: true,
      minLength: 1,
      noErrorText: true
    });

    this.checkField(section, 'insurance_company', this.formData.insurance_company, {
      required: true,
      minLength: 3,
      noErrorText: true
    });

    this.checkField(section, 'plan_name', this.formData.plan_name, {
      required: true,
      minLength: 3,
      noErrorText: true
    });

    this.checkDateField(section, 'effective_date', this.formData.effective_date);
    this.checkDateField(section, 'termination_date', this.formData.termination_date);

    if (this.formData.effective_date && this.formData.termination_date) {
      const effective = new Date(this.formData.effective_date);
      const termination = new Date(this.formData.termination_date);
      const isValid = termination >= effective || this.formData.termination_date === '9999-12-31';
      
      this.recordCheck(section, isValid);
      this.addCheck({
        section,
        field: 'effective_date',
        passed: isValid,
        checkType: 'logic',
        actualValue: { effective: this.formData.effective_date, termination: this.formData.termination_date },
        reasoning: isValid 
          ? `Insurance dates are valid: termination date (${this.formData.termination_date}) is on or after effective date (${this.formData.effective_date})` 
          : 'Insurance coverage cannot terminate before it begins'
      });
      if (!isValid) {
        this.addIssue({
          section,
          field: 'effective_date',
          severity: 'critical',
          checkType: 'logic',
          issue: 'Termination date is before effective date',
          actualValue: { effective: this.formData.effective_date, termination: this.formData.termination_date },
          reasoning: 'Insurance coverage cannot terminate before it begins',
          suggestedFix: 'Verify dates in portal - may indicate incorrect extraction or expired coverage',
          autoFixable: false,
          affectedDownstream: ['coverage_benefits']
        });
      }
    }
  }

  validateCoverageBenefits(): void {
    const section = 'Coverage & Benefits';
    console.log(`[QA] Validating: ${section}`);

    this.checkCoverageField(section, 'preventive_coverage', this.formData.preventive_coverage);
    this.checkCoverageField(section, 'basic_coverage', this.formData.basic_coverage);
    this.checkCoverageField(section, 'major_coverage', this.formData.major_coverage);

    this.checkCurrencyField(section, 'yearly_maximum', this.formData.yearly_maximum);
    this.checkCurrencyField(section, 'yearly_deductible', this.formData.yearly_deductible);

    if (this.formData.yearly_maximum_used) {
      this.checkCurrencyField(section, 'yearly_maximum_used', this.formData.yearly_maximum_used);
      
      if (this.formData.yearly_maximum && this.formData.yearly_maximum_used) {
        const max = this.parseCurrency(this.formData.yearly_maximum);
        const used = this.parseCurrency(this.formData.yearly_maximum_used);
        
        const isValid = used <= max;
        this.recordCheck(section, isValid);
        this.addCheck({
          section,
          field: 'yearly_maximum_used',
          passed: isValid,
          checkType: 'logic',
          actualValue: { maximum: this.formData.yearly_maximum, used: this.formData.yearly_maximum_used },
          reasoning: isValid 
            ? `Yearly maximum validation passed: used amount (${this.formData.yearly_maximum_used}) is within maximum (${this.formData.yearly_maximum})` 
            : 'Insurance used amount cannot exceed total maximum available'
        });
        
        if (!isValid) {
          this.addIssue({
            section,
            field: 'yearly_maximum_used',
            severity: 'critical',
            checkType: 'logic',
            issue: 'Amount used exceeds yearly maximum',
            actualValue: { maximum: this.formData.yearly_maximum, used: this.formData.yearly_maximum_used },
            reasoning: 'Insurance used amount cannot exceed total maximum available',
            suggestedFix: 'Re-check maximums/deductibles extraction from portal',
            autoFixable: false,
            affectedDownstream: []
          });
        }
      }
    }

    this.checkField(section, 'network_status', this.formData.network_status, {
      required: true,
      noErrorText: true,
      notUnknown: true
    });

    this.checkField(section, 'benefit_period', this.formData.benefit_period, {
      required: true
    });
  }

  validateOrthodonticBenefits(): void {
    const section = 'Orthodontic Benefits';
    console.log(`[QA] Validating: ${section}`);

    if (this.formData.orthodontic_coverage && this.formData.orthodontic_coverage !== 'N/A') {
      this.checkCoverageField(section, 'orthodontic_coverage', this.formData.orthodontic_coverage);
      
      if (this.formData.ortho_lifetime_maximum) {
        this.checkCurrencyField(section, 'ortho_lifetime_maximum', this.formData.ortho_lifetime_maximum);
      }

      if (this.formData.ortho_age_limit) {
        const ageLimit = this.formData.ortho_age_limit;
        const hasAge = /\d+/.test(ageLimit);
        const isValid = hasAge || ageLimit === 'N/A' || ageLimit.toLowerCase().includes('no limit');
        this.recordCheck(section, isValid);
        this.addCheck({
          section,
          field: 'ortho_age_limit',
          passed: isValid,
          checkType: 'format',
          actualValue: ageLimit,
          expectedFormat: 'Number (e.g., "19") or "N/A"',
          reasoning: isValid 
            ? `Orthodontic age limit format is valid: ${ageLimit}` 
            : 'Age limit should be numeric for clarity in eligibility checks'
        });
        
        if (!isValid) {
          this.addIssue({
            section,
            field: 'ortho_age_limit',
            severity: 'warning',
            checkType: 'format',
            issue: 'Orthodontic age limit format unclear',
            actualValue: ageLimit,
            expectedFormat: 'Number (e.g., "19") or "N/A"',
            reasoning: 'Age limit should be numeric for clarity in eligibility checks',
            suggestedFix: 'Extract numeric age from portal data',
            autoFixable: true,
            affectedDownstream: []
          });
        }
      }
    } else {
      this.recordCheck(section, true);
      this.addCheck({
        section,
        field: 'orthodontic_coverage',
        passed: true,
        checkType: 'presence',
        actualValue: this.formData.orthodontic_coverage,
        reasoning: 'Orthodontic coverage is N/A - no orthodontic benefits validation required'
      });
    }
  }

  validateWaitingPeriods(): void {
    const section = 'Waiting Periods';
    console.log(`[QA] Validating: ${section}`);

    if (this.formData.waiting_periods) {
      const { preventive, basic, major } = this.formData.waiting_periods;
      
      this.checkWaitingPeriodField(section, 'preventive', preventive);
      this.checkWaitingPeriodField(section, 'basic', basic);
      this.checkWaitingPeriodField(section, 'major', major);
    } else {
      this.recordCheck(section, false);
      this.addCheck({
        section,
        field: 'waiting_periods',
        passed: false,
        checkType: 'presence',
        actualValue: null,
        reasoning: 'Waiting periods object is missing but is critical for determining procedure eligibility'
      });
      this.addIssue({
        section,
        field: 'waiting_periods',
        severity: 'warning',
        checkType: 'presence',
        issue: 'Waiting periods object missing',
        actualValue: null,
        reasoning: 'Waiting periods are critical for determining procedure eligibility',
        suggestedFix: 'Verify waiting_periods_mapper extracted data correctly',
        autoFixable: false,
        affectedDownstream: []
      });
    }
  }

  validateProcedureDetails(): void {
    const section = 'Procedure Details';
    console.log(`[QA] Validating: ${section}`);

    if (this.formData.procedure_details && Array.isArray(this.formData.procedure_details)) {
      const procedures = this.formData.procedure_details;
      this.recordCheck(section, procedures.length > 0);
      this.addCheck({
        section,
        field: 'procedure_details',
        passed: procedures.length > 0,
        checkType: 'presence',
        actualValue: procedures.length,
        reasoning: procedures.length > 0 
          ? `Procedure details array contains ${procedures.length} procedures` 
          : 'Procedure details array is empty - may indicate extraction failure'
      });
      
      if (procedures.length === 0) {
        this.addIssue({
          section,
          field: 'procedure_details',
          severity: 'warning',
          checkType: 'presence',
          issue: 'No procedure details found',
          actualValue: [],
          reasoning: 'Procedure details array is empty - may indicate extraction failure or no procedures in benefits package',
          suggestedFix: 'Verify procedure_details_mapper found procedures in benefits_package or BCBS benefits data',
          autoFixable: false,
          affectedDownstream: []
        });
      } else {
        for (const proc of procedures.slice(0, 10)) {
          if (!proc.code || !proc.description) {
            this.recordCheck(section, false);
            this.addCheck({
              section,
              field: 'procedure_details',
              passed: false,
              checkType: 'format',
              actualValue: proc,
              expectedFormat: '{ code, description, coverage_percent, ... }',
              reasoning: 'Procedure missing required fields (code and/or description)'
            });
            this.addIssue({
              section,
              field: 'procedure_details',
              severity: 'critical',
              checkType: 'format',
              issue: 'Procedure missing required fields',
              actualValue: proc,
              expectedFormat: '{ code, description, coverage_percent, ... }',
              reasoning: 'Each procedure must have code and description for verification',
              suggestedFix: 'Check procedure_details_mapper extraction logic',
              autoFixable: false,
              affectedDownstream: []
            });
            break;
          }
        }
      }
    } else if (this.formData.benefits_package) {
      this.recordCheck(section, true);
      this.addCheck({
        section,
        field: 'benefits_package',
        passed: true,
        checkType: 'presence',
        actualValue: 'present',
        reasoning: 'Benefits package is available as alternative to procedure_details'
      });
    } else {
      this.recordCheck(section, false);
      this.addCheck({
        section,
        field: 'procedure_details',
        passed: false,
        checkType: 'presence',
        actualValue: null,
        reasoning: 'Neither procedure_details nor benefits_package found - at least one source required'
      });
      this.addIssue({
        section,
        field: 'procedure_details',
        severity: 'warning',
        checkType: 'presence',
        issue: 'Neither procedure_details nor benefits_package found',
        actualValue: null,
        reasoning: 'At least one source of procedure coverage information is required',
        suggestedFix: 'Verify BCBS or Delta Dental scraping completed successfully',
        autoFixable: false,
        affectedDownstream: []
      });
    }
  }

  validateTreatmentHistory(): void {
    const section = 'Treatment History';
    console.log(`[QA] Validating: ${section}`);

    if (this.formData.treatment_history_available === false) {
      this.recordCheck(section, true);
      this.addCheck({
        section,
        field: 'treatment_history_available',
        passed: true,
        checkType: 'presence',
        actualValue: false,
        reasoning: 'Treatment history is explicitly marked as unavailable - this is expected'
      });
      return;
    }

    if (this.formData.recent_procedures && Array.isArray(this.formData.recent_procedures)) {
      this.recordCheck(section, true);
      this.addCheck({
        section,
        field: 'recent_procedures',
        passed: true,
        checkType: 'presence',
        actualValue: this.formData.recent_procedures.length,
        reasoning: `Treatment history found with ${this.formData.recent_procedures.length} recent procedures`
      });
      
      for (const proc of this.formData.recent_procedures.slice(0, 5)) {
        if (!proc.code && !proc.description) {
          this.addIssue({
            section,
            field: 'recent_procedures',
            severity: 'warning',
            checkType: 'format',
            issue: 'Treatment history entry missing code and description',
            actualValue: proc,
            reasoning: 'Treatment history entries should have at minimum a code or description',
            suggestedFix: 'Verify treatment_history_mapper extraction',
            autoFixable: false,
            affectedDownstream: []
          });
          break;
        }
      }
    } else {
      this.recordCheck(section, false);
      this.addCheck({
        section,
        field: 'recent_procedures',
        passed: false,
        checkType: 'presence',
        actualValue: null,
        reasoning: 'Treatment history is not available - may not be in portal or extraction failed'
      });
      this.addIssue({
        section,
        field: 'recent_procedures',
        severity: 'info',
        checkType: 'presence',
        issue: 'Treatment history not found',
        actualValue: null,
        reasoning: 'Treatment history may not be available in portal or extraction failed',
        suggestedFix: 'Verify treatment_history_mapper ran and portal has history data',
        autoFixable: false,
        affectedDownstream: []
      });
    }
  }

  private checkField(
    section: string,
    field: string,
    value: any,
    options: {
      required?: boolean;
      minLength?: number;
      noErrorText?: boolean;
      notUnknown?: boolean;
    } = {}
  ): void {
    const { required = false, minLength = 0, noErrorText = false, notUnknown = false } = options;

    if (required && (!value || value === '')) {
      this.recordCheck(section, false);
      this.addCheck({
        section,
        field,
        passed: false,
        checkType: 'presence',
        actualValue: value,
        reasoning: `${field} is required for complete verification but is missing or empty`
      });
      this.addIssue({
        section,
        field,
        severity: 'critical',
        checkType: 'presence',
        issue: 'Required field is missing or empty',
        actualValue: value,
        reasoning: `${field} is required for complete verification`,
        suggestedFix: `Verify ${section.toLowerCase()} mapper extracted this field`,
        autoFixable: false,
        affectedDownstream: ['forms', 'human_review']
      });
      return;
    }

    if (value && typeof value === 'string') {
      if (minLength > 0 && value.length < minLength) {
        this.recordCheck(section, false);
        this.addCheck({
          section,
          field,
          passed: false,
          checkType: 'format',
          actualValue: value,
          reasoning: `Value appears incomplete or truncated (${value.length} characters, expected minimum ${minLength})`
        });
        this.addIssue({
          section,
          field,
          severity: 'warning',
          checkType: 'format',
          issue: `Value too short (minimum ${minLength} characters)`,
          actualValue: value,
          reasoning: 'Value appears incomplete or truncated',
          suggestedFix: 'Re-extract from portal data',
          autoFixable: false,
          affectedDownstream: []
        });
        return;
      }

      if (noErrorText) {
        const errorKeywords = ['not found', 'error', 'failed', 'n/a', 'unknown'];
        const hasError = errorKeywords.some(kw => value.toLowerCase().includes(kw));
        
        if (hasError && required) {
          this.recordCheck(section, false);
          this.addCheck({
            section,
            field,
            passed: false,
            checkType: 'format',
            actualValue: value,
            reasoning: 'Value indicates extraction or portal lookup failure (contains error keywords)'
          });
          this.addIssue({
            section,
            field,
            severity: 'critical',
            checkType: 'format',
            issue: 'Field contains error text',
            actualValue: value,
            reasoning: 'Value indicates extraction or portal lookup failure',
            suggestedFix: 'Re-scrape portal or verify patient exists in system',
            autoFixable: false,
            affectedDownstream: ['all_sections']
          });
          return;
        }
      }

      if (notUnknown && (value.toLowerCase() === 'unknown' || value === 'N/A')) {
        this.recordCheck(section, false);
        this.addCheck({
          section,
          field,
          passed: false,
          checkType: 'presence',
          actualValue: value,
          reasoning: 'Field value is Unknown or N/A, but a specific value is required for complete verification'
        });
        this.addIssue({
          section,
          field,
          severity: 'warning',
          checkType: 'presence',
          issue: 'Field value is Unknown or N/A',
          actualValue: value,
          reasoning: 'This field should have a specific value for complete verification',
          suggestedFix: 'Verify mapper can find this value in portal data',
          autoFixable: false,
          affectedDownstream: []
        });
        return;
      }
    }

    this.recordCheck(section, true);
    this.addCheck({
      section,
      field,
      passed: true,
      checkType: 'presence',
      actualValue: value,
      reasoning: `Field validation passed: ${field} contains valid data${minLength > 0 && typeof value === 'string' ? ` (length: ${value.length} characters)` : ''}`
    });
  }

  private checkDateField(section: string, field: string, value: any): void {
    if (!value) {
      this.recordCheck(section, false);
      this.addCheck({
        section,
        field,
        passed: false,
        checkType: 'presence',
        actualValue: value,
        expectedFormat: 'YYYY-MM-DD',
        reasoning: 'Date fields are required for insurance verification but value is missing'
      });
      this.addIssue({
        section,
        field,
        severity: 'critical',
        checkType: 'presence',
        issue: 'Required date field is missing',
        actualValue: value,
        expectedFormat: 'YYYY-MM-DD',
        reasoning: 'Date fields are required for insurance verification',
        suggestedFix: 'Verify mapper extracted date from portal',
        autoFixable: false,
        affectedDownstream: ['forms']
      });
      return;
    }

    const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!isoDatePattern.test(value) && value !== '9999-12-31') {
      this.recordCheck(section, false);
      this.addCheck({
        section,
        field,
        passed: false,
        checkType: 'format',
        actualValue: value,
        expectedFormat: 'YYYY-MM-DD',
        reasoning: `Date is not in ISO-8601 format (received: ${value})`
      });
      this.addIssue({
        section,
        field,
        severity: 'critical',
        checkType: 'format',
        issue: 'Date is not in ISO-8601 format',
        actualValue: value,
        expectedFormat: 'YYYY-MM-DD',
        reasoning: 'All dates must be in ISO-8601 format for database compatibility and date calculations',
        suggestedFix: `Convert "${value}" to YYYY-MM-DD format`,
        autoFixable: true,
        affectedDownstream: ['forms']
      });
      return;
    }

    const invalidDates = ['1900-01-01', '0000-00-00', '1970-01-01'];
    if (invalidDates.includes(value)) {
      this.recordCheck(section, false);
      this.addCheck({
        section,
        field,
        passed: false,
        checkType: 'logic',
        actualValue: value,
        reasoning: 'Date is a default/placeholder value indicating missing data'
      });
      this.addIssue({
        section,
        field,
        severity: 'critical',
        checkType: 'logic',
        issue: 'Date is a default/placeholder value',
        actualValue: value,
        reasoning: 'This date appears to be a default value indicating missing data',
        suggestedFix: 'Extract actual date from portal',
        autoFixable: false,
        affectedDownstream: []
      });
      return;
    }

    this.recordCheck(section, true);
    this.addCheck({
      section,
      field,
      passed: true,
      checkType: 'format',
      actualValue: value,
      expectedFormat: 'YYYY-MM-DD',
      reasoning: `Date validation passed: ${field} is in correct ISO-8601 format (${value})`
    });
  }

  private checkCoverageField(section: string, field: string, value: any): void {
    if (!value || value === '') {
      this.recordCheck(section, false);
      this.addCheck({
        section,
        field,
        passed: false,
        checkType: 'presence',
        actualValue: value,
        expectedFormat: 'NN% (e.g., "100%", "80%")',
        reasoning: 'Coverage percentage is missing but is essential for cost calculations'
      });
      this.addIssue({
        section,
        field,
        severity: 'critical',
        checkType: 'presence',
        issue: 'Coverage percentage is missing',
        actualValue: value,
        expectedFormat: 'NN% (e.g., "100%", "80%")',
        reasoning: 'Coverage percentages are essential for cost calculations',
        suggestedFix: 'Verify coverage_and_benefits_mapper extracted this value',
        autoFixable: false,
        affectedDownstream: []
      });
      return;
    }

    if (value !== 'N/A' && !value.toString().match(/^\d+%$/)) {
      this.recordCheck(section, false);
      this.addCheck({
        section,
        field,
        passed: false,
        checkType: 'format',
        actualValue: value,
        expectedFormat: 'NN% (e.g., "100%", "80%")',
        reasoning: `Coverage percentage is not in correct format (received: ${value})`
      });
      this.addIssue({
        section,
        field,
        severity: 'critical',
        checkType: 'format',
        issue: 'Coverage percentage is not in correct format',
        actualValue: value,
        expectedFormat: 'NN% (e.g., "100%", "80%")',
        reasoning: 'Coverage must be percentage format for cost calculations',
        suggestedFix: `Convert "${value}" to percentage format (e.g., "80%")`,
        autoFixable: true,
        affectedDownstream: []
      });
      return;
    }

    this.recordCheck(section, true);
    this.addCheck({
      section,
      field,
      passed: true,
      checkType: 'format',
      actualValue: value,
      expectedFormat: 'NN% (e.g., "100%", "80%")',
      reasoning: `Coverage percentage validation passed: ${field} is in correct format (${value})`
    });
  }

  private checkCurrencyField(section: string, field: string, value: any): void {
    if (!value || value === '') {
      this.recordCheck(section, false);
      this.addCheck({
        section,
        field,
        passed: false,
        checkType: 'presence',
        actualValue: value,
        expectedFormat: '$NNNN (e.g., "$1500", "$0")',
        reasoning: 'Currency value is missing but is important for cost analysis'
      });
      this.addIssue({
        section,
        field,
        severity: 'warning',
        checkType: 'presence',
        issue: 'Currency value is missing',
        actualValue: value,
        expectedFormat: '$NNNN (e.g., "$1500", "$0")',
        reasoning: 'Financial values are important for cost analysis',
        suggestedFix: 'Verify mapper extracted this value',
        autoFixable: false,
        affectedDownstream: []
      });
      return;
    }

    if (!value.toString().match(/^\$\d+/) && value !== '$0') {
      this.recordCheck(section, false);
      this.addCheck({
        section,
        field,
        passed: false,
        checkType: 'format',
        actualValue: value,
        expectedFormat: '$NNNN (e.g., "$1500", "$0")',
        reasoning: `Currency value is not in correct format (received: ${value})`
      });
      this.addIssue({
        section,
        field,
        severity: 'warning',
        checkType: 'format',
        issue: 'Currency value is not in correct format',
        actualValue: value,
        expectedFormat: '$NNNN (e.g., "$1500", "$0")',
        reasoning: 'Currency values must start with $ for parsing',
        suggestedFix: `Convert "${value}" to currency format (e.g., "$1500")`,
        autoFixable: true,
        affectedDownstream: []
      });
      return;
    }

    this.recordCheck(section, true);
    this.addCheck({
      section,
      field,
      passed: true,
      checkType: 'format',
      actualValue: value,
      expectedFormat: '$NNNN (e.g., "$1500", "$0")',
      reasoning: `Currency value validation passed: ${field} is in correct format (${value})`
    });
  }

  private checkWaitingPeriodField(section: string, category: string, value: any): void {
    if (!value) {
      this.recordCheck(section, false);
      this.addCheck({
        section,
        field: `waiting_periods.${category}`,
        passed: false,
        checkType: 'presence',
        actualValue: value,
        reasoning: `Waiting period for ${category} is missing but affects procedure eligibility`
      });
      this.addIssue({
        section,
        field: `waiting_periods.${category}`,
        severity: 'warning',
        checkType: 'presence',
        issue: `Waiting period for ${category} is missing`,
        actualValue: value,
        reasoning: 'Waiting periods affect procedure eligibility',
        suggestedFix: 'Verify waiting_periods_mapper extracted this value',
        autoFixable: false,
        affectedDownstream: []
      });
      return;
    }

    this.recordCheck(section, true);
    this.addCheck({
      section,
      field: `waiting_periods.${category}`,
      passed: true,
      checkType: 'presence',
      actualValue: value,
      reasoning: `Waiting period validation passed: ${category} has value (${value})`
    });
  }

  private parseCurrency(value: string): number {
    return parseFloat(value.replace(/[$,]/g, '')) || 0;
  }

  generateReport(): ValidationReport {
    const sectionScores: { [section: string]: SectionScore } = {};
    
    for (const [section, stats] of this.sectionChecks.entries()) {
      const sectionIssues = this.issues.filter(i => i.section === section);
      sectionScores[section] = {
        score: stats.total > 0 ? Math.round((stats.passed / stats.total) * 100) : 0,
        checksRun: stats.total,
        issues: sectionIssues.filter(i => i.severity === 'critical').length,
        warnings: sectionIssues.filter(i => i.severity === 'warning').length
      };
    }

    const criticalIssues = this.issues.filter(i => i.severity === 'critical').length;
    const warnings = this.issues.filter(i => i.severity === 'warning').length;
    const infoMessages = this.issues.filter(i => i.severity === 'info').length;

    const overallScore = this.checksRun > 0 
      ? Math.round((1 - (criticalIssues * 0.1 + warnings * 0.03)) * 100)
      : 0;

    const passed = criticalIssues === 0 && overallScore >= 70;

    const requiredFields = [
      'patient_full_name', 'patient_dob', 'subscriber_id', 'group_number',
      'insurance_company', 'plan_name', 'network_status', 'preventive_coverage',
      'basic_coverage', 'major_coverage', 'yearly_maximum', 'yearly_deductible'
    ];
    
    const presentFields = requiredFields.filter(f => 
      this.formData[f as keyof StandardVerificationData] && 
      this.formData[f as keyof StandardVerificationData] !== ''
    ).length;
    
    const completeness = Math.round((presentFields / requiredFields.length) * 100);
    
    const formatIssues = this.issues.filter(i => i.checkType === 'format').length;
    const totalFormatChecks = this.checksRun * 0.3;
    const accuracy = Math.round((1 - (formatIssues / totalFormatChecks)) * 100);
    
    const consistencyIssues = this.issues.filter(i => i.checkType === 'consistency' || i.checkType === 'logic').length;
    const totalConsistencyChecks = this.checksRun * 0.2;
    const consistency = Math.round((1 - (consistencyIssues / Math.max(totalConsistencyChecks, 1))) * 100);

    return {
      timestamp: new Date().toISOString(),
      verificationId: this.formData.reference_number || 'unknown',
      patientName: this.formData.patient_full_name || 'Unknown',
      insuranceProvider: this.formData.insurance_company || 'Unknown',
      officeKey: 'unknown',
      overallScore: Math.max(0, Math.min(100, overallScore)),
      passed,
      summary: {
        totalChecks: this.checksRun,
        criticalIssues,
        warnings,
        infoMessages
      },
      sectionScores,
      issues: this.issues,
      checks: this.checks,
      dataQualityMetrics: {
        completeness: Math.max(0, Math.min(100, completeness)),
        accuracy: Math.max(0, Math.min(100, accuracy)),
        consistency: Math.max(0, Math.min(100, consistency))
      }
    };
  }

  async validate(): Promise<ValidationReport> {
    console.log('[QA_VALIDATION] ═══════════════════════════════════════════');
    console.log('[QA_VALIDATION] Starting Quality Assurance Validation');
    console.log('[QA_VALIDATION] ═══════════════════════════════════════════\n');

    this.validatePatientSubscriberInfo();
    this.validateInsuranceInfo();
    this.validateCoverageBenefits();
    this.validateOrthodonticBenefits();
    this.validateWaitingPeriods();
    this.validateProcedureDetails();
    this.validateTreatmentHistory();

    const report = this.generateReport();

    console.log('\n[QA_VALIDATION] ═══════════════════════════════════════════');
    console.log('[QA_VALIDATION] Quality Assurance Results');
    console.log('[QA_VALIDATION] ═══════════════════════════════════════════');
    console.log(`[QA_VALIDATION] Overall Score: ${report.overallScore}%`);
    console.log(`[QA_VALIDATION] Status: ${report.passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`[QA_VALIDATION] Total Checks: ${report.summary.totalChecks}`);
    console.log(`[QA_VALIDATION] Critical Issues: ${report.summary.criticalIssues}`);
    console.log(`[QA_VALIDATION] Warnings: ${report.summary.warnings}`);
    console.log(`[QA_VALIDATION] Info Messages: ${report.summary.infoMessages}`);
    
    console.log('\n[QA_VALIDATION] Data Quality Metrics:');
    console.log(`[QA_VALIDATION]   Completeness: ${report.dataQualityMetrics.completeness}%`);
    console.log(`[QA_VALIDATION]   Accuracy: ${report.dataQualityMetrics.accuracy}%`);
    console.log(`[QA_VALIDATION]   Consistency: ${report.dataQualityMetrics.consistency}%`);

    console.log('\n[QA_VALIDATION] Section Scores:');
    for (const [section, score] of Object.entries(report.sectionScores)) {
      const icon = score.score >= 90 ? '✅' : score.score >= 70 ? '⚠️' : '❌';
      console.log(`[QA_VALIDATION]   ${icon} ${section}: ${score.score}% (${score.checksRun} checks, ${score.issues} issues, ${score.warnings} warnings)`);
    }

    if (report.issues.length > 0) {
      console.log('\n[QA_VALIDATION] Issues Found:');
      for (const issue of report.issues) {
        const icon = issue.severity === 'critical' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
        console.log(`[QA_VALIDATION]   ${icon} [${issue.section}] ${issue.field}: ${issue.issue}`);
        console.log(`[QA_VALIDATION]      Value: ${JSON.stringify(issue.actualValue)}`);
        console.log(`[QA_VALIDATION]      Fix: ${issue.suggestedFix}`);
      }
    }

    console.log('[QA_VALIDATION] ═══════════════════════════════════════════\n');

    return report;
  }
}

export async function runQAValidation(
  formPath: string,
  requestedPatientName?: string
): Promise<ValidationReport> {
  const formContent = await fs.readFile(formPath, 'utf-8');
  const formData: StandardVerificationData = JSON.parse(formContent);

  const validator = new QAValidator(formData, requestedPatientName);
  const report = await validator.validate();

  const reportPath = formPath.replace('.json', '_qa_report.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`[QA_VALIDATION] Report saved to: ${reportPath}`);

  return report;
}
