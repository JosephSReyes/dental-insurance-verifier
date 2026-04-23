import {
  StateGraph,
  END,
  START,
  Command,
  Send,
  MemorySaver,
} from "@langchain/langgraph";
import { RunnableConfig } from "@langchain/core/runnables";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { tool } from "@langchain/core/tools";

import {
  AgentConfigurationAnnotation,
  ensureAgentConfiguration,
} from "./configuration.js";
import { AgentStateAnnotation, InputStateAnnotation, OutputStateAnnotation } from "./state.js";
import { loadChatModel } from "../shared/utils.js";
import {
  generateFormsTool,
  humanReviewTool,
  apiListenerTool,
  extractPatientInfoTool
} from "./tools.js";
import { patientInfoMapperNode } from "./patient-info-mapper.js";
import { insuranceInfoMapperNode } from "./insurance-info-mapper.js";
import { coverageAndBenefitsMapperNode } from "./coverage-and-benefits-mapper.js";
import { orthodonticBenefitsMapperNode } from "./orthodontic-benefits-mapper.js";
import { waitingPeriodsMapperNode } from "./waiting-periods-mapper.js";
import { procedureDetailsMapperNode } from "./procedure-details-mapper.js";
import { treatmentHistoryMapperNode } from "./treatment-history-mapper.js";
import { aggregateApiDataNode } from "./aggregate-api-data-node.js";
import { qaValidationNode } from "./qa-validation-node.js";
import { extractionSubgraph } from "./extraction-subgraph.js";
import { getOfficeContext } from "../shared/officeContext.js";
import { logNodeExecution } from "../shared/logging.js";
import {
  runPreParser,
  runExtractor,
  runFieldNormalizer,
  runValueNormalizer,
  runSimplifier,
  runChunker,
  runEmbedder
} from "../shared/pipeline-client.js";

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

import { getAllOfficeNames, getOfficeAliases } from "../shared/officeContext.js";

function fuzzyMatchOffice(input: string): string | null {
  const inputLower = input.toLowerCase().trim();
  
  const officeKeys = Object.keys(process.env)
    .filter(key => key.endsWith('_NAME'))
    .map(key => key.replace('_NAME', ''));
  
  for (const officeKey of officeKeys) {
    const displayName = process.env[`${officeKey}_NAME`];
    const aliases = getOfficeAliases(officeKey);
    
    if (displayName && displayName.toLowerCase() === inputLower) {
      return officeKey;
    }
    
    for (const alias of aliases) {
      if (inputLower.includes(alias) || alias.includes(inputLower)) {
        return officeKey;
      }
    }
  }
  
  let bestMatch = { key: null as string | null, distance: Infinity };
  
  for (const officeKey of officeKeys) {
    const aliases = getOfficeAliases(officeKey);
    const displayName = process.env[`${officeKey}_NAME`];
    
    const searchTerms = displayName ? [displayName.toLowerCase(), ...aliases] : aliases;
    
    for (const term of searchTerms) {
      const distance = levenshteinDistance(inputLower, term);
      const threshold = Math.max(2, Math.floor(term.length * 0.3));
      
      if (distance < bestMatch.distance && distance <= threshold) {
        bestMatch = { key: officeKey, distance };
      }
    }
  }
  
  return bestMatch.key;
}

// ---------------- Supervisor Node (Deterministic) ----------------
async function supervisorNode(
  state: typeof AgentStateAnnotation.State,
  config: RunnableConfig,
): Promise<typeof AgentStateAnnotation.Update> {
  const recursionLimit = config.recursionLimit ?? 'not set';
  
  console.log('[SUPERVISOR] ===== DETERMINISTIC ROUTING =====');
  console.log('[SUPERVISOR] Runtime config:');
  console.log('[SUPERVISOR]   - recursionLimit:', recursionLimit);
  console.log('[SUPERVISOR]   - Full config:', JSON.stringify(config, null, 2));
  console.log('[SUPERVISOR] State checkpoint:');
  
  
  console.log('[SUPERVISOR]   - extractedInfo:', !!state.extractedInfo);
  console.log('[SUPERVISOR]   - scrapingComplete:', state.scrapingComplete);
  console.log('[SUPERVISOR]   - preParserComplete:', state.preParserComplete);
  console.log('[SUPERVISOR]   - extractorComplete:', state.extractorComplete);
  console.log('[SUPERVISOR]   - fieldNormalizerComplete:', state.fieldNormalizerComplete);
  console.log('[SUPERVISOR]   - valueNormalizerComplete:', state.valueNormalizerComplete);
  console.log('[SUPERVISOR]   - simplifierComplete:', state.simplifierComplete);
  console.log('[SUPERVISOR]   - chunkerComplete:', state.chunkerComplete);
  console.log('[SUPERVISOR]   - embedderComplete:', state.embedderComplete);
  console.log('[SUPERVISOR]   - jsonFlattened:', state.jsonFlattened);
  console.log('[SUPERVISOR]   - mapperBatchesComplete:', state.mapperBatchesComplete);
  console.log('[SUPERVISOR]   - verificationComplete:', state.verificationComplete);

  console.log('[SUPERVISOR]   - forms:', !!state.forms);
  console.log('[SUPERVISOR]   - output:', !!state.output);
  console.log('[SUPERVISOR]   - output length:', state.output?.length || 0);
  console.log('[SUPERVISOR]   - completedAgents:', state.completedAgents || []);

  // Check for pipeline failures (completion flag set but no output path)
  // This indicates the step was attempted but failed - we should stop the workflow
  if (state.preParserComplete && !state.preParserOutputPath) {
    console.error('[SUPERVISOR] ❌ PreParser failed - stopping workflow');
    return {
      nextAgent: END,
      messages: [
        new AIMessage('❌ Workflow stopped: PreParser failed. Check logs for details.')
      ]
    };
  }

  // Check for Chunker failure (Chunker is now part of active flow: PreParser → Chunker → Embedder)
  if (state.chunkerComplete && !state.chunkerOutputPath) {
    console.error('[SUPERVISOR] ❌ Chunker failed - stopping workflow');
    return {
      nextAgent: END,
      messages: [
        new AIMessage('❌ Workflow stopped: Chunker failed. Check logs for details.')
      ]
    };
  }

  // OLD PIPELINE STEPS - NO LONGER USED (Extractor, FieldNormalizer, ValueNormalizer, Simplifier)
  // These were replaced by the new flow: PreParser → Chunker → Embedder
  // if (state.extractorComplete && !state.extractorOutputPath) { ... }
  // if (state.fieldNormalizerComplete && !state.fieldNormalizerOutputPath) { ... }
  // if (state.valueNormalizerComplete && !state.valueNormalizerOutputPath) { ... }
  // if (state.simplifierComplete && !state.simplifierOutputPath) { ... }

  if (state.embedderComplete && !state.embedderOutputPath) {
    console.error('[SUPERVISOR] ❌ Embedder failed - stopping workflow');
    return {
      nextAgent: END,
      messages: [
        new AIMessage('❌ Workflow stopped: Embedder failed. Check logs for details.')
      ]
    };
  }

  let nextNode: string;
  let reasoning: string;

  if (!state.extractedInfo) {
    nextNode = "extract_request_info";
    reasoning = "No extracted info - need to parse user request";
  } else if (!state.scrapingComplete) {
    nextNode = "extraction_graph";
    reasoning = `Request info extracted - provider: ${state.extractedInfo.insurance_provider} - need to extract data from portal`;
  } else if (state.scrapingComplete && state.patientApiDataFolder && !state.preParserOutputPath) {
    nextNode = "preparser";
    reasoning = "Portal scraping complete - running PreParser on downloaded data";
  } else if (state.preParserOutputPath && !state.chunkerOutputPath) {
    // NEW FLOW: PreParser → Chunker (with --markdown-dir argument)
    nextNode = "chunker";
    reasoning = "PreParser complete - running Chunker with markdown directory";
  } else if (state.chunkerOutputPath && !state.embedderOutputPath) {
    // NEW FLOW: Chunker → Embedder
    nextNode = "embedder";
    reasoning = "Chunker complete - running Embedder";
  } else if (state.embedderOutputPath && !state.mapperBatchesComplete.batch1) {
    // NEW FLOW: Skip aggregate_api_data - mappers query PostgreSQL directly
    nextNode = "batch1_launcher";
    reasoning = "Embedder complete - launching BATCH 1 mappers (NEW FLOW: mappers query PostgreSQL semantic search directly)";
  } else if (state.jsonFlattened && !state.mapperBatchesComplete.batch1) {
    nextNode = "batch1_launcher";
    reasoning = "JSON flattening complete - launching BATCH 1 mappers in parallel (patient_info + insurance_info)";
  } else if (state.mapperBatchesComplete.batch1 && !state.mapperBatchesComplete.batch2) {
    nextNode = "batch2_launcher";
    reasoning = "Batch 1 complete - launching BATCH 2 mappers in parallel (coverage_benefits + orthodontic + waiting_periods + procedure_details + treatment_history)";
  } else if (state.mapperBatchesComplete.batch2 && !state.verificationComplete) {
    nextNode = "skip_verification";
    reasoning = "All mappers complete - skipping verification analysis";

  } else if (!state.forms) {
    nextNode = "generate_forms";
    reasoning = "Verification complete - need to generate verification forms";
  } else if (state.completedAgents?.includes("HumanAgent")) {
    nextNode = END;
    reasoning = "Human review already completed - workflow done";
  } else if (state.output && state.output.length > 0 && state.output !== "") {
    nextNode = END;
    reasoning = "Output already generated - workflow done";
  } else if (!state.qaValidationComplete) {
    nextNode = "qa_validation";
    reasoning = "Forms generated - running quality assurance validation before human review";
  } else {
    nextNode = "human_review";
    reasoning = "QA validation complete - proceeding to final human review and report generation";
  }

  console.log('[SUPERVISOR] ===== ROUTING DECISION =====');
  console.log('[SUPERVISOR] nextNode:', nextNode);
  console.log('[SUPERVISOR] reasoning:', reasoning);
  console.log('[SUPERVISOR] nextNode type:', typeof nextNode);
  console.log('[SUPERVISOR] nextNode === END:', nextNode === END);
  console.log('[SUPERVISOR] nextNode === "human_review":', nextNode === "human_review");

  logNodeExecution('main_supervisor', 'deterministic', 1.0, {
    inputs: { 
      extractedInfo: !!state.extractedInfo,
      insuranceProvider: state.extractedInfo?.insurance_provider,
      scrapingComplete: state.scrapingComplete,
      verificationComplete: state.verificationComplete
    },
    outputs: { nextNode, reasoning }
  });

  const stateUpdate = {
    nextAgent: nextNode,
    messages: [
      new AIMessage(`Supervisor routing to: ${nextNode}. Reasoning: ${reasoning}`)
    ]
  };

  console.log('[SUPERVISOR] Returning state update with nextAgent:', stateUpdate.nextAgent);
  return stateUpdate;
}

