import { loadChatModel } from "../shared/utils.js";
import { RunnableConfig } from "@langchain/core/runnables";
import { logNodeExecution } from "../shared/logging.js";
import { ensureAgentConfiguration } from "./configuration.js";
import type { WorkflowStateType } from "../shared/workflow-state.js";
import { AIMessage } from "@langchain/core/messages";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { getProcedureContextTool } from "../shared/procedure-context-tool.js";
import { saveExtractionMetadata, type MapperMetadata } from "../shared/metadata-utils.js";
import { getRelevantFeedback } from "../shared/feedback-rag.js";

export interface ProcedureDetail {
  code: string;
  description?: string;
  category?: string;
  coverage_percent?: number;
  network_used?: string;
  deductible_applies?: boolean;
  maximum_applies?: boolean;
  frequency_limitation?: string | null;
  frequency_shared_codes?: string | null;
  age_limitation?: string | null;
  waiting_period?: string | null;
  pre_auth_required?: boolean;
  limitations?: string[];
  status?: string;
  processed: boolean;
  extraction_reasoning?: string;
  source_path?: string;
  extraction_confidence?: number;
}

export interface ProcedureDetailsResult {
  procedureDetails: Array<ProcedureDetail>;
  confidence: number;
  sourceFile?: string;
  reasoning?: string;
}

// Concurrency limit for parallel processing - adjust this value to control how many
// procedures are processed simultaneously. Recommended: 5-10 for optimal performance.
const CONCURRENCY_LIMIT = 5;

