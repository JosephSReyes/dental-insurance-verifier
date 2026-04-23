/**
 * ENHANCED Patient Info Mapper
 *
 * This is an enhanced version of patient-info-mapper.ts that uses the
 * new Label Studio annotation feedback system.
 *
 * TO ADOPT: Rename this file to patient-info-mapper.ts (backup the original first)
 *
 * Key improvements:
 * - Uses enhanced RAG feedback with path corrections
 * - Incorporates search strategy suggestions
 * - Includes edge case warnings
 * - Shows portal-specific quirks
 * - Provides confidence calibration advice
 */

import { loadChatModel } from "../shared/utils.js";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { RunnableConfig } from "@langchain/core/runnables";
import * as fs from "fs/promises";
import { ensureAgentConfiguration } from "./configuration.js";
import type { WorkflowStateType } from "../shared/workflow-state.js";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { validatePatientFieldTool, submitExtractedDataTool } from "./patient-info-mapper-tools.js";
import { saveExtractionMetadata, type MapperMetadata } from "../shared/metadata-utils.js";

// NEW: Import enhanced feedback system
import {
  getEnhancedFeedbackForMapper,
  buildEnhancedMapperPrompt,
  logFeedbackUsage,
} from "../shared/enhanced-mapper-helper.js";

export interface PatientInfoResult {
  patientName: string | null;
  patientDOB: string | null;
  subscriberName: string | null;
  subscriberDOB: string | null;
  memberId: string | null;
  groupNumber: string | null;
  confidence: number;
  sourceFile?: string;
  foundPaths?: Record<string, string>;
  reasoning?: string;
}