// ---------------- Individual Tool Nodes ----------------
async function extractRequestInfoNode(
  state: typeof AgentStateAnnotation.State,
  config: RunnableConfig,
): Promise<typeof AgentStateAnnotation.Update> {
  const configuration = ensureAgentConfiguration(config);
  const model = await loadChatModel(configuration.model);

  // Debug: Log all messages in state with full type info
  console.log('[EXTRACT_REQUEST] Total messages in state:', state.messages.length);
  console.log('[EXTRACT_REQUEST] Messages:', state.messages.map(m => ({
    _getType: m._getType?.(),
    constructorName: m.constructor?.name,
    typeProperty: (m as any).type,
    hasContent: !!m.content,
    contentPreview: typeof m.content === 'string' ? m.content.substring(0, 100) : typeof m.content
  })));

  // CRITICAL: Check ENTIRE STATE SIZE, not just messages
  console.log('[EXTRACT_REQUEST] 🔍 Checking state size...');

  const stateFields = Object.keys(state);
  const stateSizes: Record<string, number | string> = {};

  for (const field of stateFields) {
    const value = (state as any)[field];

    try {
      const size = JSON.stringify(value).length;
      stateSizes[field] = size;

      if (size > 100000) {
        console.error(`[EXTRACT_REQUEST] 🚨 HUGE STATE FIELD: "${field}" = ${size} bytes`);
      }
    } catch (error) {
      stateSizes[field] = 'TOO_LARGE_TO_STRINGIFY';
      console.error(`[EXTRACT_REQUEST] 🚨 STATE FIELD TOO LARGE: "${field}" cannot be stringified!`);
      console.error(`[EXTRACT_REQUEST] Error:`, error instanceof Error ? error.message : String(error));
    }
  }

  console.log('[EXTRACT_REQUEST] State field sizes:', stateSizes);

  // Calculate total state size (excluding fields that are too large)
  const totalSize = Object.values(stateSizes)
    .filter(v => typeof v === 'number')
    .reduce((sum, size) => sum + (size as number), 0);

  console.log(`[EXTRACT_REQUEST] Total measurable state size: ${totalSize} bytes (${(totalSize / 1024 / 1024).toFixed(2)} MB)`);

  // CRITICAL: Check if any message content is a huge object
  for (let i = 0; i < state.messages.length; i++) {
    const msg = state.messages[i];
    if (typeof msg.content !== 'string') {
      let contentSize = 0;
      let sizingError = false;

      try {
        contentSize = JSON.stringify(msg.content).length;
      } catch (error) {
        sizingError = true;
        console.error(`[EXTRACT_REQUEST] 🚨 Message ${i} content is SO LARGE it can't be stringified!`);
      }

      console.log(`[EXTRACT_REQUEST] ⚠️ Message ${i} has non-string content:`, {
        type: (msg as any).type || msg._getType?.(),
        contentType: typeof msg.content,
        contentSize: sizingError ? 'TOO_LARGE_TO_MEASURE' : contentSize,
        contentKeys: msg.content && typeof msg.content === 'object' ? Object.keys(msg.content).slice(0, 10) : []
      });
    }
  }

  // Find the original user request (not supervisor routing messages)
  // Check type property for deserialized messages
  const userMessages = state.messages.filter(msg => (
    msg._getType?.() === 'human' ||
    msg.constructor?.name === 'HumanMessage' ||
    (msg as any).type === 'human'
  ));
  const originalRequest = userMessages[userMessages.length - 1];

  const requestText = typeof originalRequest?.content === 'string'
    ? originalRequest.content
    : (originalRequest?.content?.[0] as any)?.text || '';

  console.log('[EXTRACT_REQUEST] Processing original user request:', requestText);
  console.log('[EXTRACT_REQUEST] Found', userMessages.length, 'user messages in state');

  // Special handling: If request is just a patient folder ID, route directly to mapper
  const folderPattern = /^[A-Z0-9_\-]+_\d{4}-\d{2}-\d{2}T[\d\-:]+Z$/i;
  if (folderPattern.test(requestText.trim())) {
    console.log('[EXTRACT_REQUEST] Detected patient folder ID format - routing to mapper');
    return {
      messages: [
        new AIMessage(`Patient folder detected: ${requestText}. Routing to mapper for extraction.`)
      ],
      patientApiDataFolder: requestText.trim(),
      extractedInfo: {
        request_type: 'extract_from_folder'
      }
    };
  }

  // Define extraction schema with BCBS-specific fields
  const ExtractionSchema = z.object({
    request_type: z.string().describe("Type of request (e.g., full_breakdown, verification, pre_authorization)"),
    patient_name: z.string().nullable().describe("Patient's full name, or null if not mentioned"),
    insurance_provider: z.string().describe("Insurance company/carrier name (e.g., BCBS, Delta Dental, Aetna)"),
    dental_codes: z.array(z.string()).describe("Array of dental procedure codes (e.g., D2472, D3330). Empty array if none mentioned."),
    appointment_date: z.string().describe("Appointment date in MM/DD/YYYY format"),
    office_name: z.string().describe("The exact name of the dental office making this request (e.g., 'Sample Dental', 'Main Street Family Dentistry'). Use 'OFFICE_NOT_SPECIFIED' if not mentioned."),
    additional_notes: z.string().nullable().describe("Any additional relevant information, or null if none"),
    // BCBS-specific fields
    patient_dob: z.string().nullable().describe("Patient's date of birth in MM/DD/YYYY format (REQUIRED for Blue Cross Blue Shield)"),
    patient_id: z.string().nullable().describe("Patient's insurance member ID or subscriber ID (for Blue Cross Blue Shield)"),
    patient_ssn: z.string().nullable().describe("Patient's last 4 digits of SSN or full SSN if provided (for Blue Cross Blue Shield)")
  });

  // Create extraction tool using Zod schema (LangGraph best practice)
  const extractInsuranceInfoTool = tool(
    async (input) => {
      // Tool just validates and returns the input
      // Validation happens automatically via Zod schema
      return input;
    },
    {
      name: "extract_insurance_info",
      description: "Extract structured information from an insurance verification request. Call this tool with the extracted data fields.",
      schema: ExtractionSchema
    }
  );

  const extractionPrompt = `Analyze this insurance verification request and extract the information:

Request: "${requestText}"

Extract these fields:
- request_type: What type of request? (e.g., "full_breakdown", "verification", "pre_authorization")
- patient_name: Patient's full name (null if not mentioned)
- insurance_provider: Insurance company (e.g., "BCBS", "Delta Dental", "Aetna")
- dental_codes: Array of dental procedure codes like D2472, D3330 (empty array [] if none)
- appointment_date: Date in MM/DD/YYYY format
- office_name: Dental office name (use "OFFICE_NOT_SPECIFIED" if not mentioned)
- additional_notes: Any other relevant info (null if none)

**For Blue Cross Blue Shield (BCBS) only:**
- patient_dob: Patient's date of birth in MM/DD/YYYY format (REQUIRED for BCBS)
- patient_id: Member ID or subscriber ID (REQUIRED for BCBS if SSN not provided)
- patient_ssn: SSN or last 4 digits (REQUIRED for BCBS if ID not provided)

Use the extract_insurance_info tool to return this structured data.`;

  // Bind extraction tool to model
  console.log('[EXTRACT_REQUEST] Using tool-based extraction (LangGraph best practice)');
  const modelWithTools = model.bindTools([extractInsuranceInfoTool]);

  // Invoke model with tool
  const response = await modelWithTools.invoke([
    new SystemMessage("You are an expert at extracting structured information from insurance verification requests. Use the extract_insurance_info tool to return the extracted data."),
    new HumanMessage(extractionPrompt)
  ]);

  console.log('[EXTRACT_REQUEST] Model response:', {
    hasToolCalls: !!response.tool_calls?.length,
    toolCallsCount: response.tool_calls?.length || 0
  });

  // Extract tool call result
  if (!response.tool_calls || response.tool_calls.length === 0) {
    console.error('[EXTRACT_REQUEST] No tool calls found in response');
    console.error('[EXTRACT_REQUEST] Response content:', response.content);
    throw new Error(
      'LLM did not use the extraction tool. This may indicate the model does not support tool calling properly. ' +
      'Response: ' + response.content.toString().substring(0, 200)
    );
  }

  const toolCall = response.tool_calls[0];
  console.log('[EXTRACT_REQUEST] Tool call:', {
    name: toolCall.name,
    hasArgs: !!toolCall.args
  });

  if (toolCall.name !== 'extract_insurance_info') {
    throw new Error(`Expected extract_insurance_info tool, got: ${toolCall.name}`);
  }

  // Tool arguments are already validated by Zod schema!
  const extractedInfo = toolCall.args;
  console.log('[EXTRACT_REQUEST] Extracted and validated info:', extractedInfo);

  // Validate the extracted info has required fields
  // Note: patient_name is optional at this stage - will be filled during navigation/extraction
  const requiredFields = ['request_type', 'insurance_provider', 'appointment_date', 'office_name'];
  for (const field of requiredFields) {
    if (!extractedInfo[field]) {
      throw new Error(`Missing required field: ${field}. Extracted: ${JSON.stringify(extractedInfo)}`);
    }
  }

  // Special validation for dental_codes array
  if (!Array.isArray(extractedInfo.dental_codes)) {
    throw new Error(`dental_codes must be an array. Got: ${typeof extractedInfo.dental_codes}`);
  }

  console.log('[EXTRACT_REQUEST] Extracted information:', extractedInfo);

  // Validate BCBS-specific requirements
  const isBCBS = extractedInfo.insurance_provider.toLowerCase().includes('blue cross') || 
                 extractedInfo.insurance_provider.toLowerCase().includes('bcbs');
  
  if (isBCBS) {
    console.log('[EXTRACT_REQUEST] Blue Cross Blue Shield detected - validating required fields...');
    
    // Check for required DOB
    if (!extractedInfo.patient_dob || extractedInfo.patient_dob === 'null') {
      throw new Error(
        'Blue Cross Blue Shield verification requires patient date of birth (DOB). ' +
        'Please provide the patient\'s DOB in MM/DD/YYYY format. ' +
        `Example: "Verify BCBS for ${extractedInfo.patient_name}, DOB 03/15/1985, for procedure D0330..."`
      );
    }
    
    // Check for required patient ID or SSN (at least one)
    const hasPatientId = extractedInfo.patient_id && extractedInfo.patient_id !== 'null';
    const hasSSN = extractedInfo.patient_ssn && extractedInfo.patient_ssn !== 'null';
    
    if (!hasPatientId && !hasSSN) {
      throw new Error(
        'Blue Cross Blue Shield verification requires EITHER patient Member ID OR patient SSN (last 4 digits). ' +
        'Please provide at least one of these identifiers. ' +
        `Example: "Verify BCBS for ${extractedInfo.patient_name}, DOB ${extractedInfo.patient_dob}, Member ID ABC123456..."`
      );
    }
    
    console.log('[EXTRACT_REQUEST] ✅ BCBS validation passed');
    console.log(`[EXTRACT_REQUEST] - DOB: ${extractedInfo.patient_dob}`);
    console.log(`[EXTRACT_REQUEST] - Member ID: ${hasPatientId ? extractedInfo.patient_id : 'Not provided'}`);
    console.log(`[EXTRACT_REQUEST] - SSN: ${hasSSN ? '****' + (extractedInfo.patient_ssn?.slice(-4) || '') : 'Not provided'}`);
  }

  // Log LLM extraction with moderate confidence (0.85 typical for structured extraction)
  logNodeExecution('extract_request_info', 'llm_based', 0.85, {
    inputs: { requestText: requestText.substring(0, 100) },
    outputs: { 
      patient: extractedInfo.patient_name,
      insurance: extractedInfo.insurance_provider,
      codesCount: extractedInfo.dental_codes.length,
      office: extractedInfo.office_name,
      bcbs_validated: isBCBS
    }
  });

  // Detect portal type and version from insurance provider
  const providerLower = extractedInfo.insurance_provider.toLowerCase();
  let portalType: 'bcbs' | 'delta_dental' | 'unknown';
  let portalVersion: string | undefined;

  if (providerLower.includes('blue cross') || providerLower.includes('bcbs')) {
    portalType = 'bcbs';

    // Detect BCBS regional variations
    if (providerLower.includes('california')) {
      portalVersion = 'bcbs_ca';
    } else if (providerLower.includes('texas')) {
      portalVersion = 'bcbs_tx';
    } else if (providerLower.includes('florida')) {
      portalVersion = 'bcbs_fl';
    } else if (providerLower.includes('anthem')) {
      portalVersion = 'bcbs_anthem';
    } else {
      portalVersion = 'bcbs_standard';
    }

  } else if (providerLower.includes('delta dental')) {
    portalType = 'delta_dental';

    // Detect Delta Dental regional variations
    if (providerLower.includes('california')) {
      portalVersion = 'delta_ca';
    } else if (providerLower.includes('washington')) {
      portalVersion = 'delta_wa';
    } else if (providerLower.includes('michigan')) {
      portalVersion = 'delta_mi';
    } else if (providerLower.includes('ppo')) {
      portalVersion = 'delta_ppo';
    } else if (providerLower.includes('premier')) {
      portalVersion = 'delta_premier';
    } else {
      portalVersion = 'delta_standard';
    }

  } else {
    portalType = 'unknown';
    portalVersion = undefined;
  }

  console.log(`[EXTRACT_REQUEST] Detected portal: ${portalType} (version: ${portalVersion || 'N/A'})`);

  // Map office name to office identifier and initialize office context
  let office;
  let officeKey;

  if (extractedInfo.office_name === "OFFICE_NOT_SPECIFIED") {
    throw new Error('Office name is required but not specified in the request. Please include the dental office name in your request.');
  }

  officeKey = fuzzyMatchOffice(extractedInfo.office_name);
  if (!officeKey) {
    const knownOffices = getAllOfficeNames().join(', ');
    throw new Error(`Unknown office: "${extractedInfo.office_name}". Known offices: ${knownOffices}`);
  }

  try {
    console.log(`[EXTRACT_REQUEST] Loading office context for: ${extractedInfo.office_name} (${officeKey}), provider: ${extractedInfo.insurance_provider}`);
    office = getOfficeContext(officeKey, extractedInfo.insurance_provider);
    console.log(`[EXTRACT_REQUEST] Successfully loaded office context for: ${office.name}`);
    console.log(`[EXTRACT_REQUEST] Contracted plans: ${office.contractedPlans}`);
  } catch (error) {
    throw new Error(`Failed to load office context for ${extractedInfo.office_name} (${officeKey}): ${error.message}`);
  }

  // Build extraction summary message
  let extractionMessage = `Information extracted from request:
- Request Type: ${extractedInfo.request_type}
- Patient: ${extractedInfo.patient_name}
- Insurance: ${extractedInfo.insurance_provider}
- Codes: ${extractedInfo.dental_codes.join(', ')}
- Appointment: ${extractedInfo.appointment_date}
- Office: ${office.name}`;

  // Add BCBS-specific fields if present
  if (isBCBS) {
    extractionMessage += `\n- Patient DOB: ${extractedInfo.patient_dob}`;
    if (extractedInfo.patient_id && extractedInfo.patient_id !== 'null') {
      extractionMessage += `\n- Member ID: ${extractedInfo.patient_id}`;
    }
    if (extractedInfo.patient_ssn && extractedInfo.patient_ssn !== 'null') {
      const maskedSSN = extractedInfo.patient_ssn.length > 4
        ? '***-**-' + extractedInfo.patient_ssn.slice(-4)
        : '****' + extractedInfo.patient_ssn;
      extractionMessage += `\n- SSN: ${maskedSSN}`;
    }
  }

  if (extractedInfo.additional_notes) {
    extractionMessage += `\n- Notes: ${extractedInfo.additional_notes}`;
  }

  // Add matched office credentials for the selected insurance provider
  extractionMessage += `\n\nMatched Office Credentials:`;
  extractionMessage += `\n- Office Key: ${officeKey}`;
  extractionMessage += `\n- Username: ${office.username}`;
  extractionMessage += `\n- Password: ${'*'.repeat(office.password.length)}`;
  extractionMessage += `\n- Contracted Plans: ${office.contractedPlans}`;

  // Add portal and office context to extractedInfo
  const enrichedExtractedInfo = {
    ...extractedInfo,
    office_key: officeKey,
    portal_type: portalType,
    portal_version: portalVersion
  };

  return {
    messages: [
      new AIMessage(extractionMessage)
    ],
    office: office, // Set office context in workflow state
    officeKey: officeKey, // Set office key in workflow state
    portalType: portalType, // Set portal type in workflow state
    portalVersion: portalVersion, // Set portal version in workflow state
    extractedInfo: enrichedExtractedInfo
  };
}