export async function procedureDetailsMapperNode(
  state: WorkflowStateType,
  config: RunnableConfig,
): Promise<Partial<WorkflowStateType>> {
  console.log('[PROCEDURE_DETAILS_MAPPER] Starting PARALLEL procedure details extraction using PostgreSQL semantic search');

  const patientApiDataFolder = state.patientApiDataFolder;
  if (!patientApiDataFolder) {
    throw new Error('Patient API data folder not set in state');
  }

  if (!state.procedureCodes || state.procedureCodes.length === 0) {
    console.warn('[PROCEDURE_DETAILS_MAPPER] No procedure codes found in state - was aggregate_api_data run?');
    return {
      messages: [
        new AIMessage('No procedure codes found to process. Skipping procedure details mapping.')
      ],
      confidenceScores: {
        ...state.confidenceScores,
        procedureDetailsInfo: {
          confidence: 0,
          source: 'parallel' as const,
          timestamp: new Date().toISOString()
        }
      }
    };
  }

  console.log(`[PROCEDURE_DETAILS_MAPPER] Patient session: ${patientApiDataFolder}`);
  console.log(`[PROCEDURE_DETAILS_MAPPER] Master list contains ${state.procedureCodes.length} procedure codes`);

  console.log('[PROCEDURE_DETAILS_MAPPER] ═══════════════════════════════════════════');
  console.log('[PROCEDURE_DETAILS_MAPPER] PARALLEL PROCESSING MODE (PostgreSQL)');
  console.log('[PROCEDURE_DETAILS_MAPPER] ═══════════════════════════════════════════');
  console.log(`[PROCEDURE_DETAILS_MAPPER] Total codes to process: ${state.procedureCodes.length}`);
  console.log(`[PROCEDURE_DETAILS_MAPPER] Concurrency limit: ${CONCURRENCY_LIMIT} procedures at a time`);
  console.log('[PROCEDURE_DETAILS_MAPPER] Querying PostgreSQL semantic search for each procedure');
  console.log('[PROCEDURE_DETAILS_MAPPER] ═══════════════════════════════════════════\n');

  const configuration = ensureAgentConfiguration(config);
  const model = await loadChatModel(configuration.model);

  const allProcedureDetails: ProcedureDetail[] = [];
  const totalCodes = state.procedureCodes.length;
  let completedCount = 0;

  // Process procedures in batches with concurrency limit
  const batchSize = CONCURRENCY_LIMIT;
  for (let batchStart = 0; batchStart < totalCodes; batchStart += batchSize) {
    const batchEnd = Math.min(batchStart + batchSize, totalCodes);
    const batch = state.procedureCodes.slice(batchStart, batchEnd);
    const batchNumber = Math.floor(batchStart / batchSize) + 1;
    const totalBatches = Math.ceil(totalCodes / batchSize);

    console.log(`\n[PROCEDURE_DETAILS_MAPPER] ────────────────────────────────────────────`);
    console.log(`[PROCEDURE_DETAILS_MAPPER] Batch ${batchNumber}/${totalBatches} starting: ${batch.map(c => c.code).join(', ')}`);
    console.log(`[PROCEDURE_DETAILS_MAPPER] Processing ${batch.length} codes concurrently...`);
    console.log(`[PROCEDURE_DETAILS_MAPPER] ────────────────────────────────────────────`);

    // Create promises for concurrent processing
    const batchPromises = batch.map((codeEntry, batchIndex) => {
      const globalIndex = batchStart + batchIndex;
      // Prefer portal version over portal type for maximum precision
      const portalVersion = state.portalVersion || state.extractedInfo?.portal_version;
      const portalType = portalVersion || state.portalType || state.extractedInfo?.portal_type;

      return processSingleProcedure(
        codeEntry.code,
        patientApiDataFolder,
        model,
        state.extractedInfo?.insurance_provider,
        state.officeKey || state.extractedInfo?.office_key,
        portalType  // Now contains version if available
      ).then(result => {
        completedCount++;
        const percentage = ((completedCount / totalCodes) * 100).toFixed(1);
        console.log(`[PROCEDURE_DETAILS_MAPPER] Progress: ${completedCount}/${totalCodes} codes completed (${percentage}%) - ${codeEntry.code}`);
        return { result, code: codeEntry.code, index: globalIndex };
      }).catch(error => {
        completedCount++;
        const percentage = ((completedCount / totalCodes) * 100).toFixed(1);
        console.error(`[PROCEDURE_DETAILS_MAPPER] ✗ Error processing ${codeEntry.code}:`, error);
        console.log(`[PROCEDURE_DETAILS_MAPPER] Progress: ${completedCount}/${totalCodes} codes completed (${percentage}%) - ${codeEntry.code} FAILED`);
        return { result: null, code: codeEntry.code, index: globalIndex };
      });
    });

    // Wait for all promises in this batch to settle
    const batchResults = await Promise.allSettled(batchPromises);

    // Process results from this batch
    batchResults.forEach((settledResult, idx) => {
      const code = batch[idx].code;

      if (settledResult.status === 'fulfilled') {
        const { result } = settledResult.value;
        if (result) {
          allProcedureDetails.push(result);
          console.log(`[PROCEDURE_DETAILS_MAPPER] ✓ ${code} extracted: ${result.description || 'N/A'}`);
        } else {
          console.log(`[PROCEDURE_DETAILS_MAPPER] ✗ ${code} failed to extract (returned null)`);
        }
      } else {
        console.error(`[PROCEDURE_DETAILS_MAPPER] ✗ ${code} promise rejected:`, settledResult.reason);
      }
    });

    console.log(`[PROCEDURE_DETAILS_MAPPER] Batch ${batchNumber}/${totalBatches} complete\n`);
  }

  console.log('\n[PROCEDURE_DETAILS_MAPPER] ═══════════════════════════════════════════');
  console.log('[PROCEDURE_DETAILS_MAPPER] PARALLEL PROCESSING COMPLETE');
  console.log('[PROCEDURE_DETAILS_MAPPER] ═══════════════════════════════════════════');
  console.log(`[PROCEDURE_DETAILS_MAPPER] Total Processed: ${allProcedureDetails.length}/${totalCodes} codes`);
  console.log(`[PROCEDURE_DETAILS_MAPPER] Success Rate: ${((allProcedureDetails.length / totalCodes) * 100).toFixed(1)}%`);
  console.log('[PROCEDURE_DETAILS_MAPPER] ═══════════════════════════════════════════\n');
  
  const result: ProcedureDetailsResult = {
    procedureDetails: allProcedureDetails,
    confidence: calculateConfidence(allProcedureDetails),
    reasoning: `Processed ${allProcedureDetails.length}/${totalCodes} procedures in parallel (${CONCURRENCY_LIMIT} concurrent) with full context reconstruction`
  };

  // Save extraction metadata with per-procedure reasoning
  const procedureFieldsMetadata: Record<string, any> = {
    procedureDetails: {
      value: allProcedureDetails.length,
      sourcePath: 'aggregated_procedure_data',
      reasoning: `Extracted ${allProcedureDetails.length} of ${totalCodes} requested procedures with ${((allProcedureDetails.length / totalCodes) * 100).toFixed(1)}% success rate`
    }
  };

  // Add individual procedure reasoning
  allProcedureDetails.forEach((proc, idx) => {
    procedureFieldsMetadata[`procedure_${proc.code}`] = {
      value: proc,
      sourcePath: proc.source_path || 'aggregated_procedure_data',
      reasoning: proc.extraction_reasoning || `Extracted procedure ${proc.code}: ${proc.description}`,
      confidence: proc.extraction_confidence || 0.8
    };
  });

  const metadata: MapperMetadata = {
    mapperName: 'procedure_details_mapper',
    timestamp: new Date().toISOString(),
    confidence: result.confidence,
    fields: procedureFieldsMetadata
  };

  try {
    await saveExtractionMetadata(metadata, patientApiDataFolder);
    console.log('[PROCEDURE_DETAILS_MAPPER] ✅ Saved extraction metadata');
  } catch (error) {
    console.error('[PROCEDURE_DETAILS_MAPPER] ❌ Failed to save extraction metadata:', error);
  }

  logNodeExecution('procedure_details_mapper', 'parallel', result.confidence, {
    inputs: { totalCodes, concurrencyLimit: CONCURRENCY_LIMIT },
    outputs: {
      proceduresProcessed: allProcedureDetails.length,
      successRate: ((allProcedureDetails.length / totalCodes) * 100).toFixed(1) + '%'
    }
  });

  const updatedProcedureCodes = state.procedureCodes.map(codeEntry => ({
    ...codeEntry,
    processed: allProcedureDetails.some(detail => detail.code === codeEntry.code)
  }));

  return {
    messages: [
      new AIMessage(`Procedure Details extracted (confidence: ${(result.confidence * 100).toFixed(0)}%):\n` +
        `- ${allProcedureDetails.length}/${totalCodes} procedures processed in parallel (${CONCURRENCY_LIMIT} concurrent)\n` +
        `- Each code analyzed with full unflattened context\n` +
        (allProcedureDetails.length > 0 ?
          `- Sample: ${allProcedureDetails[0].code} - ${allProcedureDetails[0].description || 'N/A'}` :
          '- No procedures extracted')
      )
    ],
    verificationResult: {
      ...state.verificationResult,
      procedure_details: allProcedureDetails.length > 0 ? allProcedureDetails : undefined,
    },
    confidenceScores: {
      ...state.confidenceScores,
      procedureDetailsInfo: {
        confidence: result.confidence,
        source: 'parallel' as const,
        timestamp: new Date().toISOString()
      }
    },
    procedureCodes: updatedProcedureCodes
  };
}

