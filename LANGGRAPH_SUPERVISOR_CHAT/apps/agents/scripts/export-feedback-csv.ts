import { exportFeedbackToCSV } from '../src/shared/feedback-capture.js';

const outputPath = process.argv[2] || 'feedback_export.csv';

exportFeedbackToCSV(outputPath)
  .then(() => {
    console.log(`✅ Feedback exported to: ${outputPath}`);
  })
  .catch(error => {
    console.error('Error exporting feedback:', error);
    process.exit(1);
  });
