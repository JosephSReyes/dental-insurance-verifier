import { loadChatModel } from "../shared/utils.js";
import { HumanMessage } from "@langchain/core/messages";
import { RunnableConfig } from "@langchain/core/runnables";
import { logNodeExecution } from "../shared/logging.js";
import { ensureAgentConfiguration } from "./configuration.js";
import type { WorkflowStateType } from "../shared/workflow-state.js";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { AIMessage } from "@langchain/core/messages";
import { saveExtractionMetadata, type MapperMetadata } from "../shared/metadata-utils.js";
import { getRelevantFeedback } from "../shared/feedback-rag.js";

export interface WaitingPeriodsResult {
  basicWaitingPeriod: string | null;
  majorWaitingPeriod: string | null;
  orthoWaitingPeriod: string | null;
  confidence: number;
  sourceFile?: string;
  foundPaths?: Record<string, string>;
  reasoning?: string;
}

export async function waitingPeriodsMapperNode(
  state: WorkflowStateType,
  config: RunnableConfig,
): Promise<Partial<WorkflowStateType>> {
  console.log('[WAITING_PERIODS_MAPPER] Starting waiting periods extraction using PostgreSQL semantic search');

  const patientApiDataFolder = state.patientApiDataFolder;
  if (!patientApiDataFolder) {
    throw new Error('Patient API data folder not set in state');
  }

  console.log(`[WAITING_PERIODS_MAPPER] Patient session: ${patientApiDataFolder}`);
  console.log(`[WAITING_PERIODS_MAPPER] NEW FLOW: Querying PostgreSQL semantic search instead of reading JSON files`);
  
  const configuration = ensureAgentConfiguration(config);
  const model = await loadChatModel(configuration.model);
  
  const { postgresSemanticSearchTool } = await import("../shared/postgres-semantic-search.js");
  const { submitWaitingPeriodsDataTool } = await import("./waiting-periods-mapper-tools.js");

  const tools = [postgresSemanticSearchTool, submitWaitingPeriodsDataTool];
  
  const agent = createReactAgent({ llm: model, tools });
  
  let relevantFeedback = [];
  try {
    const provider = state.extractedInfo?.insurance_provider || 'Unknown';
    const officeKey = state.officeKey || state.extractedInfo?.office_key;
    // Prefer portal version over portal type for maximum precision
    const portalVersion = state.portalVersion || state.extractedInfo?.portal_version;
    const portalType = portalVersion || state.portalType || state.extractedInfo?.portal_type;

    relevantFeedback = await getRelevantFeedback({
      mapper: 'waiting_periods_mapper',
      provider,
      field: 'all',
      currentContext: `Extracting waiting periods from ${provider}`,
      limit: 5,
      officeId: officeKey,
      portalType: portalType,  // Now contains version if available
    });
    if (relevantFeedback.length > 0) {
      console.log(`[WAITING_PERIODS_MAPPER] 📚 Retrieved ${relevantFeedback.length} relevant past corrections from RAG (Office: ${officeKey || 'N/A'}, Portal: ${portalType || 'N/A'})`);
    }
  } catch (error) {
    console.error('[WAITING_PERIODS_MAPPER] ⚠️ Failed to retrieve feedback from RAG (continuing without):', error);
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
  
  const agentPrompt = `Extract waiting periods from JSON files.${feedbackSection}

**REQUIRED FIELDS:**
- basicWaitingPeriod (e.g., "6 months", "None", "N/A")
- majorWaitingPeriod (e.g., "12 months", "None", "N/A")
- orthoWaitingPeriod (e.g., "12 months", "None", "N/A")

**CONFIDENCE SCALE (0.0-1.0):**
• 0.9-1.0: Perfect match in expected location, standard format, zero ambiguity
• 0.7-0.9: Good match, minor format variations or combined fields
• 0.5-0.7: Moderate uncertainty, non-standard location or format
• 0.3-0.5: Low confidence, significant ambiguity or inference required
• 0.0-0.3: Very uncertain, guessing or likely incorrect

**STRATEGY:**
1. Call postgres_semantic_search with targeted queries:
   - Query: "basic services waiting period" (patientName: "${patientApiDataFolder}", limit: 5)
   - Query: "major services waiting period" (patientName: "${patientApiDataFolder}", limit: 5)
   - Query: "orthodontic waiting period" (patientName: "${patientApiDataFolder}", limit: 5)

2. Extract values from search results, format as "6 months" or "None"

3. Call submit_waiting_periods_data with:
   - All found fields (omit nulls)
   - Confidence level (0.0-1.0) for EACH field
   - Search terms used to locate each field
   - JSON path where each field was found
   - Reasoning explaining WHY each value is correct`;


  console.log('[WAITING_PERIODS_MAPPER] ═══════════════════════════════════════════');
  console.log('[WAITING_PERIODS_MAPPER] Starting ReAct Agent with file metadata');
  console.log('[WAITING_PERIODS_MAPPER] Available tools:');
  console.log('[WAITING_PERIODS_MAPPER]   • search_aggregated_data - Search for specific terms in aggregated file by domain');
  console.log('[WAITING_PERIODS_MAPPER]   • submit_waiting_periods_data - Submit final JSON result (REQUIRED)');
  console.log('[WAITING_PERIODS_MAPPER] ═══════════════════════════════════════════\n');

  const agentResult = await agent.invoke({
    messages: [new HumanMessage(agentPrompt)]
  });
  
  console.log('[WAITING_PERIODS_MAPPER] ═══════════════════════════════════════════');
  console.log('[WAITING_PERIODS_MAPPER] Agent execution trace:');
  console.log('[WAITING_PERIODS_MAPPER] ═══════════════════════════════════════════');
  
  for (let i = 0; i < agentResult.messages.length; i++) {
    const msg = agentResult.messages[i];
    const role = msg._getType?.() || msg.constructor?.name?.replace('Message', '').toLowerCase() || 'unknown';
    
    if (role === 'ai') {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      const aiMsg = msg as AIMessage;
      
      if (aiMsg.tool_calls && aiMsg.tool_calls.length > 0) {
        for (const toolCall of aiMsg.tool_calls) {
          console.log(`\n[WAITING_PERIODS_MAPPER] 🔧 Tool Call #${i}:`);
          console.log(`[WAITING_PERIODS_MAPPER]    Tool: ${toolCall.name}`);
          console.log(`[WAITING_PERIODS_MAPPER]    Args: ${JSON.stringify(toolCall.args, null, 2).replace(/\n/g, '\n[WAITING_PERIODS_MAPPER]          ')}`);
        }
      } else {
        console.log(`\n[WAITING_PERIODS_MAPPER] 💭 Agent Reasoning #${i}:`);
        console.log(`[WAITING_PERIODS_MAPPER]    ${content.substring(0, 500).replace(/\n/g, '\n[WAITING_PERIODS_MAPPER]    ')}`);
      }
    } else if (role === 'tool') {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      console.log(`\n[WAITING_PERIODS_MAPPER] ✅ Tool Result #${i}:`);
      console.log(`[WAITING_PERIODS_MAPPER]    ${content.substring(0, 300).replace(/\n/g, '\n[WAITING_PERIODS_MAPPER]    ')}`);
    }
  }
  
  const finalMessage = agentResult.messages[agentResult.messages.length - 1];
  const agentResponse = typeof finalMessage.content === 'string' ? finalMessage.content : JSON.stringify(finalMessage.content);
  
  console.log('\n[WAITING_PERIODS_MAPPER] ═══════════════════════════════════════════');
  console.log('[WAITING_PERIODS_MAPPER] 🎯 Final Agent Response:');
  console.log('[WAITING_PERIODS_MAPPER] ═══════════════════════════════════════════');
  console.log(agentResponse);
  console.log('[WAITING_PERIODS_MAPPER] ═══════════════════════════════════════════\n');
  
  const { result, metadata } = extractSubmittedWaitingPeriodsData(agentResult.messages);

  // Save extraction metadata if available
  if (metadata) {
    try {
      await saveExtractionMetadata(metadata, patientApiDataFolder);
      console.log('[WAITING_PERIODS_MAPPER] ✅ Saved extraction metadata');
    } catch (error) {
      console.error('[WAITING_PERIODS_MAPPER] ❌ Failed to save extraction metadata:', error);
    }
  }
  
  console.log('[WAITING_PERIODS_MAPPER] Extraction complete:', {
    confidence: result.confidence,
    fieldsFound: Object.keys(result.foundPaths || {}).length
  });

  logNodeExecution('waiting_periods_mapper', result.confidence > 0.8 ? 'deterministic' : 'llm_based', result.confidence, {
    inputs: { source: 'postgresql_semantic_search' },
    outputs: {
      basicWaitingPeriod: result.basicWaitingPeriod,
      majorWaitingPeriod: result.majorWaitingPeriod,
      orthoWaitingPeriod: result.orthoWaitingPeriod
    }
  });

  return {
    messages: [
      new AIMessage(`Waiting Periods extracted (confidence: ${(result.confidence * 100).toFixed(0)}%):\n` +
        `- Basic: ${result.basicWaitingPeriod || 'N/A'}\n` +
        `- Major: ${result.majorWaitingPeriod || 'N/A'}\n` +
        `- Orthodontic: ${result.orthoWaitingPeriod || 'N/A'}`
      )
    ],
    verificationResult: {
      ...state.verificationResult,
      basic_waiting_period: result.basicWaitingPeriod || state.verificationResult?.basic_waiting_period,
      major_waiting_period: result.majorWaitingPeriod || state.verificationResult?.major_waiting_period,
      ortho_waiting_period: result.orthoWaitingPeriod || state.verificationResult?.ortho_waiting_period,
    },
    confidenceScores: {
      ...state.confidenceScores,
      waitingPeriodsInfo: {
        confidence: result.confidence,
        source: 'llm_extraction',
        timestamp: new Date().toISOString()
      }
    }
  };
}

function extractSubmittedWaitingPeriodsData(messages: any[]): { result: WaitingPeriodsResult; metadata: MapperMetadata | null } {
  let submittedData: any = null;
  let extractionMetadata: any = null;
  let avgConfidence: number | null = null;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];

    if (msg._getType?.() === 'tool' || msg.constructor?.name === 'ToolMessage') {
      try {
        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        const parsed = JSON.parse(content);

        if (parsed.waitingPeriodsData) {
          submittedData = parsed.waitingPeriodsData;
          extractionMetadata = parsed.extractionMetadata;
          avgConfidence = parsed.avgConfidence ?? null;
          break;
        }
      } catch (err) {
      }
    }
  }

  if (!submittedData) {
    console.warn('[WAITING_PERIODS_MAPPER] No submit_waiting_periods_data tool call found - agent did not submit results properly');
    return {
      result: {
        basicWaitingPeriod: null,
        majorWaitingPeriod: null,
        orthoWaitingPeriod: null,
        confidence: 0,
        reasoning: "Agent failed to submit structured data via submit_waiting_periods_data tool"
      },
      metadata: null
    };
  }

  const fieldsFound = Object.values(submittedData).filter(v => v !== null && v !== undefined).length;
  // Use avgConfidence from tool if available, otherwise fall back to deterministic
  const confidence = avgConfidence ?? (fieldsFound / 3);

  const metadata: MapperMetadata | null = extractionMetadata ? {
    mapperName: 'waiting_periods_mapper',
    timestamp: new Date().toISOString(),
    confidence,
    fields: extractionMetadata,
    stats: {
      totalFields: 3,
      fieldsExtracted: fieldsFound,
      fieldsEmpty: 3 - fieldsFound,
      avgConfidence: confidence
    }
  } : null;

  return {
    result: {
      basicWaitingPeriod: submittedData.basicWaitingPeriod || null,
      majorWaitingPeriod: submittedData.majorWaitingPeriod || null,
      orthoWaitingPeriod: submittedData.orthoWaitingPeriod || null,
      confidence,
      reasoning: `Extracted ${fieldsFound}/3 fields via submit_waiting_periods_data tool`
    },
    metadata
  };
}