export async function patientInfoMapperNode(
  state: WorkflowStateType,
  config: RunnableConfig,
): Promise<Partial<WorkflowStateType>> {
  console.log('[PATIENT_INFO_MAPPER] Starting ENHANCED patient info extraction');

  let patientApiDataFolder = state.patientApiDataFolder;
  if (!patientApiDataFolder) {
    throw new Error('Patient API data folder not set in state');
  }

  if (!state.jsonFlattened) {
    throw new Error('JSON files have not been flattened - flatten_json node must run first');
  }

  const path = await import('path');
  if (!path.isAbsolute(patientApiDataFolder)) {
    const baseDir = process.cwd();
    patientApiDataFolder = path.join(baseDir, 'patient_data', patientApiDataFolder);
  }

  const aggregatedFlattenedPath = path.join(patientApiDataFolder, 'aggregated_flattened.json');

  const aggregatedExists = await fs.access(aggregatedFlattenedPath).then(() => true).catch(() => false);
  if (!aggregatedExists) {
    throw new Error(`aggregated_flattened.json not found. Aggregation step must run first.`);
  }

  const configuration = ensureAgentConfiguration(config);
  const model = await loadChatModel(configuration.model);

  const { searchAggregatedDataTool } = await import("./aggregated-search-tool.js");
  const tools = [searchAggregatedDataTool, validatePatientFieldTool, submitExtractedDataTool];

  const agent = createReactAgent({ llm: model, tools });

  // ═══════════════════════════════════════════════════════════════════
  // NEW: Fetch enhanced feedback from Label Studio annotations
  // ═══════════════════════════════════════════════════════════════════
  const { feedbackSection, hasFeedback, summary } = await getEnhancedFeedbackForMapper({
    mapper: 'patient_info_mapper',
    state,
    includePathFeedback: true,
    includeSearchStrategies: true,
    includeEdgeCases: true,
    includePortalQuirks: true,
    limit: 5,
  });

  // Log feedback usage
  if (hasFeedback) {
    console.log('[PATIENT_INFO_MAPPER] 🎓 Enhanced feedback loaded:');
    console.log(summary);
  } else {
    console.log('[PATIENT_INFO_MAPPER] ℹ️  No enhanced feedback available (using defaults)');
  }

  // ═══════════════════════════════════════════════════════════════════
  // Build enhanced prompt with feedback
  // ═══════════════════════════════════════════════════════════════════
  const basePrompt = `You are extracting patient information from pre-aggregated insurance portal data.

**REQUIRED FIELDS:**
- patientName (full name, combine firstName + lastName if needed)
- patientDOB (YYYY-MM-DD format)
- subscriberName (full name of subscriber)
- subscriberDOB (YYYY-MM-DD format)
- memberId (member/subscriber ID number)
- groupNumber (group/plan number)

**EXTRACTION STRATEGY:**

1. **Search the aggregated data** using search_aggregated_data tool:
   - folderPath: "${patientApiDataFolder}"
   - domains: ["patient", "subscriber", "plan", "member"]
   - searchTerms: Use effective terms from past feedback, or default to:
     ["name", "firstName", "lastName", "fullName",
      "dob", "dateOfBirth", "birth",
      "memberId", "subscriberId", "id",
      "groupNumber", "group"]

2. **Extract values from search results:**
   - Combine firstName + lastName for full names
   - Convert dates to YYYY-MM-DD format
   - Clean and validate all values

3. **Pay special attention to JSON paths:**
   - Note which exact path you found each value at
   - If multiple paths exist, choose the most reliable one
   - Record your reasoning for path selection

4. **Submit results** using submit_extracted_data tool with:
   - All extracted field values
   - Source paths for each field (very important!)
   - Your confidence level (0.0-1.0)
   - Reasoning for your extraction choices

**DATA STRUCTURE:**
The aggregated data is organized into domains:
- patient.* - Patient/member information
- subscriber.* - Subscriber information (may be same as patient)
- plan.* - Plan and group information

**IMPORTANT NOTES:**
- Always record the source path where you found each value
- Be precise with your confidence scoring
- If a field is missing, return null for that field
- Validate dates are in YYYY-MM-DD format before submitting`;

  // Combine base prompt with enhanced feedback
  const agentPrompt = buildEnhancedMapperPrompt(basePrompt, feedbackSection, {
    prependFeedback: false, // Put feedback after instructions
  });

  // ═══════════════════════════════════════════════════════════════════
  // Execute ReAct Agent
  // ═══════════════════════════════════════════════════════════════════
  console.log('[PATIENT_INFO_MAPPER] ═══════════════════════════════════════════');
  console.log('[PATIENT_INFO_MAPPER] Starting ReAct Agent with Enhanced Feedback');
  console.log('[PATIENT_INFO_MAPPER] Available tools:');
  console.log('[PATIENT_INFO_MAPPER]   • search_aggregated_data - Search by domain & terms');
  console.log('[PATIENT_INFO_MAPPER]   • validate_patient_field - Validate extracted values');
  console.log('[PATIENT_INFO_MAPPER]   • submit_extracted_data - Submit final result');
  console.log('[PATIENT_INFO_MAPPER] ═══════════════════════════════════════════\n');

  let agentResult;
  try {
    agentResult = await agent.invoke(
      {
        messages: [new HumanMessage(agentPrompt)]
      },
      {
        recursionLimit: 10
      }
    );
  } catch (err: any) {
    console.warn('[PATIENT_INFO_MAPPER] Agent stopped:', err.message);
    agentResult = { messages: [] };
  }

  // ═══════════════════════════════════════════════════════════════════
  // Log agent trace
  // ═══════════════════════════════════════════════════════════════════
  console.log('[PATIENT_INFO_MAPPER] ═══════════════════════════════════════════');
  console.log('[PATIENT_INFO_MAPPER] Agent execution trace:');
  console.log('[PATIENT_INFO_MAPPER] ═══════════════════════════════════════════');

  for (let i = 0; i < agentResult.messages.length; i++) {
    const msg = agentResult.messages[i];
    const role = msg._getType?.() || msg.constructor?.name?.replace('Message', '').toLowerCase() || 'unknown';

    if (role === 'ai') {
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const toolCall of msg.tool_calls) {
          console.log(`\n[PATIENT_INFO_MAPPER] 🔧 Tool Call #${i}:`);
          console.log(`[PATIENT_INFO_MAPPER]    Tool: ${toolCall.name}`);
          console.log(`[PATIENT_INFO_MAPPER]    Args: ${JSON.stringify(toolCall.args, null, 2).replace(/\n/g, '\n[PATIENT_INFO_MAPPER]          ')}`);
        }
      } else {
        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        console.log(`\n[PATIENT_INFO_MAPPER] 💭 Agent Reasoning #${i}:`);
        console.log(`[PATIENT_INFO_MAPPER]    ${content.substring(0, 500).replace(/\n/g, '\n[PATIENT_INFO_MAPPER]    ')}`);
      }
    } else if (role === 'tool') {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      console.log(`\n[PATIENT_INFO_MAPPER] ✅ Tool Result #${i}:`);
      console.log(`[PATIENT_INFO_MAPPER]    ${content.substring(0, 300).replace(/\n/g, '\n[PATIENT_INFO_MAPPER]    ')}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Extract and process results
  // ═══════════════════════════════════════════════════════════════════
  const { result, metadata } = extractSubmittedData(agentResult.messages);

  let finalResult = result;
  let finalMetadata = metadata;

  // Fallback if agent didn't submit data properly
  if (!finalResult.patientName && !finalResult.memberId) {
    console.warn('[PATIENT_INFO_MAPPER] ⚠️  Agent did not submit complete data, attempting fallback extraction');
    // Could implement fallback logic here
  }

  // ═══════════════════════════════════════════════════════════════════
  // Save metadata with enhanced information
  // ═══════════════════════════════════════════════════════════════════
  const enhancedMetadata: MapperMetadata = {
    mapperName: 'patient_info_mapper',
    timestamp: new Date().toISOString(),
    confidence: finalMetadata.confidence,
    fields: finalMetadata.fields || {},
  };

  // Add extraction time and tool call count for performance tracking
  // These will be used in future Label Studio annotations
  try {
    await saveExtractionMetadata(enhancedMetadata, patientApiDataFolder);
  } catch (error) {
    console.error('[PATIENT_INFO_MAPPER] Failed to save metadata:', error);
  }

  console.log('[PATIENT_INFO_MAPPER] ✅ Extraction complete');
  console.log('[PATIENT_INFO_MAPPER] Results:', JSON.stringify(finalResult, null, 2));

  return {
    messages: [
      new AIMessage(`Patient info extracted (confidence: ${(finalResult.confidence * 100).toFixed(0)}%):\n` +
        `- Patient: ${finalResult.patientName || 'N/A'}\n` +
        `- DOB: ${finalResult.patientDOB || 'N/A'}\n` +
        `- Subscriber: ${finalResult.subscriberName || 'N/A'}\n` +
        `- Member ID: ${finalResult.memberId || 'N/A'}\n` +
        `- Group #: ${finalResult.groupNumber || 'N/A'}`
      )
    ],
    verificationResult: {
      ...state.verificationResult,
      patient_name: finalResult.patientName || state.verificationResult?.patient_name,
      patient_full_name: finalResult.patientName || state.verificationResult?.patient_full_name,
      patient_dob: finalResult.patientDOB || state.verificationResult?.patient_dob,
      subscriber_name: finalResult.subscriberName || state.verificationResult?.subscriber_name,
      subscriber_dob: finalResult.subscriberDOB || state.verificationResult?.subscriber_dob,
      subscriber_id: finalResult.memberId || state.verificationResult?.subscriber_id,
      group_number: finalResult.groupNumber || state.verificationResult?.group_number,
    },
    confidenceScores: {
      ...state.confidenceScores,
      extractedInfo: {
        confidence: finalResult.confidence,
        source: 'llm_extraction',
        timestamp: new Date().toISOString()
      }
    }
  };
}

