import { FeedbackManager } from '../src/shared/feedback-capture.js';

async function main() {
  const manager = new FeedbackManager();
  
  await manager.printSummaryReport();
  
  const summary = await manager.generateSummary();
  
  if (summary.totalVerifications === 0) {
    console.log('No feedback data found yet.');
    console.log('Feedback will be stored in the "feedback/" directory as verifications are reviewed.\n');
    return;
  }
  
  console.log('\n--- Recent Feedback ---');
  const feedbacks = await manager.loadAllFeedback();
  const recent = feedbacks.slice(-10).reverse();
  
  for (const feedback of recent) {
    const icon = feedback.overallApproval === 'approved' ? '✅' : 
                 feedback.overallApproval === 'approved_with_corrections' ? '⚠️' : '❌';
    console.log(`${icon} ${feedback.metadata.requestContext.patientName} - ${feedback.overallApproval} ` +
                `(${feedback.fieldCorrections.length} corrections, QA: ${feedback.metadata.qaResults?.score || 'N/A'}%)`);
  }
  
  console.log('\n--- Export Options ---');
  console.log('To export feedback to CSV:');
  console.log('  npx tsx scripts/export-feedback-csv.ts output.csv\n');
}

main().catch(console.error);