async function skipVerificationNode(
  state: typeof AgentStateAnnotation.State,
  _config: RunnableConfig,
): Promise<typeof AgentStateAnnotation.Update> {
  console.log('[SKIP_VERIFICATION] No dental codes provided - marking verification as complete');

  return {
    messages: [
      new AIMessage('No dental codes provided - skipping procedure verification')
    ],
    verificationComplete: true
  };
}

// ---------------- Pipeline Nodes ----------------
async function preParserNode(
  state: typeof AgentStateAnnotation.State,
  _config: RunnableConfig,
): Promise<typeof AgentStateAnnotation.Update> {
  console.log('[PREPARSER_NODE] ===== STARTING PREPARSER =====');

  const patientFolder = state.patientApiDataFolder;

  if (!patientFolder) {
    console.error('[PREPARSER_NODE] Patient folder not found in state');
    return {
      messages: [
        new AIMessage('❌ PreParser failed: Patient folder not found in state')
      ],
      preParserComplete: true  // Mark as complete to prevent loop
    };
  }

  console.log(`[PREPARSER_NODE] Patient folder: ${patientFolder}`);

  try {
    const result = await runPreParser(patientFolder);

    if (!result.success) {
      console.error('[PREPARSER_NODE] PreParser failed:', result.error);
      return {
        messages: [
          new AIMessage(`❌ PreParser failed: ${result.error}`)
        ],
        preParserComplete: true  // Mark as complete to prevent loop
      };
    }

    console.log(`[PREPARSER_NODE] PreParser completed successfully`);
    console.log(`[PREPARSER_NODE] Output: ${result.outputPath}`);

    logNodeExecution('preparser', 'deterministic', 1.0, {
      inputs: { patientFolder },
      outputs: { outputPath: result.outputPath }
    });

    return {
      messages: [
        new AIMessage(
          `✅ PreParser complete!\n` +
          `- Output: ${result.outputPath}`
        )
      ],
      preParserComplete: true,
      preParserOutputPath: result.outputPath
    };

  } catch (error) {
    console.error('[PREPARSER_NODE] Exception:', error);
    return {
      messages: [
        new AIMessage(
          `❌ PreParser failed: ${error instanceof Error ? error.message : String(error)}`
        )
      ],
      preParserComplete: true  // Mark as complete to prevent loop
    };
  }
}

