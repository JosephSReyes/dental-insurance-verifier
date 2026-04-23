import * as fs from 'fs/promises';
import * as path from 'path';
import { ValidationReport } from './qa-validation.js';

export type ErrorType = 'mapping_error' | 'portal_data_error' | 'logic_error' | 'formatting_error' | 'scraping_error';
export type ErrorSource = 'scraper' | 'aggregator' | 'patient_info_mapper' | 'insurance_info_mapper' | 
                          'coverage_benefits_mapper' | 'orthodontic_benefits_mapper' | 'waiting_periods_mapper' |
                          'procedure_details_mapper' | 'treatment_history_mapper';

export interface FieldCorrection {
  field: string;
  section: string;
  aiExtractedValue: any;
  correctedValue: any;
  errorType: ErrorType;
  errorSource: ErrorSource;
  notes: string;
  confidence: 1 | 2 | 3 | 4 | 5;
}

export interface QACheckOverride {
  checkId: string;
  agreedWithCheck: boolean;
  reasoning: string;
}

export interface VerificationMetadata {
  verificationId: string;
  timestamp: string;
  
  requestContext: {
    patientName: string;
    patientDob?: string;
    insuranceProvider: string;
    dentalCodes: string[];
    appointmentDate?: string;
  };
  
  officeContext: {
    officeKey: string;
    officeName: string;
    contractedPlans: string;
  };
  
  portalContext: {
    portalType: 'bcbs' | 'other';
    portalVersion?: string;  // Regional/variant identifier (e.g., 'bcbs_ca')
    portalUrl?: string;
    sessionReused: boolean;
  };
  
  dataSourcePaths: {
    patientApiDataFolder: string;
    formPath: string;
    qaReportPath?: string;
  };
  
  processingMetrics: {
    durationMs: {
      scraping?: number;
      aggregation?: number;
      mapping?: number;
      validation?: number;
      totalProcessing: number;
    };
  };
  
  mapperConfidenceScores?: {
    patientInfo?: number;
    insuranceInfo?: number;
    coverageBenefits?: number;
    orthodonticBenefits?: number;
    waitingPeriods?: number;
    procedureDetails?: number;
    treatmentHistory?: number;
    overall?: number;
  };
  
  qaResults?: {
    score: number;
    passed: boolean;
    criticalIssues: number;
    warnings: number;
    checksRun: number;
    sectionScores: { [section: string]: number };
  };
  
  environment: {
    nodeVersion: string;
    modelUsed: string;
    totalTokensUsed?: number;
  };
}

export interface HumanFeedback {
  verificationId: string;
  metadata: VerificationMetadata;
  
  reviewerInfo: {
    reviewerId: string;
    reviewerEmail?: string;
    reviewedAt: string;
    timeSpentSeconds: number;
  };
  
  fieldCorrections: FieldCorrection[];
  
  qaCheckOverrides: QACheckOverride[];
  
  overallApproval: 'approved' | 'approved_with_corrections' | 'rejected';
  
  difficultyRating: 1 | 2 | 3 | 4 | 5;
  
  portalIssues: string[];
  
  additionalNotes: string;
}

export interface FeedbackSummary {
  totalVerifications: number;
  totalCorrections: number;
  correctionRate: number;
  
  errorsByType: {
    [errorType in ErrorType]: number;
  };
  
  errorsBySource: {
    [source in ErrorSource]: number;
  };
  
  errorsByField: {
    [field: string]: number;
  };
  
  errorsByOffice: {
    [officeKey: string]: number;
  };
  
  errorsByPortal: {
    [portal: string]: number;
  };
  
  avgDifficultyRating: number;
  avgQAScore: number;
  avgReviewTimeSeconds: number;
  
  approvalBreakdown: {
    approved: number;
    approvedWithCorrections: number;
    rejected: number;
  };
}

export class FeedbackManager {
  private feedbackDir: string;

