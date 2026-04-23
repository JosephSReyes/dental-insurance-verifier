import * as fs from 'fs/promises';
import * as path from 'path';
import * as readline from 'readline';
import { FeedbackManager, HumanFeedback, FieldCorrection, VerificationMetadata, createEmptyFeedback } from '../src/shared/feedback-capture.js';
import { ValidationReport } from '../src/shared/qa-validation.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query: string): Promise<string> {
  return new Promise(resolve => rl.question(query, resolve));
}

async function loadVerificationFiles(verificationPath: string) {
  const formData = JSON.parse(await fs.readFile(verificationPath, 'utf-8'));
  
  const qaReportPath = verificationPath.replace('.json', '_qa_report.json');
  let qaReport: ValidationReport | null = null;
  
  try {
    qaReport = JSON.parse(await fs.readFile(qaReportPath, 'utf-8'));
  } catch (error) {
    console.warn(`No QA report found at ${qaReportPath}`);
  }
  
  return { formData, qaReport };
}

async function createMetadataFromForm(formData: any, qaReport: ValidationReport | null): Promise<VerificationMetadata> {
  const formPath = process.argv[2];
  const folderName = path.basename(path.dirname(formPath));
  const patientDataFolder = folderName.includes('patient_data') 
    ? path.dirname(formPath)
    : path.join(path.dirname(formPath), '../patient_data', formData.patient_full_name?.replace(/\s+/g, '_') || 'unknown');

  return {
    verificationId: formData.reference_number || `VER-${Date.now()}`,
    timestamp: formData.verification_date || new Date().toISOString(),
    requestContext: {
      patientName: formData.patient_full_name || formData.patient_name || 'Unknown',
      patientDob: formData.patient_dob,
      insuranceProvider: formData.insurance_company || formData.insurance_provider || 'Unknown',
      dentalCodes: formData.dental_codes || [],
      appointmentDate: formData.appointment_date
    },
    officeContext: {
      officeKey: formData.office_name || 'UNKNOWN',
      officeName: formData.office_name || 'Unknown Office',
      contractedPlans: formData.office_contracted_plans || 'Unknown'
    },
    portalContext: {
      portalType: formData.data_source?.includes('bcbs') ? 'bcbs' : 
                  formData.data_source?.includes('delta') ? 'delta_dental' : 'other',
      sessionReused: false
    },
    dataSourcePaths: {
      patientApiDataFolder: patientDataFolder,
      formPath,
      qaReportPath: qaReport ? formPath.replace('.json', '_qa_report.json') : undefined
    },
    processingMetrics: {
      durationMs: {
        totalProcessing: 0
      }
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
    } : undefined,
    environment: {
      nodeVersion: process.version,
      modelUsed: 'gpt-4o-mini'
    }
  };
}

async function runInteractiveReview() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('          VERIFICATION REVIEW INTERFACE');
  console.log('═══════════════════════════════════════════════════════\n');

  const verificationPath = process.argv[2];
  if (!verificationPath) {
    console.error('Error: Please provide verification JSON path');
    console.error('Usage: npx tsx scripts/review-verification.ts <path-to-verification.json>');
    process.exit(1);
  }

  const { formData, qaReport } = await loadVerificationFiles(verificationPath);
  
  console.log(`Patient: ${formData.patient_full_name}`);
  console.log(`Insurance: ${formData.insurance_company}`);
  console.log(`Subscriber ID: ${formData.subscriber_id}`);
  
  if (qaReport) {
    console.log(`\nQA Score: ${qaReport.overallScore}% ${qaReport.passed ? '✅' : '❌'}`);
    console.log(`Critical Issues: ${qaReport.summary.criticalIssues}`);
    console.log(`Warnings: ${qaReport.summary.warnings}`);
    
    if (qaReport.issues.length > 0) {
      console.log('\nQA Issues Found:');
      for (const issue of qaReport.issues.slice(0, 5)) {
        const icon = issue.severity === 'critical' ? '❌' : '⚠️';
        console.log(`  ${icon} [${issue.section}] ${issue.field}: ${issue.issue}`);
      }
      if (qaReport.issues.length > 5) {
        console.log(`  ... and ${qaReport.issues.length - 5} more issues`);
      }
    }
  }

  console.log('\n═══════════════════════════════════════════════════════\n');

  const reviewerId = await question('Reviewer ID (e.g., your email): ');
  const startTime = Date.now();

  const metadata = await createMetadataFromForm(formData, qaReport);
  const feedback = createEmptyFeedback(metadata, reviewerId);

  const approval = await question('\nApproval status (approved / approved_with_corrections / rejected): ');
  feedback.overallApproval = approval as any;

  if (approval !== 'approved') {
    const correctionsCount = await question('How many field corrections? ');
    const count = parseInt(correctionsCount);

    for (let i = 0; i < count; i++) {
      console.log(`\nCorrection ${i + 1}/${count}:`);
      const field = await question('  Field name: ');
      const section = await question('  Section: ');
      const aiValue = await question('  AI extracted value: ');
      const correctValue = await question('  Correct value: ');
      const errorType = await question('  Error type (mapping_error / portal_data_error / logic_error / formatting_error / scraping_error): ');
      const errorSource = await question('  Error source (e.g., patient_info_mapper, bcbs_scraper): ');
      const notes = await question('  Notes: ');
      const confidenceStr = await question('  Your confidence (1-5): ');

      const correction: FieldCorrection = {
        field,
        section,
        aiExtractedValue: aiValue,
        correctedValue: correctValue,
        errorType: errorType as any,
        errorSource: errorSource as any,
        notes,
        confidence: parseInt(confidenceStr) as any
      };

      feedback.fieldCorrections.push(correction);
    }
  }

  const difficultyStr = await question('\nDifficulty rating (1=easy, 5=very hard): ');
  feedback.difficultyRating = parseInt(difficultyStr) as any;

  const portalIssuesStr = await question('Any portal issues? (comma-separated, or "none"): ');
  if (portalIssuesStr.toLowerCase() !== 'none') {
    feedback.portalIssues = portalIssuesStr.split(',').map(s => s.trim());
  }

  const notes = await question('Additional notes: ');
  feedback.additionalNotes = notes;

  const endTime = Date.now();
  feedback.reviewerInfo.timeSpentSeconds = Math.round((endTime - startTime) / 1000);
  feedback.reviewerInfo.reviewedAt = new Date().toISOString();

  const manager = new FeedbackManager();
  const feedbackPath = await manager.saveFeedback(feedback);

  console.log('\n✅ Feedback saved successfully!');
  console.log(`   Path: ${feedbackPath}`);
  console.log(`   Review time: ${feedback.reviewerInfo.timeSpentSeconds}s`);
  console.log('\nThank you for your review!\n');

  rl.close();
}

runInteractiveReview().catch(error => {
  console.error('Error during review:', error);
  rl.close();
  process.exit(1);
});
