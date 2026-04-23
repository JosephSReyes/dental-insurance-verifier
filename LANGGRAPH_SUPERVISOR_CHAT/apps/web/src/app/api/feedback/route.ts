import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { saveCorrectionToRAG } from '@/../../agents/src/shared/feedback-rag';
import { CorrectionData } from '@/../../agents/src/shared/feedback-types';

const mapperMapping: Record<string, string> = {
  'Patient Information': 'patient_info_mapper',
  'Insurance Information': 'insurance_info_mapper',
  'Coverage & Benefits': 'coverage_and_benefits_mapper',
  'Orthodontic Benefits': 'orthodontic_benefits_mapper',
  'Waiting Periods': 'waiting_periods_mapper',
  'Procedure Details': 'procedure_details_mapper',
  'Treatment History': 'treatment_history_mapper'
};

function getSectionForField(field: string, verificationData: any): string {
  const patientFields = ['patient_full_name', 'patient_name', 'patient_dob', 'subscriber_name', 'subscriber_dob', 'relationship_to_subscriber'];
  const insuranceFields = ['insurance_company', 'insurance_provider', 'member_id', 'group_number', 'policy_number', 'plan_type'];
  const coverageFields = ['preventive_coverage', 'basic_coverage', 'major_coverage', 'annual_maximum', 'deductible', 'remaining_deductible'];
  const orthodonticFields = ['orthodontic_coverage', 'orthodontic_lifetime_maximum', 'orthodontic_lifetime_used', 'orthodontic_lifetime_remaining'];
  const waitingFields = ['basic_services_waiting_period', 'major_services_waiting_period', 'orthodontic_waiting_period'];
  
  if (patientFields.some(f => field.includes(f))) return 'Patient Information';
  if (insuranceFields.some(f => field.includes(f))) return 'Insurance Information';
  if (coverageFields.some(f => field.includes(f))) return 'Coverage & Benefits';
  if (orthodonticFields.some(f => field.includes(f))) return 'Orthodontic Benefits';
  if (waitingFields.some(f => field.includes(f))) return 'Waiting Periods';
  if (field.includes('procedure') || field.includes('dental_code')) return 'Procedure Details';
  if (field.includes('treatment_history')) return 'Treatment History';
  
  return 'Patient Information';
}