  constructor(baseDir: string = 'feedback') {
    this.feedbackDir = path.resolve(process.cwd(), baseDir);
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.feedbackDir, { recursive: true });
    console.log(`[FEEDBACK] Initialized feedback directory: ${this.feedbackDir}`);
  }

  async saveFeedback(feedback: HumanFeedback): Promise<string> {
    await this.initialize();
    
    const timestamp = feedback.reviewerInfo.reviewedAt.replace(/[:.]/g, '-');
    const filename = `feedback_${feedback.metadata.requestContext.patientName.replace(/\s+/g, '_')}_${timestamp}.json`;
    const filepath = path.join(this.feedbackDir, filename);
    
    await fs.writeFile(filepath, JSON.stringify(feedback, null, 2), 'utf-8');
    
    console.log('[FEEDBACK] ═══════════════════════════════════════════');
    console.log('[FEEDBACK] Feedback Saved');
    console.log('[FEEDBACK] ═══════════════════════════════════════════');
    console.log(`[FEEDBACK] File: ${filename}`);
    console.log(`[FEEDBACK] Approval: ${feedback.overallApproval}`);
    console.log(`[FEEDBACK] Corrections: ${feedback.fieldCorrections.length}`);
    console.log(`[FEEDBACK] Difficulty: ${feedback.difficultyRating}/5`);
    console.log(`[FEEDBACK] Review Time: ${feedback.reviewerInfo.timeSpentSeconds}s`);
    console.log('[FEEDBACK] ═══════════════════════════════════════════\n');
    
    return filepath;
  }

  async loadAllFeedback(): Promise<HumanFeedback[]> {
    try {
      const files = await fs.readdir(this.feedbackDir);
      const feedbackFiles = files.filter(f => f.startsWith('feedback_') && f.endsWith('.json'));
      
      const feedbacks: HumanFeedback[] = [];
      for (const file of feedbackFiles) {
        const content = await fs.readFile(path.join(this.feedbackDir, file), 'utf-8');
        feedbacks.push(JSON.parse(content));
      }
      
      return feedbacks;
    } catch (error) {
      return [];
    }
  }

  async generateSummary(): Promise<FeedbackSummary> {
    const feedbacks = await this.loadAllFeedback();
    
    if (feedbacks.length === 0) {
      return {
        totalVerifications: 0,
        totalCorrections: 0,
        correctionRate: 0,
        errorsByType: {} as any,
        errorsBySource: {} as any,
        errorsByField: {},
        errorsByOffice: {},
        errorsByPortal: {},
        avgDifficultyRating: 0,
        avgQAScore: 0,
        avgReviewTimeSeconds: 0,
        approvalBreakdown: { approved: 0, approvedWithCorrections: 0, rejected: 0 }
      };
    }

    const totalCorrections = feedbacks.reduce((sum, f) => sum + f.fieldCorrections.length, 0);
    const correctionRate = totalCorrections / feedbacks.length;

    const errorsByType: any = {};
    const errorsBySource: any = {};
    const errorsByField: any = {};
    const errorsByOffice: any = {};
    const errorsByPortal: any = {};

    for (const feedback of feedbacks) {
      for (const correction of feedback.fieldCorrections) {
        errorsByType[correction.errorType] = (errorsByType[correction.errorType] || 0) + 1;
        errorsBySource[correction.errorSource] = (errorsBySource[correction.errorSource] || 0) + 1;
        errorsByField[correction.field] = (errorsByField[correction.field] || 0) + 1;
      }
      
      errorsByOffice[feedback.metadata.officeContext.officeKey] = 
        (errorsByOffice[feedback.metadata.officeContext.officeKey] || 0) + 1;
      
      errorsByPortal[feedback.metadata.portalContext.portalType] = 
        (errorsByPortal[feedback.metadata.portalContext.portalType] || 0) + 1;
    }

    const avgDifficultyRating = feedbacks.reduce((sum, f) => sum + f.difficultyRating, 0) / feedbacks.length;
    const avgQAScore = feedbacks.reduce((sum, f) => sum + (f.metadata.qaResults?.score || 0), 0) / feedbacks.length;
    const avgReviewTimeSeconds = feedbacks.reduce((sum, f) => sum + f.reviewerInfo.timeSpentSeconds, 0) / feedbacks.length;

    const approvalBreakdown = {
      approved: feedbacks.filter(f => f.overallApproval === 'approved').length,
      approvedWithCorrections: feedbacks.filter(f => f.overallApproval === 'approved_with_corrections').length,
      rejected: feedbacks.filter(f => f.overallApproval === 'rejected').length
    };

    return {
      totalVerifications: feedbacks.length,
      totalCorrections,
      correctionRate,
      errorsByType,
      errorsBySource,
      errorsByField,
      errorsByOffice,
      errorsByPortal,
      avgDifficultyRating,
      avgQAScore,
      avgReviewTimeSeconds,
      approvalBreakdown
    };
  }

  async getFeedbackForMapper(mapperName: ErrorSource): Promise<FieldCorrection[]> {
    const feedbacks = await this.loadAllFeedback();
    const corrections: FieldCorrection[] = [];
    
    for (const feedback of feedbacks) {
      for (const correction of feedback.fieldCorrections) {
        if (correction.errorSource === mapperName) {
          corrections.push(correction);
        }
      }
    }
    
    return corrections;
  }

  async getFeedbackForOffice(officeKey: string): Promise<HumanFeedback[]> {
    const feedbacks = await this.loadAllFeedback();
    return feedbacks.filter(f => f.metadata.officeContext.officeKey === officeKey);
  }

  async getFeedbackForPortal(portalType: 'bcbs' | 'other'): Promise<HumanFeedback[]> {
    const feedbacks = await this.loadAllFeedback();
    return feedbacks.filter(f => f.metadata.portalContext.portalType === portalType);
  }

  async printSummaryReport(): Promise<void> {
    const summary = await this.generateSummary();
    
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('          FEEDBACK SUMMARY REPORT');
    console.log('═══════════════════════════════════════════════════════\n');
    
    console.log(`Total Verifications: ${summary.totalVerifications}`);
    console.log(`Total Corrections: ${summary.totalCorrections}`);
    console.log(`Correction Rate: ${summary.correctionRate.toFixed(2)} per verification`);
    console.log(`Average QA Score: ${summary.avgQAScore.toFixed(1)}%`);
    console.log(`Average Difficulty: ${summary.avgDifficultyRating.toFixed(1)}/5`);
    console.log(`Average Review Time: ${Math.round(summary.avgReviewTimeSeconds)}s`);
    
    console.log('\n--- Approval Breakdown ---');
    console.log(`  Approved: ${summary.approvalBreakdown.approved} (${((summary.approvalBreakdown.approved/summary.totalVerifications)*100).toFixed(1)}%)`);
    console.log(`  Approved with Corrections: ${summary.approvalBreakdown.approvedWithCorrections} (${((summary.approvalBreakdown.approvedWithCorrections/summary.totalVerifications)*100).toFixed(1)}%)`);
    console.log(`  Rejected: ${summary.approvalBreakdown.rejected} (${((summary.approvalBreakdown.rejected/summary.totalVerifications)*100).toFixed(1)}%)`);
    
    console.log('\n--- Errors by Type ---');
    const sortedByType = Object.entries(summary.errorsByType).sort((a, b) => b[1] - a[1]);
    for (const [type, count] of sortedByType) {
      console.log(`  ${type}: ${count}`);
    }
    
    console.log('\n--- Errors by Source (Mapper) ---');
    const sortedBySource = Object.entries(summary.errorsBySource).sort((a, b) => b[1] - a[1]);
    for (const [source, count] of sortedBySource) {
      console.log(`  ${source}: ${count}`);
    }
    
    console.log('\n--- Most Problematic Fields ---');
    const sortedByField = Object.entries(summary.errorsByField).sort((a, b) => b[1] - a[1]).slice(0, 10);
    for (const [field, count] of sortedByField) {
      console.log(`  ${field}: ${count} corrections`);
    }
    
    console.log('\n--- Errors by Office ---');
    for (const [office, count] of Object.entries(summary.errorsByOffice)) {
      console.log(`  ${office}: ${count} verifications`);
    }
    
    console.log('\n--- Errors by Portal ---');
    for (const [portal, count] of Object.entries(summary.errorsByPortal)) {
      console.log(`  ${portal}: ${count} verifications`);
    }
    
    console.log('\n═══════════════════════════════════════════════════════\n');
  }
}