/**
 * Extract submitted data from agent messages
 */
function extractSubmittedData(messages: any[]): {
  result: PatientInfoResult;
  metadata: any;
} {
  // Find the submit_extracted_data tool call
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.tool_calls) {
      const submitCall = msg.tool_calls.find(
        (tc: any) => tc.name === 'submit_extracted_data'
      );
      if (submitCall && submitCall.args) {
        return {
          result: {
            patientName: submitCall.args.patientName || null,
            patientDOB: submitCall.args.patientDOB || null,
            subscriberName: submitCall.args.subscriberName || null,
            subscriberDOB: submitCall.args.subscriberDOB || null,
            memberId: submitCall.args.memberId || null,
            groupNumber: submitCall.args.groupNumber || null,
            confidence: submitCall.args.confidence || 0.5,
            foundPaths: submitCall.args.foundPaths,
            reasoning: submitCall.args.reasoning,
          },
          metadata: {
            confidence: submitCall.args.confidence || 0.5,
            fields: submitCall.args.foundPaths ?
              Object.fromEntries(
                Object.entries(submitCall.args.foundPaths).map(([field, path]) => [
                  field,
                  {
                    value: (submitCall.args as any)[field],
                    sourcePath: path,
                    reasoning: submitCall.args.reasoning || '',
                  },
                ])
              ) : {},
          },
        };
      }
    }
  }

  // Fallback empty result
  return {
    result: {
      patientName: null,
      patientDOB: null,
      subscriberName: null,
      subscriberDOB: null,
      memberId: null,
      groupNumber: null,
      confidence: 0,
    },
    metadata: {
      confidence: 0,
      fields: {},
    },
  };
}