async function extractorNode(
  state: typeof AgentStateAnnotation.State,
  _config: RunnableConfig,
): Promise<typeof AgentStateAnnotation.Update> {
  console.log('[EXTRACTOR_NODE] ===== STARTING EXTRACTOR =====');

  const patientFolder = state.patientApiDataFolder;
  const preParserOutputPath = state.preParserOutputPath;

  if (!patientFolder || !preParserOutputPath) {
    console.error('[EXTRACTOR_NODE] Missing required inputs');
    return {
      messages: [
        new AIMessage('❌ Extractor failed: Missing patient folder or PreParser output path')
      ],
      extractorComplete: true  // Mark as complete to prevent loop
    };
  }

  console.log(`[EXTRACTOR_NODE] Patient folder: ${patientFolder}`);
  console.log(`[EXTRACTOR_NODE] Input: ${preParserOutputPath}`);

  try {
    const result = await runExtractor(patientFolder, preParserOutputPath);

    if (!result.success) {
      console.error('[EXTRACTOR_NODE] Extractor failed:', result.error);
      return {
        messages: [
          new AIMessage(`❌ Extractor failed: ${result.error}`)
        ],
        extractorComplete: true  // Mark as complete to prevent loop
      };
    }

    console.log(`[EXTRACTOR_NODE] Extractor completed successfully`);
    console.log(`[EXTRACTOR_NODE] Output: ${result.outputPath}`);

    logNodeExecution('extractor', 'deterministic', 1.0, {
      inputs: { patientFolder, inputPath: preParserOutputPath },
      outputs: { outputPath: result.outputPath }
    });

    return {
      messages: [
        new AIMessage(
          `✅ Extractor complete!\n` +
          `- Output: ${result.outputPath}`
        )
      ],
      extractorComplete: true,
      extractorOutputPath: result.outputPath
    };

  } catch (error) {
    console.error('[EXTRACTOR_NODE] Exception:', error);
    return {
      messages: [
        new AIMessage(
          `❌ Extractor failed: ${error instanceof Error ? error.message : String(error)}`
        )
      ],
      extractorComplete: true  // Mark as complete to prevent loop
    };
  }
}

