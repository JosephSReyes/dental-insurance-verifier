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

export interface InsuranceInfoResult {
  insuranceCompany: string | null;
  groupPlanName: string | null;
  claimsAddress: string | null;
  insurancePhone: string | null;
  payorId: string | null;
  networkStatus: string | null;
  feeSchedule: string | null;
  benefitPeriod: string | null;
  effectiveDate: string | null;
  terminationDate: string | null;
  confidence: number;
  sourceFile?: string;
  foundPaths?: Record<string, string>;
  reasoning?: string;
}

export async function insuranceInfoMapperNode(
  state: WorkflowStateType,
  config: RunnableConfig,
): Promise<Partial<WorkflowStateType>> {
  console.log('[INSURANCE_INFO_MAPPER] Starting insurance info extraction using PostgreSQL semantic search');

  const patientApiDataFolder = state.patientApiDataFolder;
  if (!patientApiDataFolder) {
    throw new Error('Patient API data folder not set in state');
  }

  console.log(`[INSURANCE_INFO_MAPPER] Patient session: ${patientApiDataFolder}`);
  console.log(`[INSURANCE_INFO_MAPPER] NEW FLOW: Querying PostgreSQL semantic search instead of reading JSON files`);
  
  const configuration = ensureAgentConfiguration(config);
  const model = await loadChatModel(configuration.model);
  
  const { postgresSemanticSearchTool } = await import("../shared/postgres-semantic-search.js");
  const { submitInsuranceDataTool } = await import("./insurance-info-mapper-tools.js");

  const tools = [postgresSemanticSearchTool, submitInsuranceDataTool];
  
  const agent = createReactAgent({ 
    llm: model, 
    tools,
    messageModifier: "You are a helpful assistant that extracts insurance information. After searching for data, you MUST call submit_insurance_data to finalize your extraction."
  });
  
  let relevantFeedback = [];
  try {
    const provider = state.extractedInfo?.insurance_provider || 'Unknown';
    const officeKey = state.officeKey || state.extractedInfo?.office_key;
    // Prefer portal version over portal type for maximum precision
    const portalVersion = state.portalVersion || state.extractedInfo?.portal_version;
    const portalType = portalVersion || state.portalType || state.extractedInfo?.portal_type;

    relevantFeedback = await getRelevantFeedback({
      mapper: 'insurance_info_mapper',
      provider,
      field: 'all',
      currentContext: `Extracting insurance info from ${provider}`,
      limit: 5,
      officeId: officeKey,
      portalType: portalType,  // Now contains version if available
    });
    if (relevantFeedback.length > 0) {
      console.log(`[INSURANCE_INFO_MAPPER] 📚 Retrieved ${relevantFeedback.length} relevant past corrections from RAG (Office: ${officeKey || 'N/A'}, Portal: ${portalType || 'N/A'})`);
    }
  } catch (error) {
    console.error('[INSURANCE_INFO_MAPPER] ⚠️ Failed to retrieve feedback from RAG (continuing without):', error);
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
  
  const agentPrompt = `You are an insurance information extraction specialist. Your task is to extract insurance data from unknown JSON file structures and map them to our standard schema.${feedbackSection}

**TARGET SCHEMA (fields you need to populate):**
- insuranceCompany: The insurance carrier name (e.g., "Blue Cross Blue Shield Of Texas", "Delta Dental")
- groupPlanName: The specific plan name (e.g., "DENTAL - Blue Dental - Preferred Provider Organization (PPO)")
- claimsAddress: Where to send claims (e.g., "See insurance card for claims address", "P.O. Box 2105, Mechanicsburg, PA 17055")
- insurancePhone: Customer service phone number (e.g., "1-800-BCBSTX1")
- payorId: Electronic payor ID for claims submission (e.g., "Contact BCBS for Payor ID", "23166")
- networkStatus: Network type (e.g., "PPO Network", "HMO", "PPO Plus Premier")
- feeSchedule: Fee schedule type (e.g., "PPO", "UCR")
- benefitPeriod: When benefits renew (e.g., "Calendar Year", "Policy Year")
- effectiveDate: When coverage starts (YYYY-MM-DD format)
- terminationDate: When coverage ends (YYYY-MM-DD format, "9999-12-31" means ongoing)

**CONFIDENCE SCALE (0.0-1.0):**
• 0.9-1.0: Perfect match in expected location, standard format, zero ambiguity
• 0.7-0.9: Good match, minor format variations or combined fields
• 0.5-0.7: Moderate uncertainty, non-standard location or format
• 0.3-0.5: Low confidence, significant ambiguity or inference required
• 0.0-0.3: Very uncertain, guessing or likely incorrect

**Your Strategy:**

1. **Use postgres_semantic_search to find insurance fields:**
   - Call postgres_semantic_search multiple times with targeted natural language queries:

     Query: "insurance company name and carrier name"
     - patientName: "${patientApiDataFolder}"
     - limit: 5

     Query: "group plan name and employer group name"
     - patientName: "${patientApiDataFolder}"
     - limit: 5

     Query: "claims mailing address and claims submission address"
     - patientName: "${patientApiDataFolder}"
     - limit: 5

     Query: "insurance phone number and customer service phone"
     - patientName: "${patientApiDataFolder}"
     - limit: 5

     Query: "payor ID and electronic payer ID"
     - patientName: "${patientApiDataFolder}"
     - limit: 5

     Query: "network status PPO HMO plan type"
     - patientName: "${patientApiDataFolder}"
     - limit: 5

     Query: "effective date and termination date coverage dates"
     - patientName: "${patientApiDataFolder}"
     - limit: 5

2. **Analyze the search results:**
   - **insuranceCompany:** Look for "company", "carrier" fields - extract company name
   - **groupPlanName:** Look for "groupName" field - this is the employer/group name
   - **CRITICAL - networkStatus:** Look for "planName" field which contains text like "DENTAL - Blue Dental - Preferred Provider Organization (PPO)"
     * Extract the plan type abbreviation: PPO, HMO, DHMO, Premier, etc.
     * Look for text in parentheses like "(PPO)" or keywords like "Preferred Provider Organization"
     * Common plan types: PPO, HMO, DHMO, EPO, POS, Premier, Plus
   - **claimsAddress:** Look for "address", "city", "state", "zip" - combine into one string
   - **insurancePhone:** Look for "phone", "contact" fields
   - **payorId:** Look for "payor", "payer", "claimPayerId" fields
   - **effectiveDate/terminationDate:** Look for "effective", "termination" date fields
   - Pay attention to path prefixes (plan., coverage., etc.) to understand context

3. **Combine fields intelligently:**
   - Claims address: Combine "address" + "city" + "state" + "zipCode" into one string
   - Dates: Convert from MM/DD/YYYY to YYYY-MM-DD format
   - **networkStatus:** Extract the plan type (PPO, HMO, etc.) from product/planType fields - this field is REQUIRED

4. **When to submit:**
   - After exploring available files, call submit_insurance_data with:
     * All found fields (omit nulls)
     * Confidence level (0.0-1.0) for EACH field
     * Search terms used to locate each field
     * JSON path where each field was found
     * Reasoning explaining WHY each value is correct
   - **IMPORTANT:** If a field is not found, simply OMIT it from the submit call
   - Do NOT loop forever searching for missing data
   - The tool will accept partial data

**CRITICAL: You MUST call submit_insurance_data after exploring the available files. Do NOT just provide text output. The system needs structured JSON data.**

**Your goal:** Extract as many insurance fields as possible and submit them via submit_insurance_data tool (even if some are null).`;

  console.log('[INSURANCE_INFO_MAPPER] ═══════════════════════════════════════════');
  console.log('[INSURANCE_INFO_MAPPER] Starting ReAct Agent with file metadata');
  console.log('[INSURANCE_INFO_MAPPER] Office:', state.extractedInfo?.office_name || 'Unknown');
  console.log('[INSURANCE_INFO_MAPPER] Provider:', state.extractedInfo?.insurance_provider || 'Unknown');
  console.log('[INSURANCE_INFO_MAPPER] Available tools:');
  console.log('[INSURANCE_INFO_MAPPER]   • search_insurance_fields - Search for specific terms across all files');
  console.log('[INSURANCE_INFO_MAPPER]   • check_network_status - Check if office is in-network (REQUIRED)');
  console.log('[INSURANCE_INFO_MAPPER]   • submit_insurance_data - Submit final JSON result (REQUIRED)');
  console.log('[INSURANCE_INFO_MAPPER] ═══════════════════════════════════════════\n');

  let agentResult;
  try {
    agentResult = await agent.invoke(
      {
        messages: [new HumanMessage(agentPrompt)]
      },
      {
        recursionLimit: 25  // Increased from 10 to allow more tool calls
      }
    );
  } catch (err: any) {
    console.warn('[INSURANCE_INFO_MAPPER] Agent stopped (possibly hit recursion limit):', err.message);
    agentResult = { messages: [] };
  }
  
  console.log('[INSURANCE_INFO_MAPPER] ═══════════════════════════════════════════');
  console.log('[INSURANCE_INFO_MAPPER] Agent execution trace:');
  console.log('[INSURANCE_INFO_MAPPER] ═══════════════════════════════════════════');
  
  for (let i = 0; i < agentResult.messages.length; i++) {
    const msg = agentResult.messages[i];
    const role = msg._getType?.() || msg.constructor?.name?.replace('Message', '').toLowerCase() || 'unknown';
    
    if (role === 'ai') {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const toolCall of msg.tool_calls) {
          console.log(`\n[INSURANCE_INFO_MAPPER] 🔧 Tool Call #${i}:`);
          console.log(`[INSURANCE_INFO_MAPPER]    Tool: ${toolCall.name}`);
          console.log(`[INSURANCE_INFO_MAPPER]    Args: ${JSON.stringify(toolCall.args, null, 2).replace(/\n/g, '\n[INSURANCE_INFO_MAPPER]          ')}`);
        }
      } else {
        console.log(`\n[INSURANCE_INFO_MAPPER] 💭 Agent Reasoning #${i}:`);
        console.log(`[INSURANCE_INFO_MAPPER]    ${content.substring(0, 500).replace(/\n/g, '\n[INSURANCE_INFO_MAPPER]    ')}`);
      }
    } else if (role === 'tool') {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      console.log(`\n[INSURANCE_INFO_MAPPER] ✅ Tool Result #${i}:`);
      console.log(`[INSURANCE_INFO_MAPPER]    ${content.substring(0, 300).replace(/\n/g, '\n[INSURANCE_INFO_MAPPER]    ')}`);
    }
  }
  
  const finalMessage = agentResult.messages[agentResult.messages.length - 1];
  const agentResponse = finalMessage ? (typeof finalMessage.content === 'string' ? finalMessage.content : JSON.stringify(finalMessage.content)) : 'No response';
  
  console.log('\n[INSURANCE_INFO_MAPPER] ═══════════════════════════════════════════');
  console.log('[INSURANCE_INFO_MAPPER] 🎯 Final Agent Response:');
  console.log('[INSURANCE_INFO_MAPPER] ═══════════════════════════════════════════');
  console.log(agentResponse);
  console.log('[INSURANCE_INFO_MAPPER] ═══════════════════════════════════════════\n');
  
  const { result, metadata } = extractSubmittedInsuranceData(agentResult.messages);

  // Save extraction metadata if available
  if (metadata) {
    try {
      await saveExtractionMetadata(metadata, patientApiDataFolder);
      console.log('[INSURANCE_INFO_MAPPER] ✅ Saved extraction metadata');
    } catch (error) {
      console.error('[INSURANCE_INFO_MAPPER] ❌ Failed to save extraction metadata:', error);
    }
  }
  
  let finalResult = result;
  
  if (finalResult.confidence === 0) {
    console.log('[INSURANCE_INFO_MAPPER] ⚠ Agent did not submit data - extracting deterministically as fallback');
    finalResult = await extractInsuranceDataDeterministically(patientApiDataFolder, agentResult.messages);
  }
  
  console.log('[INSURANCE_INFO_MAPPER] Extraction complete:', {
    confidence: finalResult.confidence,
    fieldsFound: Object.keys(finalResult.foundPaths || {}).length
  });

  // Determine network status by comparing patient plan against office contracted plans
  if (state.office && finalResult.networkStatus) {
    console.log('[INSURANCE_INFO_MAPPER] Determining network status');
    console.log(`[INSURANCE_INFO_MAPPER] Office: ${state.office.name}`);
    console.log(`[INSURANCE_INFO_MAPPER] Patient Plan Type: ${finalResult.networkStatus}`);
    
    const extractedPlanType = finalResult.networkStatus.toUpperCase();
    const contractedPlansList = state.office.contractedPlans.split(',').map(p => p.trim().toUpperCase());
    
    console.log(`[INSURANCE_INFO_MAPPER] Office Contracted Plans: [${contractedPlansList.join(', ')}]`);
    
    const isInNetwork = contractedPlansList.some(plan => extractedPlanType.includes(plan));
    
    if (isInNetwork) {
      finalResult.networkStatus = `${finalResult.networkStatus} (In-Network)`;
      console.log(`[INSURANCE_INFO_MAPPER] ✅ In-Network`);
    } else {
      finalResult.networkStatus = `${finalResult.networkStatus} (Out-of-Network)`;
      console.log(`[INSURANCE_INFO_MAPPER] ❌ Out-of-Network`);
    }
  }

  logNodeExecution('insurance_info_mapper', finalResult.confidence > 0.8 ? 'deterministic' : 'llm_based', finalResult.confidence, {
    inputs: { source: 'postgresql_semantic_search' },
    outputs: {
      insuranceCompany: finalResult.insuranceCompany,
      groupPlanName: finalResult.groupPlanName,
      networkStatus: finalResult.networkStatus
    }
  });

  return {
    messages: [
      new AIMessage(`Insurance info extracted (confidence: ${(finalResult.confidence * 100).toFixed(0)}%):\n` +
        `- Company: ${finalResult.insuranceCompany || 'N/A'}\n` +
        `- Plan: ${finalResult.groupPlanName || 'N/A'}\n` +
        `- Network: ${finalResult.networkStatus || 'N/A'}\n` +
        `- Claims: ${finalResult.claimsAddress || 'N/A'}\n` +
        `- Phone: ${finalResult.insurancePhone || 'N/A'}\n` +
        `- Payor ID: ${finalResult.payorId || 'N/A'}\n` +
        `- Effective: ${finalResult.effectiveDate || 'N/A'} to ${finalResult.terminationDate || 'N/A'}`
      )
    ],
    verificationResult: {
      ...state.verificationResult,
      insurance_company: finalResult.insuranceCompany || state.verificationResult?.insurance_company,
      group_plan_name: finalResult.groupPlanName || state.verificationResult?.group_plan_name,
      plan_name: finalResult.groupPlanName || state.verificationResult?.plan_name,
      claims_address: finalResult.claimsAddress || state.verificationResult?.claims_address,
      insurance_phone: finalResult.insurancePhone || state.verificationResult?.insurance_phone,
      payor_id: finalResult.payorId || state.verificationResult?.payor_id,
      network_status: finalResult.networkStatus || state.verificationResult?.network_status,
      fee_schedule: finalResult.feeSchedule || state.verificationResult?.fee_schedule,
      benefit_period: finalResult.benefitPeriod || state.verificationResult?.benefit_period,
      effective_date: finalResult.effectiveDate || state.verificationResult?.effective_date,
      termination_date: finalResult.terminationDate || state.verificationResult?.termination_date,
    },
    confidenceScores: {
      ...state.confidenceScores,
      insuranceInfo: {
        confidence: finalResult.confidence,
        source: finalResult.reasoning?.includes('deterministic fallback') ? 'deterministic' : 'llm_extraction',
        timestamp: new Date().toISOString()
      }
    }
  };
}

