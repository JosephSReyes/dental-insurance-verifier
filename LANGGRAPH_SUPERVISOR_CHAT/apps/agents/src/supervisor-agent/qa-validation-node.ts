import { RunnableConfig } from "@langchain/core/runnables";
import { AIMessage } from "@langchain/core/messages";
import type { WorkflowStateType } from "../shared/workflow-state.js";
import { runQAValidation } from "../shared/qa-validation.js";
import { logNodeExecution } from "../shared/logging.js";

export async function qaValidationNode(
  state: WorkflowStateType,
  _config: RunnableConfig,
): Promise<Partial<WorkflowStateType>> {
  console.log('[QA_VALIDATION_NODE] Starting QA validation...');

  try {
    const formPath = state.forms?.json;
    if (!formPath) {
      throw new Error('No form JSON path found in state - forms must be generated before QA validation');
    }

    const requestedPatientName = state.extractedInfo?.patient_name;

    const report = await runQAValidation(formPath, requestedPatientName);

    const qaScore = report.overallScore;
    const passed = report.passed;
    const criticalIssues = report.summary.criticalIssues;
    const warnings = report.summary.warnings;

    logNodeExecution('qa_validation', 'deterministic', 1.0, {
      inputs: { formPath, requestedPatientName },
      outputs: { qaScore, passed, criticalIssues, warnings }
    });

    if (!passed) {
      console.error('[QA_VALIDATION_NODE] ❌ QA Validation FAILED');
      console.error(`[QA_VALIDATION_NODE] Critical Issues: ${criticalIssues}`);
      console.error(`[QA_VALIDATION_NODE] Score: ${qaScore}%`);
      
      return {
        messages: [
          new AIMessage(
            `❌ QA Validation FAILED (Score: ${qaScore}%)\n` +
            `Critical Issues: ${criticalIssues}, Warnings: ${warnings}\n` +
            `The verification data has quality issues that must be addressed before approval.\n` +
            `Review the QA report at: ${formPath.replace('.json', '_qa_report.json')}`
          )
        ],
        qaValidationComplete: true,
        qaValidationReport: report
      };
    }

    console.log('[QA_VALIDATION_NODE] ✅ QA Validation PASSED');
    console.log(`[QA_VALIDATION_NODE] Score: ${qaScore}%`);
    console.log(`[QA_VALIDATION_NODE] Warnings: ${warnings}`);

    const qaReportPath = formPath.replace('.json', '_qa_report.json');

    return {
      messages: [
        new AIMessage(
          `✅ QA Validation PASSED (Score: ${qaScore}%)\n` +
          `All critical checks passed. ${warnings > 0 ? `${warnings} warnings noted for review.` : 'No warnings.'}\n` +
          `Data quality metrics: Completeness ${report.dataQualityMetrics.completeness}%, ` +
          `Accuracy ${report.dataQualityMetrics.accuracy}%, ` +
          `Consistency ${report.dataQualityMetrics.consistency}%\n` +
          `QA Report: ${qaReportPath}`
        )
      ],
      qaValidationComplete: true,
      qaValidationReport: report
    };

  } catch (error) {
    console.error('[QA_VALIDATION_NODE] Error during QA validation:', error);
    
    logNodeExecution('qa_validation', 'deterministic', 0.0, {
      inputs: { formPath: state.forms?.json },
      outputs: { error: error instanceof Error ? error.message : String(error) }
    });

    return {
      messages: [
        new AIMessage(`❌ QA Validation failed with error: ${error instanceof Error ? error.message : String(error)}`)
      ],
      qaValidationComplete: true
    };
  }
}
