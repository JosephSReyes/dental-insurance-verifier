export interface NetworkCoverageDetail {
  // Note: benefitCoverageLevel comes from APIs as string (e.g. "100.00") or number
  // Always format using formatCoveragePercent() to ensure integer display (e.g. "100%")
  benefitCoverageLevel: number | string;
  deductibleWaived: boolean;
  maximumApplies: boolean;
  amountType?: string;
  copay?: string;
  minAge?: number;
  maxAge?: number;
  adult?: boolean;
}

export interface NetworkInfo {
  code: string;
  networkDescription: string;
  coverageDetail: NetworkCoverageDetail[];
}

export interface ProcedureInfo {
  code: string;
  description: string;
  network: NetworkInfo[];
  frequencyLimitation: string | null;
  ageLimitation: string | null;
  preAuthorizationRequired: boolean;
  benefitCategory: string;
  waitingPeriod?: string | null;
  notes?: string[];
  limitedToTeeth?: any[];
  crossCheckProcedureCodes?: string;
}

export interface TreatmentCategory {
  treatmentDescription: string;
  treatmentCode: string;
  procedureClass: Array<{
    procedure: ProcedureInfo[];
  }>;
}

export interface BenefitsPackage {
  treatment: TreatmentCategory[];
}

export interface FieldMetadata {
  value: any;
  sourcePath: string;
  reasoning: string;
  confidence?: number;
  mapperName?: string;
}

export interface WaitingPeriods {
  preventive: string;
  basic: string;
  major: string;
}

export interface StandardVerificationData {
  verification_date: string;
  data_source: string;
  verified_by: string;
  representative: string;
  reference_number: string;
  
  _metadata?: Record<string, FieldMetadata>;
  
  patient_first_name?: string;
  patient_last_name?: string;
  patient_full_name: string;
  patient_name?: string;
  patient_dob: string;
  person_id?: string;
  
  subscriber_name: string;
  subscriber_dob: string;
  subscriber_id: string;
  member_code?: string;
  group_number: string;
  contract_id?: string;
  division_number?: string;
  member_type?: string;
  
  insurance_provider?: string;
  insurance_company: string;
  plan_name: string;
  group_name?: string;
  division_name?: string;
  insurance_phone?: string;
  
  claims_address?: string;
  claims_city?: string;
  claims_state?: string;
  claims_zip?: string;
  payor_id?: string;
  group_type_id?: string;
  contract_holder_id?: string;
  
  network_status: string;
  default_network?: string;
  fee_schedule?: string;
  networks_allowed?: Array<{ code: string; description: string }>;
  
  // Coverage percentages must be formatted as integers (e.g. "100%", not "100.00%")
  preventive_coverage: string;
  basic_coverage: string;
  major_coverage: string;
  orthodontic_coverage?: string;
  
  yearly_maximum: string;
  yearly_maximum_used?: string;
  yearly_deductible: string;
  yearly_deductible_used?: string;
  
  ortho_lifetime_maximum?: string;
  ortho_coverage_percentage?: string;
  ortho_age_limit?: string;
  ortho_deductible?: string;
  ortho_payment_schedule?: string;
  
  benefit_period: string;
  effective_date: string;
  termination_date: string;
  original_effective_date?: string;
  
  dependent_coverage_age?: string;
  missing_tooth_clause?: boolean;
  
  waiting_periods?: WaitingPeriods;
  
  benefits_package?: BenefitsPackage;
  benefits_package_available?: boolean;
  
  treatment_history_available?: boolean;
  recent_procedures?: any[];
  
  procedure_details?: any[];
  
  additional_benefits?: any;
  
  contract_type?: string;
  member_status?: string;
  
  maximums_deductibles_available?: boolean;
  
  dental_codes?: string[];
}

export function formatDateToISO(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  
  if (dateStr === '12/31/9999' || dateStr === '9999-12-31') {
    return '9999-12-31';
  }
  
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return dateStr;
  }
  
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const [month, day, year] = parts;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  return dateStr;
}

export function validateVerificationData(data: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  const requiredFields: (keyof StandardVerificationData)[] = [
    'patient_full_name',
    'patient_dob',
    'subscriber_name',
    'subscriber_dob',
    'subscriber_id',
    'group_number',
    'insurance_company',
    'plan_name',
    'network_status',
    'preventive_coverage',
    'basic_coverage',
    'major_coverage',
    'yearly_maximum',
    'yearly_deductible',
    'benefit_period',
    'effective_date',
    'termination_date'
  ];
  
  for (const field of requiredFields) {
    if (!data[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }
  
  if (data.patient_dob && !data.patient_dob.match(/^\d{4}-\d{2}-\d{2}$/)) {
    errors.push(`patient_dob must be in ISO-8601 format (YYYY-MM-DD), got: ${data.patient_dob}`);
  }
  
  if (data.subscriber_dob && !data.subscriber_dob.match(/^\d{4}-\d{2}-\d{2}$/) && data.subscriber_dob !== 'Unknown') {
    errors.push(`subscriber_dob must be in ISO-8601 format (YYYY-MM-DD), got: ${data.subscriber_dob}`);
  }
  
  if (data.effective_date && !data.effective_date.match(/^\d{4}-\d{2}-\d{2}$/)) {
    errors.push(`effective_date must be in ISO-8601 format (YYYY-MM-DD), got: ${data.effective_date}`);
  }
  
  if (data.termination_date && !data.termination_date.match(/^\d{4}-\d{2}-\d{2}$/)) {
    errors.push(`termination_date must be in ISO-8601 format (YYYY-MM-DD), got: ${data.termination_date}`);
  }
  
  if (data.benefits_package && !data.benefits_package.treatment) {
    errors.push('benefits_package must contain treatment array');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}