async function fieldNormalizerNode(
  state: typeof AgentStateAnnotation.State,
  _config: RunnableConfig,
): Promise<typeof AgentStateAnnotation.Update> {
  console.log('[FIELD_NORMALIZER_NODE] ===== STARTING FIELD NORMALIZER =====');

  const patientFolder = state.patientApiDataFolder;
  const extractorOutputPath = state.extractorOutputPath;

  if (!patientFolder || !extractorOutputPath) {
    console.error('[FIELD_NORMALIZER_NODE] Missing required inputs');
    return {
      messages: [
        new AIMessage('❌ FieldNormalizer failed: Missing patient folder or Extractor output path')
      ],
      fieldNormalizerComplete: true  // Mark as complete to prevent loop
    };
  }

  console.log(`[FIELD_NORMALIZER_NODE] Patient folder: ${patientFolder}`);
  console.log(`[FIELD_NORMALIZER_NODE] Input: ${extractorOutputPath}`);

  try {
    const result = await runFieldNormalizer(patientFolder, extractorOutputPath);

    if (!result.success) {
      console.error('[FIELD_NORMALIZER_NODE] FieldNormalizer failed:', result.error);
      return {
        messages: [
          new AIMessage(`❌ FieldNormalizer failed: ${result.error}`)
        ],
        fieldNormalizerComplete: true  // Mark as complete to prevent loop
      };
    }

    console.log(`[FIELD_NORMALIZER_NODE] FieldNormalizer completed successfully`);
    console.log(`[FIELD_NORMALIZER_NODE] Output: ${result.outputPath}`);

    logNodeExecution('field_normalizer', 'deterministic', 1.0, {
      inputs: { patientFolder, inputPath: extractorOutputPath },
      outputs: { outputPath: result.outputPath }
    });

    return {
      messages: [
        new AIMessage(
          `✅ FieldNormalizer complete!\n` +
          `- Output: ${result.outputPath}`
        )
      ],
      fieldNormalizerComplete: true,
      fieldNormalizerOutputPath: result.outputPath
    };

  } catch (error) {
    console.error('[FIELD_NORMALIZER_NODE] Exception:', error);
    return {
      messages: [
        new AIMessage(
          `❌ FieldNormalizer failed: ${error instanceof Error ? error.message : String(error)}`
        )
      ],
      fieldNormalizerComplete: true  // Mark as complete to prevent loop
    };
  }
}

async function valueNormalizerNode(
  state: typeof AgentStateAnnotation.State,
  _config: RunnableConfig,
): Promise<typeof AgentStateAnnotation.Update> {
  console.log('[VALUE_NORMALIZER_NODE] ===== STARTING VALUE NORMALIZER =====');

  const patientFolder = state.patientApiDataFolder;
  const fieldNormalizerOutputPath = state.fieldNormalizerOutputPath;

  if (!patientFolder || !fieldNormalizerOutputPath) {
    console.error('[VALUE_NORMALIZER_NODE] Missing required inputs');
    return {
      messages: [
        new AIMessage('❌ ValueNormalizer failed: Missing patient folder or FieldNormalizer output path')
      ],
      valueNormalizerComplete: true  // Mark as complete to prevent loop
    };
  }

  console.log(`[VALUE_NORMALIZER_NODE] Patient folder: ${patientFolder}`);
  console.log(`[VALUE_NORMALIZER_NODE] Input: ${fieldNormalizerOutputPath}`);

  try {
    const result = await runValueNormalizer(patientFolder, fieldNormalizerOutputPath);

    if (!result.success) {
      console.error('[VALUE_NORMALIZER_NODE] ValueNormalizer failed:', result.error);
      return {
        messages: [
          new AIMessage(`❌ ValueNormalizer failed: ${result.error}`)
        ],
        valueNormalizerComplete: true  // Mark as complete to prevent loop
      };
    }

    console.log(`[VALUE_NORMALIZER_NODE] ValueNormalizer completed successfully`);
    console.log(`[VALUE_NORMALIZER_NODE] Output: ${result.outputPath}`);

    logNodeExecution('value_normalizer', 'deterministic', 1.0, {
      inputs: { patientFolder, inputPath: fieldNormalizerOutputPath },
      outputs: { outputPath: result.outputPath }
    });

    return {
      messages: [
        new AIMessage(
          `✅ ValueNormalizer complete!\n` +
          `- Output: ${result.outputPath}`
        )
      ],
      valueNormalizerComplete: true,
      valueNormalizerOutputPath: result.outputPath
    };

  } catch (error) {
    console.error('[VALUE_NORMALIZER_NODE] Exception:', error);
    return {
      messages: [
        new AIMessage(
          `❌ ValueNormalizer failed: ${error instanceof Error ? error.message : String(error)}`
        )
      ],
      valueNormalizerComplete: true  // Mark as complete to prevent loop
    };
  }
}

async function simplifierNode(
  state: typeof AgentStateAnnotation.State,
  _config: RunnableConfig,
): Promise<typeof AgentStateAnnotation.Update> {
  console.log('[SIMPLIFIER_NODE] ===== STARTING SIMPLIFIER =====');

  const patientFolder = state.patientApiDataFolder;
  const valueNormalizerOutputPath = state.valueNormalizerOutputPath;

  if (!patientFolder || !valueNormalizerOutputPath) {
    console.error('[SIMPLIFIER_NODE] Missing required inputs');
    return {
      messages: [
        new AIMessage('❌ Simplifier failed: Missing patient folder or ValueNormalizer output path')
      ],
      simplifierComplete: true  // Mark as complete to prevent loop
    };
  }

  console.log(`[SIMPLIFIER_NODE] Patient folder: ${patientFolder}`);
  console.log(`[SIMPLIFIER_NODE] Input: ${valueNormalizerOutputPath}`);

  try {
    const result = await runSimplifier(patientFolder, valueNormalizerOutputPath);

    if (!result.success) {
      console.error('[SIMPLIFIER_NODE] Simplifier failed:', result.error);
      return {
        messages: [
          new AIMessage(`❌ Simplifier failed: ${result.error}`)
        ],
        simplifierComplete: true  // Mark as complete to prevent loop
      };
    }

    console.log(`[SIMPLIFIER_NODE] Simplifier completed successfully`);
    console.log(`[SIMPLIFIER_NODE] Output: ${result.outputPath}`);

    logNodeExecution('simplifier', 'deterministic', 1.0, {
      inputs: { patientFolder, inputPath: valueNormalizerOutputPath },
      outputs: { outputPath: result.outputPath }
    });

    return {
      messages: [
        new AIMessage(
          `✅ Simplifier complete!\n` +
          `- Output: ${result.outputPath}`
        )
      ],
      simplifierComplete: true,
      simplifierOutputPath: result.outputPath
    };

  } catch (error) {
    console.error('[SIMPLIFIER_NODE] Exception:', error);
    return {
      messages: [
        new AIMessage(
          `❌ Simplifier failed: ${error instanceof Error ? error.message : String(error)}`
        )
      ],
      simplifierComplete: true  // Mark as complete to prevent loop
    };
  }
}