async function saveToPostgres(feedbackData: any, reviewType: string) {
  try {
    if (reviewType === 'extraction_quality' && feedbackData.fieldReviews) {
      const corrections: CorrectionData[] = feedbackData.fieldReviews
        .filter((review: any) => review.status === 'incorrect')
        .map((review: any) => {
          const section = getSectionForField(review.field, feedbackData);
          const mapper = mapperMapping[section] || 'patient_info_mapper';

          // Prefer portal_version over portal_type for maximum precision
          const portalValue = feedbackData.metadata.portalVersion || feedbackData.metadata.portalType || null;

          return {
            verification_id: feedbackData.verificationId,
            mapper,
            provider: feedbackData.metadata.insuranceProvider || 'Unknown',
            field: review.field,
            ai_value: review.aiValue,
            human_value: review.humanValue,
            source_path: review.errorSource?.path,
            correct_path: review.correctedPath,
            human_reasoning: review.reasoning,
            reviewer_id: feedbackData.metadata.reviewerId,
            reviewed_at: new Date(feedbackData.metadata.timestamp),
            office_id: feedbackData.metadata.officeKey || null,
            portal_type: portalValue,  // Store portal version in portal_type column (Option A)

            // Multiple error types support (Migration 006)
            error_types: review.errorTypes || (review.errorType ? [review.errorType] : []),
            error_explanations: review.errorExplanations || {},
            violated_business_rules: review.violatedBusinessRules || [],
            business_rule_explanations: review.businessRuleExplanations || {},
            feedback_date: new Date(),

            metadata: {
              patient_name: feedbackData.metadata.patientName,
              verification_date: feedbackData.metadata.timestamp,
              office_key: feedbackData.metadata.officeKey,
              office_name: feedbackData.metadata.officeName,
              portal_type: feedbackData.metadata.portalType,
              portal_version: feedbackData.metadata.portalVersion,
              error_type: review.errorType,  // Keep for backward compatibility
              confidence: review.confidence,
              business_rule: review.businessRule,
              provider_notes: review.providerNotes
            }
          };
        });

      for (const correction of corrections) {
        await saveCorrectionToRAG(correction);
      }
      
      console.log(`✅ Saved ${corrections.length} corrections to PostgreSQL RAG`);
    } else if (reviewType === 'human_feedback' && feedbackData.fieldCorrections) {
      const corrections: CorrectionData[] = feedbackData.fieldCorrections.map((correction: any) => {
        const mapper = mapperMapping[correction.section] || 'patient_info_mapper';

        // Prefer portal_version over portal_type for maximum precision
        const portalValue = feedbackData.metadata.requestContext.portalVersion || feedbackData.metadata.requestContext.portalType || null;

        return {
          verification_id: feedbackData.verificationId,
          mapper,
          provider: feedbackData.metadata.requestContext.insuranceProvider,
          field: correction.field,
          ai_value: correction.aiValue,
          human_value: correction.correctedValue,
          human_reasoning: correction.humanReasoning,
          reviewer_id: feedbackData.reviewerInfo.reviewerId,
          reviewed_at: new Date(feedbackData.reviewerInfo.reviewedAt),
          office_id: feedbackData.metadata.requestContext.officeKey || null,
          portal_type: portalValue,  // Store portal version in portal_type column (Option A)

          // Multiple error types support (Migration 006)
          error_types: correction.errorTypes || (correction.errorType ? [correction.errorType] : []),
          error_explanations: correction.errorExplanations || {},
          violated_business_rules: correction.violatedBusinessRules || [],
          business_rule_explanations: correction.businessRuleExplanations || {},
          feedback_date: new Date(),

          metadata: {
            patient_name: feedbackData.metadata.requestContext.patientName,
            verification_date: feedbackData.metadata.timestamp,
            office_key: feedbackData.metadata.requestContext.officeKey,
            office_name: feedbackData.metadata.requestContext.officeName,
            portal_type: feedbackData.metadata.requestContext.portalType,
            portal_version: feedbackData.metadata.requestContext.portalVersion,
            error_type: correction.errorType,  // Keep for backward compatibility
            error_source: correction.errorSource,
            business_rule: correction.businessRule,
            provider_notes: correction.providerNotes
          }
        };
      });

      for (const correction of corrections) {
        await saveCorrectionToRAG(correction);
      }
      
      console.log(`✅ Saved ${corrections.length} corrections to PostgreSQL RAG`);
    }
  } catch (error) {
    console.error('⚠️ Failed to save to PostgreSQL (continuing with JSON backup):', error);
  }
}