async function processSingleProcedure(
  code: string,
  folderPath: string,
  model: any,
  provider?: string,
  officeKey?: string,
  portalType?: string
): Promise<ProcedureDetail | null> {

  const agent = createReactAgent({
    llm: model,
    tools: [getProcedureContextTool]
  });

  let relevantFeedback = [];
  try {
    relevantFeedback = await getRelevantFeedback({
      mapper: 'procedure_details_mapper',
      provider: provider || 'Unknown',
      field: code,
      currentContext: `Extracting procedure details for code ${code}`,
      limit: 3,
      officeId: officeKey,
      portalType: portalType,
    });
    if (relevantFeedback.length > 0) {
      console.log(`[PROCEDURE_DETAILS_MAPPER] 📚 Retrieved ${relevantFeedback.length} relevant past corrections for ${code} (Office: ${officeKey || 'N/A'}, Portal: ${portalType || 'N/A'})`);
    }
  } catch (error) {
    console.error('[PROCEDURE_DETAILS_MAPPER] ⚠️ Failed to retrieve feedback from RAG (continuing without):', error);
  }

  const feedbackSection = relevantFeedback.length > 0
    ? `\n\n🎓 LEARN FROM PAST CORRECTIONS FOR ${code}:\n` +
      relevantFeedback.map((fb, i) =>
        `${i + 1}. Field: ${fb.field}\n` +
        `   ❌ AI extracted: "${fb.ai_value}" ${fb.source_path ? `from ${fb.source_path}` : ''}\n` +
        `   ✅ Correct value: "${fb.human_value}"\n` +
        `   💡 Reasoning: ${fb.human_reasoning || 'No reasoning provided'}\n`
      ).join('\n')
    : '';
  
  const agentPrompt = `Extract complete benefit details for procedure code: ${code}${feedbackSection}

**YOUR TASK:**
Use the get_procedure_context tool to retrieve comprehensive benefit details for this procedure code from PostgreSQL semantic search. This tool queries the vector database to find all relevant information including coverage, limitations, frequencies, and restrictions.

**REQUIRED FIELDS TO EXTRACT:**
1. description: Full procedure description (e.g., "Bitewings - Two Radiographic Images")
2. category: Dental category (e.g., "Preventive", "Basic", "Major", "Diagnostic")
3. coverage_percent: Coverage percentage as a NUMBER 0-100 (not a string with %)
4. network_used: "in-network" or "out-of-network" (check if specified in the data)
5. deductible_applies: true/false - Does the deductible apply to this procedure?
6. maximum_applies: true/false - Does this procedure count toward the yearly maximum?
7. frequency_limitation: Text description (e.g., "Limited to 2 every 1 benefit period", "Limited to 1 every 6 months") or null
8. frequency_shared_codes: Comma-delimited list of dental codes that share the frequency limit (e.g., "D0145,D0150,D0160") or null
9. age_limitation: Text description (e.g., "Under 19 only", "Adults only") or null
10. waiting_period: Text description (e.g., "6 months", "12 months", "None") or null
11. pre_auth_required: true/false - Is pre-authorization required?
12. limitations: Array of strings describing any limitations, groupings, or restrictions

**CONFIDENCE SCALE (0.0-1.0):**
• 0.9-1.0: Perfect match in expected location, standard format, zero ambiguity
• 0.7-0.9: Good match, minor format variations or combined fields
• 0.5-0.7: Moderate uncertainty, non-standard location or format
• 0.3-0.5: Low confidence, significant ambiguity or inference required
• 0.0-0.3: Very uncertain, guessing or likely incorrect

**STRATEGY:**
1. Call get_procedure_context with:
   - patientSessionId: "${folderPath}"
   - procedureCode: "${code}"

2. Analyze the extractedData and rawChunks returned from PostgreSQL semantic search

3. Extract all fields listed above from the context

4. Return your findings as a JSON object with this EXACT structure:
{
  "code": "${code}",
  "description": "...",
  "category": "...",
  "coverage_percent": 100,
  "network_used": "in-network",
  "deductible_applies": false,
  "maximum_applies": true,
  "frequency_limitation": "Limited to 2 every 1 benefit period",
  "frequency_shared_codes": "D0145,D0150,D0160",
  "age_limitation": null,
  "waiting_period": null,
  "pre_auth_required": false,
  "limitations": ["..."],
  "extraction_reasoning": "Explain where you found this data (e.g., 'Found in benefits.procedures array at index 5, description field contained full procedure name, coverage found in limitations.rules.coverage field')",
  "source_path": "The JSON path where the primary data was found (e.g., 'benefits.procedures[5]')",
  "extraction_confidence": 0.9
}

**CRITICAL RULES FOR LIMITATIONS FIELD:**
The limitations array must follow these STRICT formatting rules for consistency:

1. **Frequency limitations** (from rules.frequency=true):
   - If rule.type exists, ALWAYS include it: "Limited to {occurrences} every {length} {unit} per {type}"
   - If no type: "Limited to {occurrences} every {length} {unit}"
   - Example with type: "Limited to 1 occurrence every 12 months per tooth"
   - Example without type: "Limited to 2 per benefit period"

2. **Tooth restrictions** (from limitedToTeeth or procedures.codes):
   - Format: "Limited to teeth: {comma-separated list or range}"
   - Example: "Limited to teeth: 02, 03, 14, 15, 18, 19, 30, 31"
   - Example: "Limited to teeth: 06, 07, 08, 09, 10, 11, 22, 23, 24, 25, 26, 27"

3. **Coverage scope** (from subscriber/spouse/child fields):
   - Only include if explicitly stated in data
   - Format: "Applies to {types}" or "Limited to covered individuals: {types}"
   - Example: "Applies to subscribers, spouses, and children"

4. **Alternate benefits** (from alternateBenefit field):
   - If alternateBenefit is true: "Alternate benefit may apply"
   - Be consistent - use this exact phrase

5. **Subject to review** (from subjectToReview field):
   - If subjectToReview is true: "Subject to review"
   - Be consistent - use this exact phrase

6. **Age restrictions** (already in age_limitation field):
   - DO NOT repeat in limitations array

7. **Missing tooth provision**:
   - Format: "Missing tooth provision does not apply" OR "Missing tooth provision applies"
   - Be consistent in phrasing

**EXAMPLES OF CORRECT LIMITATION FORMATTING:**

Example 1 - D2140 (Amalgam):
"limitations": ["Limited to 1 occurrence every 12 months per tooth"]

Example 2 - D1351 (Sealant):
"limitations": ["Limited to teeth: 02, 03, 14, 15, 18, 19, 30, 31"]

Example 3 - D2750 (Crown):
"limitations": ["Limited to 1 every 96 months per tooth", "Alternate benefit may apply", "Subject to review"]

Example 4 - D4341 (Scaling):
"limitations": ["Limited to 1 occurrence per 24 months per quadrant"]

Example 5 - D7140 (Extraction):
"limitations": ["Limited to 1 occurrence per lifetime per tooth", "Applies to subscribers, spouses, and children"]

Example 6 - D6010 (Implant):
"limitations": ["Limited to teeth 01 to 32", "Missing tooth provision does not apply"]

**CRITICAL RULES FOR FREQUENCY_SHARED_CODES FIELD:**
When extracting frequency_shared_codes, look for procedures that share frequency limitations:
1. Check the limitations.rules array for frequency rules (where frequency=true)
2. Within each frequency rule, check the procedures array
3. Extract all codes from procedures.codes arrays
4. Format as comma-delimited list WITHOUT SPACES (e.g., "D0145,D0150,D0160")
5. EXCLUDE the current procedure code from the list
6. If no shared codes exist, use null

Example: If D0120 has a frequency rule with procedures.codes=[120,145,150,160], then:
- D0120 frequency_shared_codes: "D0145,D0150,D0160"
- D0145 frequency_shared_codes: "D0120,D0150,D0160"
- etc.

**IMPORTANT:**
- coverage_percent must be a NUMBER (0-100), not a string
- frequency_shared_codes must be comma-delimited WITHOUT SPACES (e.g., "D0145,D0150,D0160")
- limitations must be an ARRAY of strings following the exact formats above
- extraction_confidence must be a NUMBER (0.0-1.0) reflecting your confidence in the extraction
- Use null for fields not found (don't make assumptions)
- Be CONSISTENT in your phrasing - use the exact templates shown
- If the procedure is not found or has no data, return a minimal object with code and description: "N/A"

**CRITICAL - EXTRACTION REASONING IS REQUIRED:**
- extraction_reasoning: MUST be at least 20 characters long. Explain exactly where you found each key field.
  * Good example: "Found in benefits.procedures[5]: description from procedures[5].description field ('Bitewings - Two Radiographic Images'), coverage_percent from procedures[5].limitations.rules[0].coverage field (100), frequency from procedures[5].limitations.rules[1] (Limited to 2 every 1 benefit period)"
  * Bad example: "Extracted from data" (TOO VAGUE - REJECTED)
- source_path: MUST provide the JSON path (e.g., "benefits.procedures[5]")
- If you cannot find the procedure data, you MUST still explain where you looked and why it wasn't found`;

  try {
    const timeoutMs = 60000;
    console.log(`[PROCEDURE_DETAILS_MAPPER]   Invoking agent with ${timeoutMs/1000}s timeout...`);
    
    const agentPromise = agent.invoke({
      messages: [{ role: 'user', content: agentPrompt }]
    });
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Agent timed out after ${timeoutMs/1000}s for ${code}`)), timeoutMs);
    });
    
    const agentResult = await Promise.race([agentPromise, timeoutPromise]);
    
    console.log(`[PROCEDURE_DETAILS_MAPPER]   Agent invoked for ${code}`);
    
    const extractedDetail = extractProcedureDetailFromAgentMessages(agentResult.messages, code);
    
    if (extractedDetail) {
      console.log(`[PROCEDURE_DETAILS_MAPPER]   ✓ Successfully extracted: ${extractedDetail.description || 'N/A'}`);
      return extractedDetail;
    } else {
      console.warn(`[PROCEDURE_DETAILS_MAPPER]   ⚠ Agent did not return valid procedure detail for ${code}`);
      return createDefaultProcedureDetail(code);
    }
    
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[PROCEDURE_DETAILS_MAPPER]   ✗ Error processing ${code}: ${errorMsg}`);
    return createDefaultProcedureDetail(code);
  }
}