async function chunkerNode(
  state: typeof AgentStateAnnotation.State,
  _config: RunnableConfig,
): Promise<typeof AgentStateAnnotation.Update> {
  console.log('[CHUNKER_NODE] ===== STARTING CHUNKER =====');

  const patientFolder = state.patientApiDataFolder;
  const preParserOutputPath = state.preParserOutputPath;

  if (!patientFolder || !preParserOutputPath) {
    console.error('[CHUNKER_NODE] Missing required inputs');
    return {
      messages: [
        new AIMessage('❌ Chunker failed: Missing patient folder or PreParser output path')
      ],
      chunkerComplete: true  // Mark as complete to prevent loop
    };
  }

  console.log(`[CHUNKER_NODE] Patient folder: ${patientFolder}`);
  console.log(`[CHUNKER_NODE] Input markdown directory: ${preParserOutputPath}`);
  console.log(`[CHUNKER_NODE] NEW FLOW: PreParser → Chunker (with --markdown-dir argument)`);

  try {
    const result = await runChunker(patientFolder, preParserOutputPath);

    if (!result.success) {
      console.error('[CHUNKER_NODE] Chunker failed:', result.error);
      return {
        messages: [
          new AIMessage(`❌ Chunker failed: ${result.error}`)
        ],
        chunkerComplete: true  // Mark as complete to prevent loop
      };
    }

    console.log(`[CHUNKER_NODE] Chunker completed successfully`);
    console.log(`[CHUNKER_NODE] Output: ${result.outputPath}`);

    logNodeExecution('chunker', 'deterministic', 1.0, {
      inputs: { patientFolder, inputPath: preParserOutputPath },
      outputs: { outputPath: result.outputPath }
    });

    return {
      messages: [
        new AIMessage(
          `✅ Chunker complete!\n` +
          `- Input: PreParser markdown directory (${preParserOutputPath})\n` +
          `- Output: Chunked markdown directory (${result.outputPath})\n` +
          `- Flow: PreParser → Chunker (outputs markdown chunks)`
        )
      ],
      chunkerComplete: true,
      chunkerOutputPath: result.outputPath
    };

  } catch (error) {
    console.error('[CHUNKER_NODE] Exception:', error);
    return {
      messages: [
        new AIMessage(
          `❌ Chunker failed: ${error instanceof Error ? error.message : String(error)}`
        )
      ],
      chunkerComplete: true  // Mark as complete to prevent loop
    };
  }
}

async function embedderNode(
  state: typeof AgentStateAnnotation.State,
  _config: RunnableConfig,
): Promise<typeof AgentStateAnnotation.Update> {
  console.log('[EMBEDDER_NODE] ===== STARTING EMBEDDER =====');

  const patientFolder = state.patientApiDataFolder;
  const chunkerOutputPath = state.chunkerOutputPath;

  if (!patientFolder || !chunkerOutputPath) {
    console.error('[EMBEDDER_NODE] Missing required inputs');
    return {
      messages: [
        new AIMessage('❌ Embedder failed: Missing patient folder or Chunker output path')
      ],
      embedderComplete: true  // Mark as complete to prevent loop
    };
  }

  console.log(`[EMBEDDER_NODE] Patient folder: ${patientFolder}`);
  console.log(`[EMBEDDER_NODE] Input: Chunked markdown directory (${chunkerOutputPath})`);
  console.log(`[EMBEDDER_NODE] TRUE SEQUENTIAL PIPELINE: PreParser → Chunker → Embedder`);

  try {
    const result = await runEmbedder(patientFolder, chunkerOutputPath);

    if (!result.success) {
      console.error('[EMBEDDER_NODE] Embedder failed:', result.error);
      return {
        messages: [
          new AIMessage(`❌ Embedder failed: ${result.error}`)
        ],
        embedderComplete: true  // Mark as complete to prevent loop
      };
    }

    console.log(`[EMBEDDER_NODE] Embedder completed successfully`);
    console.log(`[EMBEDDER_NODE] Output: ${result.outputPath}`);

    logNodeExecution('embedder', 'deterministic', 1.0, {
      inputs: { patientFolder, inputPath: chunkerOutputPath },
      outputs: { outputPath: result.outputPath }
    });

    return {
      messages: [
        new AIMessage(
          `✅ Embedder complete!\n` +
          `- Input: Chunked markdown directory (${chunkerOutputPath})\n` +
          `- Output: ${result.outputPath}\n` +
          `- Flow: PreParser → Chunker → Embedder (true sequential pipeline)`
        )
      ],
      embedderComplete: true,
      embedderOutputPath: result.outputPath
    };

  } catch (error) {
    console.error('[EMBEDDER_NODE] Exception:', error);
    return {
      messages: [
        new AIMessage(
          `❌ Embedder failed: ${error instanceof Error ? error.message : String(error)}`
        )
      ],
      embedderComplete: true  // Mark as complete to prevent loop
    };
  }
}

// ---------------- Batch Launcher Nodes (Parallel Execution) ----------------
async function batch1LauncherNode(
  state: typeof AgentStateAnnotation.State,
  _config: RunnableConfig,
): Promise<Command> {
  console.log('[BATCH_1_LAUNCHER] ===== LAUNCHING BATCH 1 MAPPERS IN PARALLEL =====');
  console.log('[BATCH_1_LAUNCHER] Starting parallel execution of:');
  console.log('[BATCH_1_LAUNCHER]   - patient_info_mapper');
  console.log('[BATCH_1_LAUNCHER]   - insurance_info_mapper');

  logNodeExecution('batch1_launcher', 'deterministic', 1.0, {
    inputs: { batch: 'batch1', mappers: ['patient_info_mapper', 'insurance_info_mapper'] },
    outputs: { status: 'launching_parallel' }
  });

  // Use Command with Send objects to fan out to multiple mappers in parallel
  return new Command({
    goto: [
      new Send("patient_info_mapper", state),
      new Send("insurance_info_mapper", state)
    ]
  });
}