function extractSubmittedInsuranceData(messages: any[]): { result: InsuranceInfoResult; metadata: MapperMetadata | null } {
  let submittedData: any = null;
  let extractionMetadata: any = null;
  let avgConfidence: number | null = null;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];

    if (msg._getType?.() === 'tool' || msg.constructor?.name === 'ToolMessage') {
      try {
        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        const parsed = JSON.parse(content);

        if (parsed.insuranceData) {
          submittedData = parsed.insuranceData;
          extractionMetadata = parsed.extractionMetadata;
          avgConfidence = parsed.avgConfidence ?? null;
          break;
        }
      } catch (err) {
      }
    }
  }

  if (!submittedData) {
    console.warn('[INSURANCE_INFO_MAPPER] No submit_insurance_data tool call found - agent did not submit results properly');
    return {
      result: {
        insuranceCompany: null,
        groupPlanName: null,
        claimsAddress: null,
        insurancePhone: null,
        payorId: null,
        networkStatus: null,
        feeSchedule: null,
        benefitPeriod: null,
        effectiveDate: null,
        terminationDate: null,
        confidence: 0,
        reasoning: "Agent failed to submit structured data via submit_insurance_data tool"
      },
      metadata: null
    };
  }

  const fieldsFound = Object.values(submittedData).filter(v => v !== null && v !== undefined).length;
  // Use avgConfidence from tool if available, otherwise fall back to deterministic
  const confidence = avgConfidence ?? (fieldsFound / 10);

  const metadata: MapperMetadata | null = extractionMetadata ? {
    mapperName: 'insurance_info_mapper',
    timestamp: new Date().toISOString(),
    confidence,
    fields: extractionMetadata,
    stats: {
      totalFields: 10,
      fieldsExtracted: fieldsFound,
      fieldsEmpty: 10 - fieldsFound,
      avgConfidence: confidence
    }
  } : null;

  return {
    result: {
      insuranceCompany: submittedData.insuranceCompany || null,
      groupPlanName: submittedData.groupPlanName || null,
      claimsAddress: submittedData.claimsAddress || null,
      insurancePhone: submittedData.insurancePhone || null,
      payorId: submittedData.payorId || null,
      networkStatus: submittedData.networkStatus || null,
      feeSchedule: submittedData.feeSchedule || null,
      benefitPeriod: submittedData.benefitPeriod || null,
      effectiveDate: submittedData.effectiveDate || null,
      terminationDate: submittedData.terminationDate || null,
      confidence,
      reasoning: `Extracted ${fieldsFound}/10 fields via submit_insurance_data tool`
    },
    metadata
  };
}