function extractProcedureDetailFromAgentMessages(messages: any[], code: string): ProcedureDetail | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    
    if (msg._getType?.() === 'tool' || msg.constructor?.name === 'ToolMessage') {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      
      const jsonMatch = content.match(/\{[\s\S]*?"code"[\s\S]*?\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          
          // VALIDATION: extraction_reasoning is REQUIRED
          if (!parsed.extraction_reasoning || parsed.extraction_reasoning.trim().length < 20) {
            console.warn(`[PROCEDURE_DETAILS_MAPPER] ⚠️ ${code}: extraction_reasoning is missing or too short (must be at least 20 characters)`);
            console.warn(`[PROCEDURE_DETAILS_MAPPER]    Received: "${parsed.extraction_reasoning || '(empty)'}".`);
            console.warn(`[PROCEDURE_DETAILS_MAPPER]    Rejecting this extraction - LLM must explain its reasoning.`);
            return null;
          }
          
          // VALIDATION: source_path is REQUIRED
          if (!parsed.source_path || parsed.source_path.trim().length === 0) {
            console.warn(`[PROCEDURE_DETAILS_MAPPER] ⚠️ ${code}: source_path is missing`);
            console.warn(`[PROCEDURE_DETAILS_MAPPER]    Rejecting this extraction - LLM must provide source path.`);
            return null;
          }
          
          if (parsed.code) {
            return {
              code: parsed.code,
              description: parsed.description || 'N/A',
              category: parsed.category || 'Unknown',
              coverage_percent: typeof parsed.coverage_percent === 'number' ? parsed.coverage_percent : 0,
              network_used: parsed.network_used || 'unknown',
              deductible_applies: !!parsed.deductible_applies,
              maximum_applies: !!parsed.maximum_applies,
              frequency_limitation: parsed.frequency_limitation || null,
              frequency_shared_codes: parsed.frequency_shared_codes || null,
              age_limitation: parsed.age_limitation || null,
              waiting_period: parsed.waiting_period || null,
              pre_auth_required: !!parsed.pre_auth_required,
              limitations: normalizeLimitations(Array.isArray(parsed.limitations) ? parsed.limitations : []),
              processed: true,
              extraction_reasoning: parsed.extraction_reasoning,
              source_path: parsed.source_path,
              extraction_confidence: parsed.extraction_confidence || 0.85
            };
          }
        } catch (err) {
          console.warn(`[PROCEDURE_DETAILS_MAPPER]   Failed to parse JSON from agent message:`, err);
        }
      }
    }
  }
  
  return null;
}