async function batch1CompletionNode(
  state: typeof AgentStateAnnotation.State,
  _config: RunnableConfig,
): Promise<typeof AgentStateAnnotation.Update> {
  console.log('[BATCH_1_COMPLETION] ===== CHECKING BATCH 1 COMPLETION =====');

  const batch1Complete = !!(
    state.confidenceScores?.extractedInfo &&
    state.confidenceScores?.insuranceInfo
  );

  console.log('[BATCH_1_COMPLETION] Patient info mapper complete:', !!state.confidenceScores?.extractedInfo);
  console.log('[BATCH_1_COMPLETION] Insurance info mapper complete:', !!state.confidenceScores?.insuranceInfo);
  console.log('[BATCH_1_COMPLETION] Batch 1 complete:', batch1Complete);

  if (batch1Complete) {
    console.log('[BATCH_1_COMPLETION] ✅ BATCH 1 COMPLETE - All mappers finished successfully');
  }

  logNodeExecution('batch1_completion', 'deterministic', 1.0, {
    inputs: {
      extractedInfo: !!state.confidenceScores?.extractedInfo,
      insuranceInfo: !!state.confidenceScores?.insuranceInfo
    },
    outputs: { batch1Complete }
  });

  return {
    messages: [
      new AIMessage(batch1Complete
        ? 'Batch 1 mappers completed in parallel: patient_info ✓, insurance_info ✓'
        : 'Batch 1 mappers still running...')
    ],
    mapperBatchesComplete: {
      ...state.mapperBatchesComplete,
      batch1: batch1Complete
    }
  };
}

async function batch2LauncherNode(
  state: typeof AgentStateAnnotation.State,
  _config: RunnableConfig,
): Promise<Command> {
  console.log('[BATCH_2_LAUNCHER] ===== LAUNCHING BATCH 2 MAPPERS IN PARALLEL =====');
  console.log('[BATCH_2_LAUNCHER] Starting parallel execution of:');
  console.log('[BATCH_2_LAUNCHER]   - coverage_and_benefits_mapper');
  console.log('[BATCH_2_LAUNCHER]   - orthodontic_benefits_mapper');
  console.log('[BATCH_2_LAUNCHER]   - waiting_periods_mapper');
  console.log('[BATCH_2_LAUNCHER]   - procedure_details_mapper');
  console.log('[BATCH_2_LAUNCHER]   - treatment_history_mapper');

  logNodeExecution('batch2_launcher', 'deterministic', 1.0, {
    inputs: { batch: 'batch2', mappers: ['coverage_and_benefits', 'orthodontic_benefits', 'waiting_periods', 'procedure_details', 'treatment_history'] },
    outputs: { status: 'launching_parallel' }
  });

  // Use Command with Send objects to fan out to multiple mappers in parallel
  return new Command({
    goto: [
      new Send("coverage_and_benefits_mapper", state),
      new Send("orthodontic_benefits_mapper", state),
      new Send("waiting_periods_mapper", state),
      new Send("procedure_details_mapper", state),
      new Send("treatment_history_mapper", state)
    ]
  });
}

async function batch2CompletionNode(
  state: typeof AgentStateAnnotation.State,
  _config: RunnableConfig,
): Promise<typeof AgentStateAnnotation.Update> {
  console.log('[BATCH_2_COMPLETION] ===== CHECKING BATCH 2 COMPLETION =====');

  const batch2Complete = !!(
    state.confidenceScores?.coverageBenefitsInfo &&
    state.confidenceScores?.orthodonticBenefitsInfo &&
    state.confidenceScores?.waitingPeriodsInfo &&
    state.confidenceScores?.procedureDetailsInfo &&
    state.confidenceScores?.treatmentHistoryInfo
  );

  console.log('[BATCH_2_COMPLETION] Coverage & benefits mapper complete:', !!state.confidenceScores?.coverageBenefitsInfo);
  console.log('[BATCH_2_COMPLETION] Orthodontic benefits mapper complete:', !!state.confidenceScores?.orthodonticBenefitsInfo);
  console.log('[BATCH_2_COMPLETION] Waiting periods mapper complete:', !!state.confidenceScores?.waitingPeriodsInfo);
  console.log('[BATCH_2_COMPLETION] Procedure details mapper complete:', !!state.confidenceScores?.procedureDetailsInfo);
  console.log('[BATCH_2_COMPLETION] Treatment history mapper complete:', !!state.confidenceScores?.treatmentHistoryInfo);
  console.log('[BATCH_2_COMPLETION] Batch 2 complete:', batch2Complete);

  if (batch2Complete) {
    console.log('[BATCH_2_COMPLETION] ✅ BATCH 2 COMPLETE - All mappers finished successfully');
  }

  logNodeExecution('batch2_completion', 'deterministic', 1.0, {
    inputs: {
      coverageBenefits: !!state.confidenceScores?.coverageBenefitsInfo,
      orthodontic: !!state.confidenceScores?.orthodonticBenefitsInfo,
      waitingPeriods: !!state.confidenceScores?.waitingPeriodsInfo,
      procedureDetails: !!state.confidenceScores?.procedureDetailsInfo,
      treatmentHistory: !!state.confidenceScores?.treatmentHistoryInfo
    },
    outputs: { batch2Complete }
  });

  return {
    messages: [
      new AIMessage(batch2Complete
        ? 'Batch 2 mappers completed in parallel: coverage_benefits ✓, orthodontic ✓, waiting_periods ✓, procedure_details ✓, treatment_history ✓'
        : 'Batch 2 mappers still running...')
    ],
    mapperBatchesComplete: {
      ...state.mapperBatchesComplete,
      batch2: batch2Complete
    }
  };
}

async function generateFormsNode(
  state: typeof AgentStateAnnotation.State,
  _config: RunnableConfig,
): Promise<typeof AgentStateAnnotation.Update> {
  const verificationData = state.verificationResult;

  console.log('[FORMS_NODE] ===== STARTING FORM GENERATION =====');
  console.log('[FORMS_NODE] verificationData keys:', Object.keys(verificationData || {}));
  console.log('[FORMS_NODE] patientApiDataFolder:', state.patientApiDataFolder);
  console.log('[FORMS_NODE] verificationData structure (first 1000 chars):', JSON.stringify(verificationData, null, 2).substring(0, 1000));

  const result = await generateFormsTool.invoke({
    verificationData: JSON.stringify(verificationData),
    format: 'all',
    patientApiDataFolder: state.patientApiDataFolder
  });

  console.log('[FORMS_NODE] ===== FORM GENERATION COMPLETE =====');
  console.log('[FORMS_NODE] Result type:', typeof result);
  console.log('[FORMS_NODE] Result (first 500 chars):', result.substring(0, 500));
  
  const parsedForms = JSON.parse(result);
  console.log('[FORMS_NODE] Parsed forms keys:', Object.keys(parsedForms));
  console.log('[FORMS_NODE] Form file paths:', JSON.stringify(parsedForms, null, 2));

  return {
    messages: [
      new AIMessage(`Forms generated: ${result}`)
    ],
    forms: parsedForms.file_paths || parsedForms
  };
}

async function humanReviewNode(
  state: typeof AgentStateAnnotation.State,
  _config: RunnableConfig,
): Promise<typeof AgentStateAnnotation.Update> {
  const verificationData = state.verificationResult;
  const forms = state.forms;

  console.log('[REVIEW_NODE] ===== STARTING FINAL REVIEW =====');
  console.log('[REVIEW_NODE] verificationData keys:', Object.keys(verificationData || {}));
  console.log('[REVIEW_NODE] forms keys:', Object.keys(forms || {}));
  console.log('[REVIEW_NODE] verificationData patient_name:', verificationData?.patient_name);
  console.log('[REVIEW_NODE] verificationData insurance_company:', verificationData?.insurance_company);
  console.log('[REVIEW_NODE] verificationData network_status:', verificationData?.network_status);
  console.log('[REVIEW_NODE] Full verificationData structure (first 1500 chars):');
  console.log(JSON.stringify(verificationData, null, 2).substring(0, 1500));

  const result = await humanReviewTool.invoke({
    verificationData: JSON.stringify(verificationData),
    forms: JSON.stringify(forms)
  });

  console.log('[REVIEW_NODE] ===== REVIEW COMPLETE =====');
  console.log('[REVIEW_NODE] Result type:', typeof result);
  console.log('[REVIEW_NODE] Result length:', result?.length);
  console.log('[REVIEW_NODE] Result preview (first 500 chars):');
  console.log(result?.substring(0, 500));

  const updateObject = {
    messages: [
      new AIMessage(result)
    ],
    output: result,
    completedAgents: [...(state.completedAgents || []), "HumanAgent"]
  };

  console.log('[REVIEW_NODE] ===== RETURNING STATE UPDATE =====');
  console.log('[REVIEW_NODE] Setting output to:', typeof result, `(${result?.length} chars)`);
  console.log('[REVIEW_NODE] State update keys:', Object.keys(updateObject));
  console.log('[REVIEW_NODE] State update output field:', updateObject.output ? 'SET' : 'NOT SET');

  return updateObject;
}

