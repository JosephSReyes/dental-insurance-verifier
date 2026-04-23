import { loadChatModel } from "../shared/utils.js";
import { HumanMessage } from "@langchain/core/messages";
import { RunnableConfig } from "@langchain/core/runnables";
import * as fs from "fs/promises";
import { logNodeExecution } from "../shared/logging.js";
import { ensureAgentConfiguration } from "./configuration.js";
import type { WorkflowStateType } from "../shared/workflow-state.js";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { AIMessage } from "@langchain/core/messages";
import { saveExtractionMetadata, type MapperMetadata } from "../shared/metadata-utils.js";
import { getRelevantFeedback } from "../shared/feedback-rag.js";

export interface TreatmentHistoryRecord {
  serviceDate: string;
  procedureCode: string;
  description: string;
  tooth?: string;
  surface?: string;
  status?: string;
  extraction_reasoning?: string;
  source_path?: string;
  extraction_confidence?: number;
}

export interface TreatmentHistoryResult {
  treatmentHistory: TreatmentHistoryRecord[];
  confidence: number;
  sourceFile?: string;
  foundPaths?: Record<string, string>;
  reasoning?: string;
}

export async function treatmentHistoryMapperNode(
  state: WorkflowStateType,
  config: RunnableConfig,
): Promise<Partial<WorkflowStateType>> {
  console.log('[TREATMENT_HISTORY_MAPPER] Starting treatment history extraction from pre-flattened API data');
  
  let patientApiDataFolder = state.patientApiDataFolder;
  if (!patientApiDataFolder) {
    throw new Error('Patient API data folder not set in state');
  }


  const path = await import('path');
  if (!path.isAbsolute(patientApiDataFolder)) {
    const baseDir = process.cwd();
    patientApiDataFolder = path.join(baseDir, 'patient_data', patientApiDataFolder);
  }

  console.log(`[TREATMENT_HISTORY_MAPPER] Reading from aggregated flattened file: ${patientApiDataFolder}`);

  const aggregatedFlattenedPath = path.join(patientApiDataFolder, 'aggregated_flattened.json');
  
  const aggregatedExists = await fs.access(aggregatedFlattenedPath).then(() => true).catch(() => false);
  if (!aggregatedExists) {
    throw new Error(`aggregated_flattened.json not found. Aggregation step must run first.`);
  }

  console.log(`[TREATMENT_HISTORY_MAPPER] Using aggregated file: aggregated_flattened.json`);
  
  const configuration = ensureAgentConfiguration(config);
  const model = await loadChatModel(configuration.model);
  
  const { postgresSemanticSearchTool } = await import("../shared/postgres-semantic-search.js");
  const { submitTreatmentHistoryDataTool } = await import("./treatment-history-mapper-tools.js");
  const tools = [postgresSemanticSearchTool, submitTreatmentHistoryDataTool];
  
  const agent = createReactAgent({ llm: model, tools });
  
  let relevantFeedback = [];
  try {
    const provider = state.extractedInfo?.insurance_provider || 'Unknown';
    const officeKey = state.officeKey || state.extractedInfo?.office_key;
    // Prefer portal version over portal type for maximum precision
    const portalVersion = state.portalVersion || state.extractedInfo?.portal_version;
    const portalType = portalVersion || state.portalType || state.extractedInfo?.portal_type;

    relevantFeedback = await getRelevantFeedback({
      mapper: 'treatment_history_mapper',
      provider,
      field: 'all',
      currentContext: `Extracting treatment history from ${provider}`,
      limit: 5,
      officeId: officeKey,
      portalType: portalType,  // Now contains version if available
    });
    if (relevantFeedback.length > 0) {
      console.log(`[TREATMENT_HISTORY_MAPPER] 📚 Retrieved ${relevantFeedback.length} relevant past corrections from RAG (Office: ${officeKey || 'N/A'}, Portal: ${portalType || 'N/A'})`);
    }
  } catch (error) {
    console.error('[TREATMENT_HISTORY_MAPPER] ⚠️ Failed to retrieve feedback from RAG (continuing without):', error);
  }

  const feedbackSection = relevantFeedback.length > 0
    ? `\n\n🎓 LEARN FROM PAST CORRECTIONS FOR ${state.extractedInfo?.insurance_provider || 'this provider'}:\n` +
      relevantFeedback.map((fb, i) =>
        `${i + 1}. Field: ${fb.field}\n` +
        `   ❌ AI extracted: "${fb.ai_value}" ${fb.source_path ? `from ${fb.source_path}` : ''}\n` +
        `   ✅ Correct value: "${fb.human_value}"\n` +
        `   💡 Reasoning: ${fb.human_reasoning || 'No reasoning provided'}\n`
      ).join('\n')
    : '';
  
  const agentPrompt = `Extract treatment history from aggregated data.${feedbackSection}

**YOUR TASK:**
Extract all past dental treatments/services from the patient's history. This data is typically found in claims history, treatment history, or service records.

**REQUIRED FIELDS FOR EACH RECORD:**
- serviceDate: Date of service in YYYY-MM-DD format
- procedureCode: Dental procedure code (e.g., D0120, D1110, D2740)
- description: Full procedure description (e.g., "Prophylaxis - Adult", "Bitewings - Four Radiographic Images")
- tooth: Tooth number/identifier or "N/A" if not applicable
- surface: Tooth surface (e.g., "MOD", "Buccal") or "N/A" if not applicable
- status: Treatment status (e.g., "Completed", "Pending", "In Progress") or "N/A" if not available

**CONFIDENCE SCALE (0.0-1.0):**
• 0.9-1.0: Perfect match in expected location, standard format, zero ambiguity
• 0.7-0.9: Good match, minor format variations or combined fields
• 0.5-0.7: Moderate uncertainty, non-standard location or format
• 0.3-0.5: Low confidence, significant ambiguity or inference required
• 0.0-0.3: Very uncertain, guessing or likely incorrect

**STRATEGY:**

1. **Search for treatment/claim history using semantic search:**
   Call postgres_semantic_search with:
   - Query: "treatment history procedure history claim history dental services completed" (patientName: "${patientApiDataFolder}", limit: 20)

2. **Analyze the search results:**
   - Look for treatment/service records with complete structure
   - Each record typically has: date, procedure code, description
   - Some records may have tooth/surface information
   - Status may be available (completed, pending, approved, etc.)

4. **Extract and normalize:**
   - Convert dates to YYYY-MM-DD format (from MM/DD/YYYY, timestamps, etc.)
   - Normalize procedure codes to D#### format (uppercase):
     * If code is numeric (e.g., 120), convert to D0120 (pad to 4 digits with leading zeros)
     * If code already has D prefix (e.g., "D0120"), keep as-is
   - For tooth fields (toothNumber, tooth, etc.): use the value as-is or "N/A" if null/missing
   - For surface fields (surfaces, surface, etc.): use the value as-is or "N/A" if null/missing
   - Status field may not always be available - use "N/A" if missing
   - Sort by date (most recent first)

5. **Submit the results:**
   Call submit_treatment_history with:
   - All treatment records found (array)
   - Confidence level (0.0-1.0) for EACH record
   - Search terms used to locate the data
   - JSON path where the records were found
   - Reasoning explaining extraction process

**IMPORTANT:**
- Extract ALL treatment records, not just recent ones
- If no treatment history is found, submit an empty array
- Do NOT fabricate data - only extract what exists
- The system expects an array of records sorted by date (newest first)

**Example Output Structure:**
{
  "treatmentHistory": [
    {
      "serviceDate": "2025-10-07",
      "procedureCode": "D0120",
      "description": "Periodic Oral Evaluation - Established Patient",
      "tooth": "N/A",
      "surface": "N/A",
      "status": "Completed",
      "extraction_reasoning": "Found in procedures.procedureHistory[0] - serviceDate extracted from dateOfService field, procedureCode from code field (converted from numeric 120 to D0120), description from description field",
      "source_path": "procedures.procedureHistory[0]"
    },
    {
      "serviceDate": "2025-03-25",
      "procedureCode": "D1110",
      "description": "Prophylaxis - Adult",
      "tooth": "N/A",
      "surface": "N/A",
      "status": "Completed",
      "extraction_reasoning": "Found in procedures.procedureHistory[1] - serviceDate from dateOfService, procedureCode from code (1110 -> D1110), description from description field",
      "source_path": "procedures.procedureHistory[1]"
    }
  ]
}

**CRITICAL - EXTRACTION REASONING IS REQUIRED FOR EVERY RECORD:**
Each treatment history record MUST include:
- extraction_reasoning: MUST be at least 20 characters. Explain exactly where you found each key field for THIS SPECIFIC RECORD.
  * Good example: "Found in claims.history[0]: serviceDate from dos field (2025-10-07), procedureCode from code field (120 converted to D0120), description from desc field ('Periodic Oral Evaluation')"
  * Bad example: "Extracted from history" (TOO VAGUE - WILL BE REJECTED)
- source_path: MUST provide the JSON path for THIS SPECIFIC RECORD (e.g., 'claims.history[0]', 'procedures.procedureHistory[2]')
- If extraction_reasoning is missing, too short, or source_path is missing, the ENTIRE submission will be REJECTED

Begin by searching for treatment history data.`;

  console.log('[TREATMENT_HISTORY_MAPPER] ═══════════════════════════════════════════');
  console.log('[TREATMENT_HISTORY_MAPPER] Starting ReAct Agent');
  console.log('[TREATMENT_HISTORY_MAPPER] Available tools:');
  console.log('[TREATMENT_HISTORY_MAPPER]   • search_aggregated_data - Search by domain & terms (max 50 results)');
  console.log('[TREATMENT_HISTORY_MAPPER]   • get_array_context - Reconstruct full unflattened array from base path');
  console.log('[TREATMENT_HISTORY_MAPPER]   • submit_treatment_history - Submit final treatment history array (REQUIRED)');
  console.log('[TREATMENT_HISTORY_MAPPER] ═══════════════════════════════════════════\n');

  let agentResult;
  try {
    agentResult = await agent.invoke(
      {
        messages: [new HumanMessage(agentPrompt)]
      },
      {
        recursionLimit: 15
      }
    );
  } catch (err: any) {
    console.warn('[TREATMENT_HISTORY_MAPPER] Agent stopped (possibly hit recursion limit):', err.message);
    agentResult = { messages: [] };
  }
  
  console.log('[TREATMENT_HISTORY_MAPPER] ═══════════════════════════════════════════');
  console.log('[TREATMENT_HISTORY_MAPPER] Agent execution trace:');
  console.log('[TREATMENT_HISTORY_MAPPER] ═══════════════════════════════════════════');
  
  for (let i = 0; i < agentResult.messages.length; i++) {
    const msg = agentResult.messages[i];
    const role = msg._getType?.() || msg.constructor?.name?.replace('Message', '').toLowerCase() || 'unknown';
    
    if (role === 'ai') {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const toolCall of msg.tool_calls) {
          console.log(`\n[TREATMENT_HISTORY_MAPPER] 🔧 Tool Call #${i}:`);
          console.log(`[TREATMENT_HISTORY_MAPPER]    Tool: ${toolCall.name}`);
          console.log(`[TREATMENT_HISTORY_MAPPER]    Args: ${JSON.stringify(toolCall.args, null, 2).substring(0, 500).replace(/\n/g, '\n[TREATMENT_HISTORY_MAPPER]          ')}`);
        }
      } else {
        console.log(`\n[TREATMENT_HISTORY_MAPPER] 💭 Agent Reasoning #${i}:`);
        console.log(`[TREATMENT_HISTORY_MAPPER]    ${content.substring(0, 500).replace(/\n/g, '\n[TREATMENT_HISTORY_MAPPER]    ')}`);
      }
    } else if (role === 'tool') {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      console.log(`\n[TREATMENT_HISTORY_MAPPER] ✅ Tool Result #${i}:`);
      console.log(`[TREATMENT_HISTORY_MAPPER]    ${content.substring(0, 300).replace(/\n/g, '\n[TREATMENT_HISTORY_MAPPER]    ')}`);
    }
  }
  
  const finalMessage = agentResult.messages[agentResult.messages.length - 1];
  const agentResponse = typeof finalMessage.content === 'string' ? finalMessage.content : JSON.stringify(finalMessage.content);
  
  console.log('\n[TREATMENT_HISTORY_MAPPER] ═══════════════════════════════════════════');
  console.log('[TREATMENT_HISTORY_MAPPER] 🎯 Final Agent Response:');
  console.log('[TREATMENT_HISTORY_MAPPER] ═══════════════════════════════════════════');
  console.log(agentResponse);
  console.log('[TREATMENT_HISTORY_MAPPER] ═══════════════════════════════════════════\n');
  
  const { result, metadata } = extractSubmittedTreatmentHistoryData(agentResult.messages);

  // Save extraction metadata if available
  if (metadata) {
    try {
      await saveExtractionMetadata(metadata, patientApiDataFolder);
      console.log('[TREATMENT_HISTORY_MAPPER] ✅ Saved extraction metadata');
    } catch (error) {
      console.error('[TREATMENT_HISTORY_MAPPER] ❌ Failed to save extraction metadata:', error);
    }
  }
  
  let finalResult = result;
  
  if (finalResult.confidence === 0) {
    console.log('[TREATMENT_HISTORY_MAPPER] ⚠ Agent did not submit data - extracting deterministically as fallback');
    finalResult = await extractTreatmentHistoryDeterministically(patientApiDataFolder, agentResult.messages);
  }
  
  console.log('[TREATMENT_HISTORY_MAPPER] Extraction complete:', {
    confidence: finalResult.confidence,
    recordsFound: finalResult.treatmentHistory.length
  });

  logNodeExecution('treatment_history_mapper', finalResult.reasoning?.includes('deterministic fallback') ? 'deterministic' : 'llm_based', finalResult.confidence, {
    inputs: { source: 'aggregated_flattened.json' },
    outputs: { 
      totalRecords: finalResult.treatmentHistory.length,
      dateRange: finalResult.treatmentHistory.length > 0 
        ? `${finalResult.treatmentHistory[finalResult.treatmentHistory.length - 1].serviceDate} to ${finalResult.treatmentHistory[0].serviceDate}`
        : 'N/A'
    }
  });

  return {
    messages: [
      new AIMessage(`Treatment History extracted (confidence: ${(finalResult.confidence * 100).toFixed(0)}%):\n` +
        `- Total records: ${finalResult.treatmentHistory.length}\n` +
        (finalResult.treatmentHistory.length > 0 ? 
          `- Date range: ${finalResult.treatmentHistory[finalResult.treatmentHistory.length - 1].serviceDate} to ${finalResult.treatmentHistory[0].serviceDate}\n` +
          `- Sample: ${finalResult.treatmentHistory[0].serviceDate} - ${finalResult.treatmentHistory[0].procedureCode} - ${finalResult.treatmentHistory[0].description}` : 
          '- No treatment history found')
      )
    ],
    verificationResult: {
      ...state.verificationResult,
      treatment_history: finalResult.treatmentHistory.length > 0 ? finalResult.treatmentHistory : undefined,
    },
    confidenceScores: {
      ...state.confidenceScores,
      treatmentHistoryInfo: {
        confidence: finalResult.confidence,
        source: finalResult.reasoning?.includes('deterministic fallback') ? 'deterministic' : 'llm_extraction',
        timestamp: new Date().toISOString()
      }
    }
  };
}