function normalizeLimitations(limitations: string[]): string[] {
  return limitations.map(limit => {
    let normalized = limit.trim();
    
    normalized = normalized.replace(/Limited to (\d+) occurrences? (every|per) (\d+) (month|year|day)s? per (tooth|quadrant|visit|lifetime)/gi, 
      (match, occ, per, len, unit, type) => `Limited to ${occ} occurrence${occ === '1' ? '' : 's'} every ${len} ${unit}s per ${type.toLowerCase()}`);
    
    normalized = normalized.replace(/Limited to (\d+) (every|per) (\d+) (month|year|day)s? per (tooth|quadrant|visit|lifetime)/gi,
      (match, occ, per, len, unit, type) => `Limited to ${occ} every ${len} ${unit}s per ${type.toLowerCase()}`);
    
    normalized = normalized.replace(/Alternate benefits? may apply/gi, "Alternate benefit may apply");
    
    normalized = normalized.replace(/Subject to reviews?/gi, "Subject to review");
    
    normalized = normalized.replace(/Limited to specific teeth:/gi, "Limited to teeth:");
    
    normalized = normalized.replace(/Applies to (subscriber|spouse|child)(s?)(,? and | and |, )?(subscriber|spouse|child)?(s?)(,? and | and |, )?(subscriber|spouse|child)?(s?)/gi,
      (match) => {
        const hasSubscriber = /subscriber/i.test(match);
        const hasSpouse = /spouse/i.test(match);
        const hasChild = /child/i.test(match);
        
        const parts = [];
        if (hasSubscriber) parts.push('subscribers');
        if (hasSpouse) parts.push('spouses');
        if (hasChild) parts.push('children');
        
        if (parts.length === 1) return `Applies to ${parts[0]}`;
        if (parts.length === 2) return `Applies to ${parts[0]} and ${parts[1]}`;
        return `Applies to ${parts[0]}, ${parts[1]}, and ${parts[2]}`;
      });
    
    normalized = normalized.replace(/Missing tooth provisions? (does not apply|do not apply)/gi, "Missing tooth provision does not apply");
    normalized = normalized.replace(/Missing tooth provisions? (applies|apply)/gi, "Missing tooth provision applies");
    
    return normalized;
  });
}