// ---------------- Routing Function ----------------
function routeFromSupervisor(state: typeof AgentStateAnnotation.State): string {
  const nextAgent = state.nextAgent;

  // Check if we should end
  if (nextAgent === END || nextAgent === "__end__") {
    console.log('[ROUTE] Supervisor decision: END → Workflow complete');
    return END;
  }

  const routeMap: { [key: string]: string } = {
    "extract_request_info": "extract_request_info",
    "extraction_graph": "extraction_graph",
    "preparser": "preparser",
    "extractor": "extractor",
    "field_normalizer": "field_normalizer",
    "value_normalizer": "value_normalizer",
    "simplifier": "simplifier",
    "chunker": "chunker",
    "embedder": "embedder",
    "aggregate_api_data": "aggregate_api_data",
    "batch1_launcher": "batch1_launcher",
    "batch2_launcher": "batch2_launcher",
    "patient_info_mapper": "patient_info_mapper",
    "insurance_info_mapper": "insurance_info_mapper",
    "coverage_and_benefits_mapper": "coverage_and_benefits_mapper",
    "orthodontic_benefits_mapper": "orthodontic_benefits_mapper",
    "waiting_periods_mapper": "waiting_periods_mapper",
    "procedure_details_mapper": "procedure_details_mapper",
    "treatment_history_mapper": "treatment_history_mapper",
    "skip_verification": "skip_verification",
    "generate_forms": "generate_forms",
    "qa_validation": "qa_validation",
    "human_review": "human_review"
  };

  const route = routeMap[nextAgent] || "human_review";
  console.log('[ROUTE] Supervisor decision:', nextAgent, '→ Going to:', route);
  return route;
}

// ---------------- Supervisor + Tool Node Graph ----------------
const workflow = new StateGraph(
  {
    stateSchema: AgentStateAnnotation,
    input: InputStateAnnotation,
    output: OutputStateAnnotation,
  },
  AgentConfigurationAnnotation
)
  .addNode("supervisor", supervisorNode)

  .addNode("extract_request_info", extractRequestInfoNode)
  .addNode("extraction_graph", extractionSubgraph)

  // Pipeline nodes
  .addNode("preparser", preParserNode)
  .addNode("extractor", extractorNode)
  .addNode("field_normalizer", fieldNormalizerNode)
  .addNode("value_normalizer", valueNormalizerNode)
  .addNode("simplifier", simplifierNode)
  .addNode("chunker", chunkerNode)
  .addNode("embedder", embedderNode)

  .addNode("aggregate_api_data", aggregateApiDataNode)

  // Batch launcher and completion nodes
  .addNode("batch1_launcher", batch1LauncherNode)
  .addNode("batch1_completion", batch1CompletionNode)
  .addNode("batch2_launcher", batch2LauncherNode)
  .addNode("batch2_completion", batch2CompletionNode)

  // Individual mapper nodes (called by batch launchers)
  .addNode("patient_info_mapper", patientInfoMapperNode)
  .addNode("insurance_info_mapper", insuranceInfoMapperNode)
  .addNode("coverage_and_benefits_mapper", coverageAndBenefitsMapperNode)
  .addNode("orthodontic_benefits_mapper", orthodonticBenefitsMapperNode)
  .addNode("waiting_periods_mapper", waitingPeriodsMapperNode)
  .addNode("procedure_details_mapper", procedureDetailsMapperNode)
  .addNode("treatment_history_mapper", treatmentHistoryMapperNode)

  .addNode("skip_verification", skipVerificationNode)
  .addNode("generate_forms", generateFormsNode)
  .addNode("qa_validation", qaValidationNode)
  .addNode("human_review", humanReviewNode)

    
  .addEdge(START, "extract_request_info")

  .addConditionalEdges("supervisor", routeFromSupervisor, {
    "extract_request_info": "extract_request_info",
    "extraction_graph": "extraction_graph",
    "preparser": "preparser",
    "extractor": "extractor",
    "field_normalizer": "field_normalizer",
    "value_normalizer": "value_normalizer",
    "simplifier": "simplifier",
    "chunker": "chunker",
    "embedder": "embedder",
    "aggregate_api_data": "aggregate_api_data",
    "batch1_launcher": "batch1_launcher",
    "batch2_launcher": "batch2_launcher",
    "patient_info_mapper": "patient_info_mapper",
    "insurance_info_mapper": "insurance_info_mapper",
    "coverage_and_benefits_mapper": "coverage_and_benefits_mapper",
    "orthodontic_benefits_mapper": "orthodontic_benefits_mapper",
    "waiting_periods_mapper": "waiting_periods_mapper",
    "procedure_details_mapper": "procedure_details_mapper",
    "treatment_history_mapper": "treatment_history_mapper",
    "skip_verification": "skip_verification",
    "generate_forms": "generate_forms",
    "qa_validation": "qa_validation",
    "human_review": "human_review",
    [END]: END
  })

  .addEdge("extract_request_info", "supervisor")
  .addEdge("extraction_graph", "supervisor")

  // Pipeline edges
  .addEdge("preparser", "supervisor")
  .addEdge("extractor", "supervisor")
  .addEdge("field_normalizer", "supervisor")
  .addEdge("value_normalizer", "supervisor")
  .addEdge("simplifier", "supervisor")
  .addEdge("chunker", "supervisor")
  .addEdge("embedder", "supervisor")

  .addEdge("aggregate_api_data", "supervisor")

  // Batch 1: launcher → completion → supervisor
  .addEdge("batch1_launcher", "batch1_completion")
  .addEdge("batch1_completion", "supervisor")

  // Batch 2: launcher → completion → supervisor
  .addEdge("batch2_launcher", "batch2_completion")
  .addEdge("batch2_completion", "supervisor")

  // Individual mappers no longer route back to supervisor (they're called by batch launchers)
  // The batch completion nodes handle routing back to supervisor after all mappers finish

  .addEdge("extraction_graph", "supervisor")
  .addEdge("skip_verification", "supervisor")
      .addEdge("generate_forms", "supervisor")
  .addEdge("qa_validation", "supervisor")
  .addEdge("human_review", "supervisor");

// Compile the graph WITHOUT checkpointing to avoid RangeError during MCP operations
// The LangGraph server's FileSystemPersistence tries to serialize the entire state including
// the MCP client's internal cache of tool responses, causing "Invalid string length" errors
// Disabling checkpointing prevents state serialization during MCP operations
export const graph = workflow
  .compile()
  .withConfig({ recursionLimit: 100 });

// Note: This workflow naturally requires ~30-35 steps due to:
// - BCBS/Delta scraping subgraph: ~10 steps
// - 2 mapper batches (parallel execution): ~4 steps (2 launchers + 2 completion checkers)
// - Supervisor routing: ~15 steps
// - Verification/cost analysis: ~5 steps
// - Forms + review: ~2 steps
// Total: ~36 steps minimum (reduced from ~44 via parallel batch execution)

// Default config for explicit programmatic invocations
export const defaultConfig = {
  recursionLimit: 100,
  runName: "supervisor_agent"
};