async function extractInsuranceDataDeterministically(
  folderPath: string,
  agentMessages: any[]
): Promise<InsuranceInfoResult> {
  console.log('[INSURANCE_INFO_MAPPER] Running deterministic extraction fallback from PostgreSQL search results');

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

  const extractedData: any = {
    insuranceCompany: null,
    groupPlanName: null,
    claimsAddress: null,
    insurancePhone: null,
    payorId: null,
    networkStatus: null,
    feeSchedule: null,
    benefitPeriod: null,
    effectiveDate: null,
    terminationDate: null
  };

  // Extract data from semantic search results
  for (const result of searchResults) {
    const text = result.text?.toLowerCase() || '';
    const chunkText = result.text || '';

    if (!extractedData.insuranceCompany && (text.includes('insurance company') || text.includes('carrier'))) {
      const match = chunkText.match(/(?:insurance\s+company|carrier)[:\s]+([A-Z][A-Za-z\s&]+)/i);
      if (match) extractedData.insuranceCompany = match[1].trim();
    }

    if (!extractedData.groupPlanName && text.includes('group')) {
      const match = chunkText.match(/group\s+(?:plan\s+)?name[:\s]+([A-Z][A-Za-z\s-]+)/i);
      if (match) extractedData.groupPlanName = match[1].trim();
    }

    if (!extractedData.claimsAddress && text.includes('claims') && text.includes('address')) {
      const match = chunkText.match(/claims\s+address[:\s]+([A-Z0-9][^\n]+)/i);
      if (match) extractedData.claimsAddress = match[1].trim();
    }

    if (!extractedData.insurancePhone && text.includes('phone')) {
      const match = chunkText.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
      if (match) extractedData.insurancePhone = match[0];
    }

    if (!extractedData.payorId && (text.includes('payor') || text.includes('payer'))) {
      const match = chunkText.match(/(?:payor|payer)\s+id[:\s]+([A-Z0-9]+)/i);
      if (match) extractedData.payorId = match[1];
    }

    if (!extractedData.networkStatus && (text.includes('ppo') || text.includes('hmo') || text.includes('plan type'))) {
      if (text.includes('ppo')) extractedData.networkStatus = 'PPO';
      else if (text.includes('hmo')) extractedData.networkStatus = 'HMO';
      else if (text.includes('dhmo')) extractedData.networkStatus = 'DHMO';
    }

    if (!extractedData.effectiveDate && text.includes('effective')) {
      const match = chunkText.match(/(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})/);
      if (match) extractedData.effectiveDate = match[1];
    }

    if (!extractedData.terminationDate && text.includes('termination')) {
      const match = chunkText.match(/(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})/);
      if (match) extractedData.terminationDate = match[1];
    }
  }

  const fieldsFound = Object.values(extractedData).filter(v => v !== null).length;

  console.log(`[INSURANCE_INFO_MAPPER] Deterministic extraction found ${fieldsFound}/10 fields from ${searchResults.length} search results`);

  return {
    ...extractedData,
    confidence: fieldsFound / 10,
    reasoning: `Extracted ${fieldsFound}/10 fields via deterministic fallback from PostgreSQL semantic search results`
  };
}