function validateErrorTypeExplanations(correction: any): string[] {
  const errors: string[] = [];

  // Validate error types have explanations ≥10 characters
  if (correction.errorTypes && Array.isArray(correction.errorTypes)) {
    for (const errorType of correction.errorTypes) {
      const explanation = correction.errorExplanations?.[errorType];
      if (!explanation || explanation.trim().length < 10) {
        errors.push(`Error type "${errorType}" requires explanation of at least 10 characters`);
      }
    }
  }

  // Validate business rules have explanations ≥10 characters
  if (correction.violatedBusinessRules && Array.isArray(correction.violatedBusinessRules)) {
    for (const ruleCode of correction.violatedBusinessRules) {
      const explanation = correction.businessRuleExplanations?.[ruleCode];
      if (!explanation || explanation.trim().length < 10) {
        errors.push(`Business rule "${ruleCode}" requires explanation of at least 10 characters`);
      }
    }
  }

  return errors;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { verificationData, qaReport, feedback, reviewType } = body;

    if (!feedback || !reviewType) {
      return NextResponse.json(
        { error: 'Missing required data (feedback and reviewType required)' },
        { status: 400 }
      );
    }

    // Validate error type explanations
    if (feedback.fieldCorrections) {
      const validationErrors: string[] = [];
      for (const correction of feedback.fieldCorrections) {
        const errors = validateErrorTypeExplanations(correction);
        validationErrors.push(...errors);
      }
      if (validationErrors.length > 0) {
        return NextResponse.json(
          { error: 'Validation failed', details: validationErrors },
          { status: 400 }
        );
      }
    }
    if (feedback.fieldReviews) {
      const validationErrors: string[] = [];
      for (const review of feedback.fieldReviews) {
        const errors = validateErrorTypeExplanations(review);
        validationErrors.push(...errors);
      }
      if (validationErrors.length > 0) {
        return NextResponse.json(
          { error: 'Validation failed', details: validationErrors },
          { status: 400 }
        );
      }
    }

    // Determine subdirectory based on review type
    const reviewSubdir = reviewType === 'extraction_quality' ? 'extraction_reviews' :
                         reviewType === 'qa_detection' ? 'qa_reviews' :
                         reviewType === 'human_feedback' ? 'human_feedback' :
                         'general_reviews';

    const baseDir = join(process.cwd(), '../../apps/agents/feedback', reviewSubdir);
    await mkdir(baseDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const patientName = (verificationData?.patient_full_name || feedback.patientName || 'Unknown').replace(/\s+/g, '_');
    const filename = `${reviewType}_${patientName}_${timestamp}.json`;
    const filepath = join(baseDir, filename);

    // Structure feedback based on review type
    let feedbackData: any;

    if (reviewType === 'extraction_quality') {
      feedbackData = {
        reviewType: 'extraction_quality',
        verificationId: feedback.verificationId || verificationData?.reference_number,
        metadata: {
          timestamp: new Date().toISOString(),
          patientName: feedback.patientName,
          insuranceProvider: feedback.insuranceProvider,
          reviewerId: feedback.reviewerId,
          timeSpentSeconds: feedback.timeSpentSeconds
        },
        fieldReviews: feedback.fieldReviews,
        stats: feedback.stats,
        portalIssues: feedback.portalIssues,
        overallNotes: feedback.overallNotes
      };
    } else if (reviewType === 'qa_detection') {
      feedbackData = {
        reviewType: 'qa_detection',
        verificationId: feedback.verificationId,
        metadata: {
          timestamp: new Date().toISOString(),
          patientName: feedback.patientName,
          insuranceProvider: feedback.insuranceProvider,
          reviewerId: feedback.reviewerId,
          timeSpentSeconds: feedback.timeSpentSeconds
        },
        qaReport: feedback.qaReport,
        issueReviews: feedback.issueReviews,
        stats: feedback.stats,
        overallNotes: feedback.overallNotes
      };
    } else {
      // Legacy format
      feedbackData = {
        verificationId: verificationData?.reference_number || `VER-${Date.now()}`,
        metadata: {
          verificationId: verificationData?.reference_number || `VER-${Date.now()}`,
          timestamp: verificationData?.verification_date || new Date().toISOString(),
          requestContext: {
            patientName: verificationData?.patient_full_name || verificationData?.patient_name || 'Unknown',
            patientDob: verificationData?.patient_dob,
            insuranceProvider: verificationData?.insurance_company || verificationData?.insurance_provider || 'Unknown',
            dentalCodes: verificationData?.dental_codes || [],
            appointmentDate: verificationData?.appointment_date
          },
          qaResults: qaReport ? {
            score: qaReport.overallScore,
            passed: qaReport.passed,
            criticalIssues: qaReport.summary.criticalIssues,
            warnings: qaReport.summary.warnings,
            checksRun: qaReport.summary.totalChecks,
            sectionScores: Object.fromEntries(
              Object.entries(qaReport.sectionScores).map(([k, v]: [string, any]) => [k, v.score])
            )
          } : undefined
        },
        reviewerInfo: {
          reviewerId: feedback.reviewerId,
          reviewedAt: feedback.reviewedAt,
          timeSpentSeconds: feedback.timeSpentSeconds
        },
        fieldCorrections: feedback.corrections || [],
        fieldReviews: feedback.fieldReviews || [],
        qaCheckOverrides: [],
        overallApproval: feedback.approval,
        difficultyRating: feedback.difficulty,
        portalIssues: [],
        additionalNotes: feedback.notes || ''
      };
    }

    await writeFile(filepath, JSON.stringify(feedbackData, null, 2), 'utf-8');

    await saveToPostgres(feedbackData, reviewType);

    return NextResponse.json({
      success: true,
      message: 'Review saved successfully',
      filepath: filename,
      reviewType
    });

  } catch (error) {
    console.error('Error saving feedback:', error);
    return NextResponse.json(
      { error: 'Failed to save feedback', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  // Future: Return list of verifications pending review
  return NextResponse.json({
    message: 'Feedback API - use POST to submit feedback',
    endpoints: {
      'POST /api/feedback': 'Submit review feedback',
      'GET /api/feedback/summary': 'Get feedback analytics (coming soon)',
      'GET /api/feedback/pending': 'Get verifications pending review (coming soon)'
    }
  });
}