export function createEmptyFeedback(metadata: VerificationMetadata, reviewerId: string): HumanFeedback {
  return {
    verificationId: metadata.verificationId,
    metadata,
    reviewerInfo: {
      reviewerId,
      reviewedAt: new Date().toISOString(),
      timeSpentSeconds: 0
    },
    fieldCorrections: [],
    qaCheckOverrides: [],
    overallApproval: 'approved',
    difficultyRating: 3,
    portalIssues: [],
    additionalNotes: ''
  };
}

export async function exportFeedbackToCSV(outputPath: string): Promise<void> {
  const manager = new FeedbackManager();
  const feedbacks = await manager.loadAllFeedback();
  
  const rows: string[] = [
    'Verification ID,Patient,Office,Portal,Approval,Corrections Count,Difficulty,QA Score,Review Time (s),Reviewer,Reviewed At'
  ];
  
  for (const feedback of feedbacks) {
    rows.push([
      feedback.verificationId,
      feedback.metadata.requestContext.patientName,
      feedback.metadata.officeContext.officeKey,
      feedback.metadata.portalContext.portalType,
      feedback.overallApproval,
      feedback.fieldCorrections.length,
      feedback.difficultyRating,
      feedback.metadata.qaResults?.score || 0,
      feedback.reviewerInfo.timeSpentSeconds,
      feedback.reviewerInfo.reviewerId,
      feedback.reviewerInfo.reviewedAt
    ].join(','));
  }
  
  await fs.writeFile(outputPath, rows.join('\n'), 'utf-8');
  console.log(`[FEEDBACK] Exported ${feedbacks.length} feedback records to ${outputPath}`);
}