function createDefaultProcedureDetail(code: string): ProcedureDetail {
  return {
    code: code,
    description: 'N/A',
    category: 'Unknown',
    coverage_percent: 0,
    network_used: 'unknown',
    deductible_applies: false,
    maximum_applies: false,
    frequency_limitation: null,
    frequency_shared_codes: null,
    age_limitation: null,
    waiting_period: null,
    pre_auth_required: false,
    limitations: [],
    processed: true,
    extraction_reasoning: `Failed to extract procedure ${code} - agent timed out or returned invalid data`,
    source_path: 'aggregated_procedure_data',
    extraction_confidence: 0.0
  };
}

function calculateConfidence(details: ProcedureDetail[]): number {
  if (details.length === 0) return 0;

  let totalScore = 0;

  for (const detail of details) {
    // Use LLM-reported confidence if available, otherwise fall back to deterministic
    if (detail.extraction_confidence !== undefined && detail.extraction_confidence > 0) {
      totalScore += detail.extraction_confidence;
    } else {
      // Fallback: calculate based on field completeness
      let score = 0.5;

      if (detail.code && detail.description && detail.description !== 'N/A') score += 0.2;
      if (detail.coverage_percent !== undefined && detail.coverage_percent > 0) score += 0.2;
      if (detail.category && detail.category !== 'Unknown') score += 0.1;

      totalScore += Math.min(score, 1.0);
    }
  }

  return totalScore / details.length;
}