function extractSubmittedTreatmentHistoryData(messages: any[]): { result: TreatmentHistoryResult; metadata: MapperMetadata | null } {
  let submittedData: any = null;
  let extractionMetadata: any = null;
  let avgConfidence: number | null = null;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];

    if (msg._getType?.() === 'tool' || msg.constructor?.name === 'ToolMessage') {
      try {
        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        const parsed = JSON.parse(content);

        if (parsed.treatmentHistoryData?.treatmentHistory) {
          submittedData = parsed.treatmentHistoryData.treatmentHistory;
          extractionMetadata = parsed.extractionMetadata;
          avgConfidence = parsed.avgConfidence ?? null;

          // VALIDATION: Each record MUST have extraction_reasoning and source_path
          if (Array.isArray(submittedData)) {
            for (let idx = 0; idx < submittedData.length; idx++) {
              const record = submittedData[idx];

              if (!record.extraction_reasoning || record.extraction_reasoning.trim().length < 20) {
                console.warn(`[TREATMENT_HISTORY_MAPPER] ⚠️ Record ${idx} (${record.procedureCode}): extraction_reasoning is missing or too short (must be at least 20 characters)`);
                console.warn(`[TREATMENT_HISTORY_MAPPER]    Received: "${record.extraction_reasoning || '(empty)'}".`);
                console.warn(`[TREATMENT_HISTORY_MAPPER]    REJECTING ENTIRE SUBMISSION - all records must have detailed reasoning.`);
                return {
                  result: {
                    treatmentHistory: [],
                    confidence: 0,
                    reasoning: `Agent submission rejected: record ${idx} missing or insufficient extraction_reasoning`
                  },
                  metadata: null
                };
              }

              if (!record.source_path || record.source_path.trim().length === 0) {
                console.warn(`[TREATMENT_HISTORY_MAPPER] ⚠️ Record ${idx} (${record.procedureCode}): source_path is missing`);
                console.warn(`[TREATMENT_HISTORY_MAPPER]    REJECTING ENTIRE SUBMISSION - all records must have source_path.`);
                return {
                  result: {
                    treatmentHistory: [],
                    confidence: 0,
                    reasoning: `Agent submission rejected: record ${idx} missing source_path`
                  },
                  metadata: null
                };
              }
            }
            console.log(`[TREATMENT_HISTORY_MAPPER] ✅ Validation passed: All ${submittedData.length} records have extraction_reasoning and source_path`);
          }

          break;
        }
      } catch (err) {
      }
    }
  }

  if (!submittedData) {
    console.warn('[TREATMENT_HISTORY_MAPPER] No submit_treatment_history tool call found - agent did not submit results properly');
    return {
      result: {
        treatmentHistory: [],
        confidence: 0,
        reasoning: "Agent failed to submit structured data via submit_treatment_history tool"
      },
      metadata: null
    };
  }

  const recordCount = Array.isArray(submittedData) ? submittedData.length : 0;
  // Use avgConfidence from tool if available, otherwise fall back to deterministic
  const confidence = avgConfidence ?? (recordCount > 0 ? 0.9 : 0.5);

  // Build per-entry metadata
  const fieldsMetadata: Record<string, any> = {
    treatmentHistory: {
      value: recordCount,
      sourcePath: 'aggregated_procedure_data',
      reasoning: `Extracted ${recordCount} treatment history records via LLM extraction`
    }
  };

  // Add individual entry reasoning
  if (Array.isArray(submittedData)) {
    submittedData.forEach((record, idx) => {
      fieldsMetadata[`treatment_record_${idx}`] = {
        value: record,
        sourcePath: record.source_path || 'aggregated_procedure_data',
        reasoning: record.extraction_reasoning || `Extracted treatment record: ${record.procedureCode} on ${record.serviceDate}`,
        confidence: record.extraction_confidence || 0.85
      };
    });
  }

  const metadata: MapperMetadata = {
    mapperName: 'treatment_history_mapper',
    timestamp: new Date().toISOString(),
    confidence,
    fields: extractionMetadata || fieldsMetadata,
    stats: {
      totalFields: recordCount,
      fieldsExtracted: recordCount,
      fieldsEmpty: 0,
      avgConfidence: confidence
    }
  };

  return {
    result: {
      treatmentHistory: Array.isArray(submittedData) ? submittedData : [],
      confidence,
      reasoning: `Extracted ${recordCount} treatment history records via submit_treatment_history tool`
    },
    metadata
  };
}

