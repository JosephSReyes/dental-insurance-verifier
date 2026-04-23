export interface FieldExtractionMetadata {
  fieldName: string;
  extractedValue: any;
  confidence: number;
  sourcePath: string;
  reasoning: string;
  alternativeCandidates?: Array<{
    value: any;
    path: string;
    score: number;
    reason: string;
  }>;
  extractionMethod: 'deterministic' | 'llm_based' | 'hybrid';
  timestamp: string;
}

export interface MapperExtractionResult {
  fields: Record<string, FieldExtractionMetadata>;
  overallConfidence: number;
  mapperName: string;
  processingTimeMs: number;
}

export interface VerificationMetadata {
  verificationId: string;
  timestamp: string;
  
  requestContext: {
    patientName: string;
    patientDob: string;
    insuranceProvider: string;
    dentalCodes?: string[];
    appointmentDate?: string;
  };
  
  officeContext: {
    officeKey: string;
    officeName: string;
    contractedPlans?: string;
  };
  
  portalContext: {
    portalType: 'bcbs' | 'unknown';
    portalVersion?: string;  // Regional/variant identifier (e.g., 'bcbs_ca')
    sessionReused: boolean;
  };
  
  processingMetrics: {
    durationMs: {
      scraping?: number;
      aggregation?: number;
      mapping: number;
      validation?: number;
      totalProcessing: number;
    };
  };
  
  mapperResults: {
    patientInfo?: MapperExtractionResult;
    insuranceInfo?: MapperExtractionResult;
    coverageBenefits?: MapperExtractionResult;
    orthodonticBenefits?: MapperExtractionResult;
    waitingPeriods?: MapperExtractionResult;
    procedureDetails?: MapperExtractionResult;
    treatmentHistory?: MapperExtractionResult;
  };
  
  confidenceScores: {
    overall: number;
    bySection: Record<string, number>;
  };
  
  qaResults?: {
    score: number;
    passed: boolean;
    criticalIssues: number;
    warnings: number;
    checksRun: number;
  };
}
