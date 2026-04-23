import { bulkImportCorrections } from '../src/shared/feedback-rag.js';
import { CorrectionData } from '../src/shared/feedback-types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../../.env') });

const mapperMapping: Record<string, string> = {
  'Patient Information': 'patient_info_mapper',
  'Insurance Information': 'insurance_info_mapper',
  'Coverage & Benefits': 'coverage_and_benefits_mapper',
  'Orthodontic Benefits': 'orthodontic_benefits_mapper',
  'Waiting Periods': 'waiting_periods_mapper',
  'Procedure Details': 'procedure_details_mapper',
  'Treatment History': 'treatment_history_mapper'
};

function getSectionForField(field: string): string {
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

async function findFeedbackFiles(baseDir: string): Promise<string[]> {
  const feedbackFiles: string[] = [];
  
  try {
    const subdirs = ['extraction_reviews', 'qa_reviews', 'human_feedback', 'general_reviews'];
    
    for (const subdir of subdirs) {
      const dirPath = path.join(baseDir, subdir);
      try {
        const files = await fs.readdir(dirPath);
        const jsonFiles = files
          .filter(f => f.endsWith('.json'))
          .map(f => path.join(dirPath, f));
        feedbackFiles.push(...jsonFiles);
      } catch (error) {
        console.log(`  ⏭️  Skipping ${subdir}/ (directory not found)`);
      }
    }
  } catch (error) {
    console.error(`Error scanning feedback directory: ${error}`);
  }
  
  return feedbackFiles;
}

async function parseFeedbackFile(filePath: string): Promise<CorrectionData[]> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    const corrections: CorrectionData[] = [];

    if (data.reviewType === 'extraction_quality' && data.fieldReviews) {
      for (const review of data.fieldReviews) {
        if (review.status === 'incorrect' || review.humanValue !== review.aiValue) {
          const section = getSectionForField(review.field);
          const mapper = mapperMapping[section] || 'patient_info_mapper';
          
          corrections.push({
            verification_id: data.verificationId,
            mapper,
            provider: data.metadata.insuranceProvider || 'Unknown',
            field: review.field,
            ai_value: review.aiValue,
            human_value: review.humanValue,
            source_path: review.errorSource?.path,
            human_reasoning: review.reasoning,
            reviewer_id: data.metadata.reviewerId,
            reviewed_at: new Date(data.metadata.timestamp),
            metadata: {
              patient_name: data.metadata.patientName,
              verification_date: data.metadata.timestamp,
              error_type: review.errorType,
              confidence: review.confidence
            }
          });
        }
      }
    } else if (data.reviewType === 'human_feedback' && data.fieldCorrections) {
      for (const correction of data.fieldCorrections) {
        const mapper = mapperMapping[correction.section] || 'patient_info_mapper';
        
        corrections.push({
          verification_id: data.verificationId,
          mapper,
          provider: data.metadata.requestContext.insuranceProvider,
          field: correction.field,
          ai_value: correction.aiValue,
          human_value: correction.correctedValue,
          human_reasoning: correction.humanReasoning,
          reviewer_id: data.reviewerInfo.reviewerId,
          reviewed_at: new Date(data.reviewerInfo.reviewedAt),
          metadata: {
            patient_name: data.metadata.requestContext.patientName,
            verification_date: data.metadata.timestamp,
            error_type: correction.errorType,
            error_source: correction.errorSource
          }
        });
      }
    }

    return corrections;
  } catch (error) {
    console.error(`Error parsing ${path.basename(filePath)}: ${error}`);
    return [];
  }
}

async function main() {
  console.log('🔄 Starting feedback import to PostgreSQL + pgvector RAG...\n');

  const feedbackBaseDir = path.join(process.cwd(), '../../feedback');
  
  console.log(`Scanning for feedback files in: ${feedbackBaseDir}\n`);

  const feedbackFiles = await findFeedbackFiles(feedbackBaseDir);

  if (feedbackFiles.length === 0) {
    console.log('❌ No feedback files found!\n');
    console.log('Feedback files are created when you submit reviews through the UI at:');
    console.log('  http://localhost:3000/review\n');
    console.log('Expected file locations:');
    console.log(`  ${feedbackBaseDir}/extraction_reviews/`);
    console.log(`  ${feedbackBaseDir}/qa_reviews/`);
    console.log(`  ${feedbackBaseDir}/human_feedback/`);
    console.log(`  ${feedbackBaseDir}/general_reviews/\n`);
    process.exit(0);
  }

  console.log(`Found ${feedbackFiles.length} feedback files to process\n`);

  let totalCorrections = 0;
  const allCorrections: CorrectionData[] = [];

  for (const filePath of feedbackFiles) {
    const corrections = await parseFeedbackFile(filePath);
    if (corrections.length > 0) {
      console.log(`  ✅ ${path.basename(filePath)}: ${corrections.length} corrections`);
      allCorrections.push(...corrections);
      totalCorrections += corrections.length;
    } else {
      console.log(`  ⏭️  ${path.basename(filePath)}: No corrections to import`);
    }
  }

  if (allCorrections.length === 0) {
    console.log('\n❌ No corrections found in any feedback files');
    console.log('All feedback files contain only "correct" status reviews\n');
    process.exit(0);
  }

  console.log(`\n📊 Summary:`);
  console.log(`  Total files scanned: ${feedbackFiles.length}`);
  console.log(`  Total corrections found: ${totalCorrections}\n`);

  console.log('💾 Importing corrections to PostgreSQL...\n');

  try {
    const imported = await bulkImportCorrections(allCorrections);
    
    console.log('\n✅ Import complete!');
    console.log(`  Successfully imported: ${imported}/${totalCorrections} corrections\n`);
    
    if (imported < totalCorrections) {
      console.log(`⚠️  ${totalCorrections - imported} corrections failed to import (see errors above)\n`);
    }

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Import failed:', error);
    process.exit(1);
  }
}

main();