async function extractTreatmentHistoryDeterministically(
  folderPath: string,
  agentMessages: any[]
): Promise<TreatmentHistoryResult> {
  console.log('[TREATMENT_HISTORY_MAPPER] Running deterministic extraction fallback from PostgreSQL search results');

  const searchResults: any[] = [];

  // Extract postgres_semantic_search tool results
  for (const msg of agentMessages) {
    if (msg._getType?.() === 'tool' || msg.constructor?.name === 'ToolMessage') {
      try {
        const toolContent = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        const parsed = JSON.parse(toolContent);
        if (parsed.results && Array.isArray(parsed.results)) {
          searchResults.push(...parsed.results);
        }
      } catch (err) {
        // Ignore parsing errors
      }
    }
  }

  const treatmentRecords: TreatmentHistoryRecord[] = [];

  // Simple pattern matching to extract treatment history from chunks
  for (const result of searchResults) {
    const text = result.text || '';

    // Look for treatment records with date, code, and description
    const dateMatch = text.match(/(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})/);
    const codeMatch = text.match(/D\d{4}|\b\d{4}\b/);

    if (dateMatch && codeMatch) {
      const serviceDate = dateMatch[1];
      let procedureCode = codeMatch[0];

      // Normalize code to D#### format
      if (!/^D/.test(procedureCode)) {
        procedureCode = 'D' + procedureCode.padStart(4, '0');
      }

      treatmentRecords.push({
        serviceDate,
        procedureCode,
        description: text.substring(0, 100),
        tooth: 'N/A',
        surface: 'N/A',
        status: 'N/A',
        extraction_reasoning: 'Extracted from semantic search chunk via deterministic fallback',
        source_path: result.section_title || 'treatment_history',
        extraction_confidence: 0.5
      });
    }
  }

  console.log(`[TREATMENT_HISTORY_MAPPER] Deterministic extraction found ${treatmentRecords.length} records from ${searchResults.length} search results`);

  return {
    treatmentHistory: treatmentRecords,
    confidence: treatmentRecords.length > 0 ? 0.6 : 0.2,
    reasoning: `Extracted ${treatmentRecords.length} records via deterministic fallback from PostgreSQL semantic search results`
  };
}
