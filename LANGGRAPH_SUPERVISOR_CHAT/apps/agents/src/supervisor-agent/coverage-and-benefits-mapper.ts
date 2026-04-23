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

export interface CoverageAndBenefitsResult {
  preventiveCoverage: string | null;
  basicCoverage: string | null;
  majorCoverage: string | null;
  yearlyMaximum: string | null;
  yearlyMaximumUsed: string | null;
  yearlyDeductible: string | null;
  yearlyDeductibleUsed: string | null;
  dependentCoverageAge: string | null;
  missingToothClause: boolean | null;
  confidence: number;
  sourceFile?: string;
  foundPaths?: Record<string, string>;
  reasoning?: string;
}

export async function coverageAndBenefitsMapperNode(
  state: WorkflowStateType,
  config: RunnableConfig,
): Promise<Partial<WorkflowStateType>> {
  console.log('[COVERAGE_BENEFITS_MAPPER] Starting coverage & benefits extraction using PostgreSQL semantic search');

  const patientApiDataFolder = state.patientApiDataFolder;
  if (!patientApiDataFolder) {
    throw new Error('Patient API data folder not set in state');
  }

  console.log(`[COVERAGE_BENEFITS_MAPPER] Patient session: ${patientApiDataFolder}`);
  console.log(`[COVERAGE_BENEFITS_MAPPER] NEW FLOW: Querying PostgreSQL semantic search instead of reading JSON files`);
  
  const configuration = ensureAgentConfiguration(config);
  const model = await loadChatModel(configuration.model);
  
  const { postgresSemanticSearchTool } = await import("../shared/postgres-semantic-search.js");
  const { submitCoverageBenefitsDataTool } = await import("./coverage-and-benefits-mapper-tools.js");
  const tools = [postgresSemanticSearchTool, submitCoverageBenefitsDataTool];
  
  const agent = createReactAgent({ llm: model, tools });
  
  let relevantFeedback = [];
  try {
    const provider = state.extractedInfo?.insurance_provider || 'Unknown';
    const officeKey = state.officeKey || state.extractedInfo?.office_key;
    // Prefer portal version over portal type for maximum precision
    const portalVersion = state.portalVersion || state.extractedInfo?.portal_version;
    const portalType = portalVersion || state.portalType || state.extractedInfo?.portal_type;

    relevantFeedback = await getRelevantFeedback({
      mapper: 'coverage_and_benefits_mapper',
      provider,
      field: 'all',
      currentContext: `Extracting coverage and benefits from ${provider}`,
      limit: 5,
      officeId: officeKey,
      portalType: portalType,  // Now contains version if available
    });
    if (relevantFeedback.length > 0) {
      console.log(`[COVERAGE_BENEFITS_MAPPER] 📚 Retrieved ${relevantFeedback.length} relevant past corrections from RAG (Office: ${officeKey || 'N/A'}, Portal: ${portalType || 'N/A'})`);
    }
  } catch (error) {
    console.error('[COVERAGE_BENEFITS_MAPPER] ⚠️ Failed to retrieve feedback from RAG (continuing without):', error);
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
  
  const agentPrompt = `Extract coverage & benefits from JSON files.${feedbackSection}

**REQUIRED FIELDS:**
- preventiveCoverage, basicCoverage, majorCoverage (e.g., "100%", "80%")
- yearlyMaximum, yearlyMaximumUsed (e.g., "$2500", "$239.40")
- yearlyDeductible, yearlyDeductibleUsed (e.g., "$50", "$0")
- dependentCoverageAge (e.g., "26")
- missingToothClause (boolean: true if plan has missing tooth clause, false if not)

**CONFIDENCE SCALE (0.0-1.0):**
• 0.9-1.0: Perfect match in expected location, standard format, zero ambiguity
• 0.7-0.9: Good match, minor format variations or combined fields
• 0.5-0.7: Moderate uncertainty, non-standard location or format
• 0.3-0.5: Low confidence, significant ambiguity or inference required
• 0.0-0.3: Very uncertain, guessing or likely incorrect

**STRATEGY:**
1. Call postgres_semantic_search with targeted queries:
   - Query: "preventive basic major coverage percentages" (patientName: "${patientApiDataFolder}", limit: 5)
   - Query: "yearly maximum annual max benefit limit" (patientName: "${patientApiDataFolder}", limit: 5)
   - Query: "deductible annual deductible" (patientName: "${patientApiDataFolder}", limit: 5)
   - Query: "dependent coverage age limit" (patientName: "${patientApiDataFolder}", limit: 5)
   - Query: "missing tooth clause provision" (patientName: "${patientApiDataFolder}", limit: 5)

2. Extract values from search results:
   - Format coverage as "100%" or "$2500"
   - For missingToothClause: Look for "planSummary.data.missingTooth" boolean field
     * If found and equals true → missingToothClause: true (plan HAS missing tooth restriction)
     * If found and equals false → missingToothClause: false (plan does NOT have restriction)
     * NEVER generate text descriptions - only extract the boolean value

3. Call submit_coverage_benefits_data with:
   - All found fields (omit nulls)
   - Confidence level (0.0-1.0) for EACH field
   - Search terms used to locate each field
   - JSON path where each field was found
   - Reasoning explaining WHY each value is correct`;


  console.log('[COVERAGE_BENEFITS_MAPPER] ═══════════════════════════════════════════');
  console.log('[COVERAGE_BENEFITS_MAPPER] Starting ReAct Agent with file metadata');
  console.log('[COVERAGE_BENEFITS_MAPPER] Available tools:');
  console.log('[COVERAGE_BENEFITS_MAPPER]   • search_aggregated_data - Search for specific terms in aggregated file by domain');
  console.log('[COVERAGE_BENEFITS_MAPPER]   • submit_coverage_benefits_data - Submit final JSON result (REQUIRED)');
  console.log('[COVERAGE_BENEFITS_MAPPER] ═══════════════════════════════════════════\n');

  const agentResult = await agent.invoke({
    messages: [new HumanMessage(agentPrompt)]
  });
  
  console.log('[COVERAGE_BENEFITS_MAPPER] ═══════════════════════════════════════════');
  console.log('[COVERAGE_BENEFITS_MAPPER] Agent execution trace:');
  console.log('[COVERAGE_BENEFITS_MAPPER] ═══════════════════════════════════════════');
  
  for (let i = 0; i < agentResult.messages.length; i++) {
    const msg = agentResult.messages[i];
    const role = msg._getType?.() || msg.constructor?.name?.replace('Message', '').toLowerCase() || 'unknown';
    
    if (role === 'ai') {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      const aiMsg = msg as AIMessage;
      
      if (aiMsg.tool_calls && aiMsg.tool_calls.length > 0) {
        for (const toolCall of aiMsg.tool_calls) {
          console.log(`\n[COVERAGE_BENEFITS_MAPPER] 🔧 Tool Call #${i}:`);
          console.log(`[COVERAGE_BENEFITS_MAPPER]    Tool: ${toolCall.name}`);
          console.log(`[COVERAGE_BENEFITS_MAPPER]    Args: ${JSON.stringify(toolCall.args, null, 2).replace(/\n/g, '\n[COVERAGE_BENEFITS_MAPPER]          ')}`);
        }
      } else {
        console.log(`\n[COVERAGE_BENEFITS_MAPPER] 💭 Agent Reasoning #${i}:`);
        console.log(`[COVERAGE_BENEFITS_MAPPER]    ${content.substring(0, 500).replace(/\n/g, '\n[COVERAGE_BENEFITS_MAPPER]    ')}`);
      }
    } else if (role === 'tool') {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      console.log(`\n[COVERAGE_BENEFITS_MAPPER] ✅ Tool Result #${i}:`);
      console.log(`[COVERAGE_BENEFITS_MAPPER]    ${content.substring(0, 300).replace(/\n/g, '\n[COVERAGE_BENEFITS_MAPPER]    ')}`);
    }
  }
  
  const finalMessage = agentResult.messages[agentResult.messages.length - 1];
  const agentResponse = typeof finalMessage.content === 'string' ? finalMessage.content : JSON.stringify(finalMessage.content);
  
  console.log('\n[COVERAGE_BENEFITS_MAPPER] ═══════════════════════════════════════════');
  console.log('[COVERAGE_BENEFITS_MAPPER] 🎯 Final Agent Response:');
  console.log('[COVERAGE_BENEFITS_MAPPER] ═══════════════════════════════════════════');
  console.log(agentResponse);
  console.log('[COVERAGE_BENEFITS_MAPPER] ═══════════════════════════════════════════\n');
  
  const { result, metadata } = extractSubmittedCoverageBenefitsData(agentResult.messages);
  
  // Save extraction metadata if available
  if (metadata) {
    try {
      await saveExtractionMetadata(metadata, patientApiDataFolder);
      console.log('[COVERAGE_BENEFITS_MAPPER] ✅ Saved extraction metadata');
    } catch (error) {
      console.error('[COVERAGE_BENEFITS_MAPPER] ❌ Failed to save extraction metadata:', error);
    }
  }
  
  console.log('[COVERAGE_BENEFITS_MAPPER] Extraction complete:', {
    confidence: result.confidence,
    fieldsFound: Object.keys(result.foundPaths || {}).length
  });

  logNodeExecution('coverage_and_benefits_mapper', result.confidence > 0.8 ? 'deterministic' : 'llm_based', result.confidence, {
    inputs: { source: 'postgresql_semantic_search' },
    outputs: {
      preventiveCoverage: result.preventiveCoverage,
      basicCoverage: result.basicCoverage,
      majorCoverage: result.majorCoverage,
      yearlyMaximum: result.yearlyMaximum
    }
  });

  return {
    messages: [
      new AIMessage(`Coverage & Benefits extracted (confidence: ${(result.confidence * 100).toFixed(0)}%):\n` +
        `- Preventive: ${result.preventiveCoverage || 'N/A'}\n` +
        `- Basic: ${result.basicCoverage || 'N/A'}\n` +
        `- Major: ${result.majorCoverage || 'N/A'}\n` +
        `- Yearly Max: ${result.yearlyMaximum || 'N/A'}\n` +
        `- Max Used: ${result.yearlyMaximumUsed || 'N/A'}\n` +
        `- Deductible: ${result.yearlyDeductible || 'N/A'}\n` +
        `- Ded Used: ${result.yearlyDeductibleUsed || 'N/A'}\n` +
        `- Dependent Age: ${result.dependentCoverageAge || 'N/A'}\n` +
        `- Missing Tooth Clause: ${result.missingToothClause === true ? 'Yes' : result.missingToothClause === false ? 'No' : 'N/A'}`
      )
    ],
    verificationResult: {
      ...state.verificationResult,
      preventive_coverage: result.preventiveCoverage || state.verificationResult?.preventive_coverage,
      basic_coverage: result.basicCoverage || state.verificationResult?.basic_coverage,
      major_coverage: result.majorCoverage || state.verificationResult?.major_coverage,
      yearly_maximum: result.yearlyMaximum || state.verificationResult?.yearly_maximum,
      yearly_maximum_used: result.yearlyMaximumUsed || state.verificationResult?.yearly_maximum_used,
      yearly_deductible: result.yearlyDeductible || state.verificationResult?.yearly_deductible,
      yearly_deductible_used: result.yearlyDeductibleUsed || state.verificationResult?.yearly_deductible_used,
      dependent_coverage_age: result.dependentCoverageAge || state.verificationResult?.dependent_coverage_age,
      missing_tooth_clause: result.missingToothClause || state.verificationResult?.missing_tooth_clause,
    },
    confidenceScores: {
      ...state.confidenceScores,
      coverageBenefitsInfo: {
        confidence: result.confidence,
        source: 'llm_extraction',
        timestamp: new Date().toISOString()
      }
    }
  };
}

function extractSubmittedCoverageBenefitsData(messages: any[]): { result: CoverageAndBenefitsResult; metadata: MapperMetadata | null } {
  let submittedData: any = null;
  let extractionMetadata: any = null;
  let avgConfidence: number | null = null;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];

    if (msg._getType?.() === 'tool' || msg.constructor?.name === 'ToolMessage') {
      try {
        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        const parsed = JSON.parse(content);

        if (parsed.coverageBenefitsData) {
          submittedData = parsed.coverageBenefitsData;
          extractionMetadata = parsed.extractionMetadata;
          avgConfidence = parsed.avgConfidence ?? null;
          break;
        }
      } catch (err) {
      }
    }
  }

  if (!submittedData) {
    console.warn('[COVERAGE_BENEFITS_MAPPER] No submit_coverage_benefits_data tool call found - agent did not submit results properly');
    return {
      result: {
        preventiveCoverage: null,
        basicCoverage: null,
        majorCoverage: null,
        yearlyMaximum: null,
        yearlyMaximumUsed: null,
        yearlyDeductible: null,
        yearlyDeductibleUsed: null,
        dependentCoverageAge: null,
        missingToothClause: null,
        confidence: 0,
        reasoning: "Agent failed to submit structured data via submit_coverage_benefits_data tool"
      },
      metadata: null
    };
  }

  const fieldsFound = Object.values(submittedData).filter(v => v !== null && v !== undefined).length;
  // Use avgConfidence from tool if available, otherwise fall back to deterministic
  const confidence = avgConfidence ?? (fieldsFound / 9);

  const metadata: MapperMetadata | null = extractionMetadata ? {
    mapperName: 'coverage_and_benefits_mapper',
    timestamp: new Date().toISOString(),
    confidence,
    fields: extractionMetadata,
    stats: {
      totalFields: 9,
      fieldsExtracted: fieldsFound,
      fieldsEmpty: 9 - fieldsFound,
      avgConfidence: confidence
    }
  } : null;

  return {
    result: {
      preventiveCoverage: submittedData.preventiveCoverage || null,
      basicCoverage: submittedData.basicCoverage || null,
      majorCoverage: submittedData.majorCoverage || null,
      yearlyMaximum: submittedData.yearlyMaximum || null,
      yearlyMaximumUsed: submittedData.yearlyMaximumUsed || null,
      yearlyDeductible: submittedData.yearlyDeductible || null,
      yearlyDeductibleUsed: submittedData.yearlyDeductibleUsed || null,
      dependentCoverageAge: submittedData.dependentCoverageAge || null,
      missingToothClause: submittedData.missingToothClause || null,
      confidence,
      reasoning: `Extracted ${fieldsFound}/9 fields via submit_coverage_benefits_data tool (avg confidence: ${(confidence * 100).toFixed(0)}%)`
    },
    metadata
  };
}
