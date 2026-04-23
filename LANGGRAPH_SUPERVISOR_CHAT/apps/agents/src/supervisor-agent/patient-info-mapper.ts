import { loadChatModel } from "../shared/utils.js";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import { RunnableConfig } from "@langchain/core/runnables";
import * as fs from "fs/promises";
import { logNodeExecution } from "../shared/logging.js";
import { ensureAgentConfiguration } from "./configuration.js";
import type { WorkflowStateType } from "../shared/workflow-state.js";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { validatePatientFieldTool, submitExtractedDataTool } from "./patient-info-mapper-tools.js";
import { saveExtractionMetadata, type MapperMetadata } from "../shared/metadata-utils.js";
import { getRelevantFeedback } from "../shared/feedback-rag.js";

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

interface FieldCandidate {
  value: string;
  path: string;
  score: number;
  reason: string;
}

interface FieldMapping {
  field: string;
  aliases: string[];
  validator: (value: any) => boolean;
  pattern?: RegExp;
}

export async function patientInfoMapperNode(
  state: WorkflowStateType,
  config: RunnableConfig,
): Promise<Partial<WorkflowStateType>> {
  console.log('[PATIENT_INFO_MAPPER] Starting patient info extraction using PostgreSQL semantic search');

  const patientApiDataFolder = state.patientApiDataFolder;
  if (!patientApiDataFolder) {
    throw new Error('Patient API data folder not set in state');
  }

  console.log(`[PATIENT_INFO_MAPPER] Patient folder: ${patientApiDataFolder}`);
  console.log(`[PATIENT_INFO_MAPPER] NEW FLOW: Querying PostgreSQL semantic search instead of reading JSON files`);

  const configuration = ensureAgentConfiguration(config);
  const model = await loadChatModel(configuration.model);

  const { postgresSemanticSearchTool } = await import("../shared/postgres-semantic-search.js");
  const { validatePatientFieldTool, submitExtractedDataTool } = await import("./patient-info-mapper-tools.js");
  const tools = [postgresSemanticSearchTool, validatePatientFieldTool, submitExtractedDataTool];
  
  const agent = createReactAgent({ llm: model, tools });
  
  let relevantFeedback = [];
  try {
    const provider = state.extractedInfo?.insurance_provider || 'Unknown';
    const officeKey = state.officeKey || state.extractedInfo?.office_key;
    // Prefer portal version over portal type for maximum precision
    const portalVersion = state.portalVersion || state.extractedInfo?.portal_version;
    const portalType = portalVersion || state.portalType || state.extractedInfo?.portal_type;

    relevantFeedback = await getRelevantFeedback({
      mapper: 'patient_info_mapper',
      provider,
      field: 'all',
      currentContext: `Extracting patient info for ${state.extractedInfo?.patient_name || 'patient'} from ${provider}`,
      limit: 5,
      officeId: officeKey,
      portalType: portalType,  // Now contains version if available (e.g., 'bcbs_ca' instead of 'bcbs')
    });
    if (relevantFeedback.length > 0) {
      console.log(`[PATIENT_INFO_MAPPER] 📚 Retrieved ${relevantFeedback.length} relevant past corrections from RAG (Office: ${officeKey || 'N/A'}, Portal: ${portalType || 'N/A'})`);
    }
  } catch (error) {
    console.error('[PATIENT_INFO_MAPPER] ⚠️ Failed to retrieve feedback from RAG (continuing without):', error);
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
  
  const agentPrompt = `You need to extract patient information and fill this schema:

{
  patientName: string | null,
  patientDOB: string | null,
  subscriberName: string | null,
  subscriberDOB: string | null,
  memberId: string | null,
  groupNumber: string | null
}

Available tools to help you:
- postgres_semantic_search: Query the database for patient data (use queries like "patient name", "date of birth", "member ID", etc.)
- submit_extracted_data: Submit your final answer with the filled schema

Patient folder: ${patientApiDataFolder}${feedbackSection}

Use the tools to find the data, then submit your results.`;

  console.log('[PATIENT_INFO_MAPPER] ═══════════════════════════════════════════');
  console.log('[PATIENT_INFO_MAPPER] Starting ReAct Agent (NEW FLOW: PostgreSQL semantic search)');
  console.log('[PATIENT_INFO_MAPPER] Available tools:');
  console.log('[PATIENT_INFO_MAPPER]   • postgres_semantic_search - Semantic search in PostgreSQL vector DB');
  console.log('[PATIENT_INFO_MAPPER]   • validate_patient_field - Validate extracted values');
  console.log('[PATIENT_INFO_MAPPER]   • submit_extracted_data - Submit final JSON result (REQUIRED)');
  console.log('[PATIENT_INFO_MAPPER] ═══════════════════════════════════════════\n');

  let agentResult;
  try {
    agentResult = await agent.invoke(
      {
        messages: [
          new SystemMessage('You are a data extraction assistant. Use the available tools to complete the task.'),
          new HumanMessage(agentPrompt)
        ]
      },
      {
        recursionLimit: 25
      }
    );
  } catch (err: any) {
    console.warn('[PATIENT_INFO_MAPPER] Agent stopped (possibly hit recursion limit):', err.message);
    agentResult = { messages: [] };
  }
  
  console.log('[PATIENT_INFO_MAPPER] ═══════════════════════════════════════════');
  console.log('[PATIENT_INFO_MAPPER] Agent execution trace:');
  console.log('[PATIENT_INFO_MAPPER] ═══════════════════════════════════════════');
  
  for (let i = 0; i < agentResult.messages.length; i++) {
    const msg = agentResult.messages[i];
    const role = msg._getType?.() || msg.constructor?.name?.replace('Message', '').toLowerCase() || 'unknown';
    
    if (role === 'ai') {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      
      // Check if this is a tool call
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const toolCall of msg.tool_calls) {
          console.log(`\n[PATIENT_INFO_MAPPER] 🔧 Tool Call #${i}:`);
          console.log(`[PATIENT_INFO_MAPPER]    Tool: ${toolCall.name}`);
          console.log(`[PATIENT_INFO_MAPPER]    Args: ${JSON.stringify(toolCall.args, null, 2).replace(/\n/g, '\n[PATIENT_INFO_MAPPER]          ')}`);
        }
      } else {
        console.log(`\n[PATIENT_INFO_MAPPER] 💭 Agent Reasoning #${i}:`);
        console.log(`[PATIENT_INFO_MAPPER]    ${content.substring(0, 500).replace(/\n/g, '\n[PATIENT_INFO_MAPPER]    ')}`);
      }
    } else if (role === 'tool') {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      console.log(`\n[PATIENT_INFO_MAPPER] ✅ Tool Result #${i}:`);
      console.log(`[PATIENT_INFO_MAPPER]    ${content.substring(0, 300).replace(/\n/g, '\n[PATIENT_INFO_MAPPER]    ')}`);
    }
  }
  
  const finalMessage = agentResult.messages[agentResult.messages.length - 1];
  const agentResponse = typeof finalMessage.content === 'string' ? finalMessage.content : JSON.stringify(finalMessage.content);
  
  console.log('\n[PATIENT_INFO_MAPPER] ═══════════════════════════════════════════');
  console.log('[PATIENT_INFO_MAPPER] 🎯 Final Agent Response:');
  console.log('[PATIENT_INFO_MAPPER] ═══════════════════════════════════════════');
  console.log(agentResponse);
  console.log('[PATIENT_INFO_MAPPER] ═══════════════════════════════════════════\n');
  
  // Extract structured data from submit_extracted_data tool call
  const { result, metadata } = extractSubmittedData(agentResult.messages);
  
  let finalResult = result;
  let finalMetadata = metadata;
  
  if (finalResult.confidence === 0) {
    console.log('[PATIENT_INFO_MAPPER] ⚠ Agent did not submit data - extracting deterministically as fallback');
    finalResult = await extractPatientDataDeterministically(patientApiDataFolder, agentResult.messages);
    finalMetadata = null;
  }
  
  // Save extraction metadata if available
  if (finalMetadata) {
    try {
      await saveExtractionMetadata(finalMetadata, patientApiDataFolder);
      console.log('[PATIENT_INFO_MAPPER] ✅ Saved extraction metadata');
    } catch (error) {
      console.error('[PATIENT_INFO_MAPPER] ❌ Failed to save extraction metadata:', error);
    }
  }
  
  console.log('[PATIENT_INFO_MAPPER] Extraction complete:', {
    confidence: finalResult.confidence,
    fieldsFound: Object.keys(finalResult.foundPaths || {}).length
  });

  logNodeExecution('patient_info_mapper', finalResult.confidence > 0.8 ? 'deterministic' : 'llm_based', finalResult.confidence, {
    inputs: { source: 'aggregated_flattened.json' },
    outputs: { 
      patientName: finalResult.patientName,
      memberId: finalResult.memberId,
      groupNumber: finalResult.groupNumber
    }
  });

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
        source: finalResult.reasoning?.includes('deterministic fallback') ? 'deterministic' : 'llm_extraction',
        timestamp: new Date().toISOString()
      }
    }
  };
}

function extractSubmittedData(messages: any[]): { result: PatientInfoResult; metadata: MapperMetadata | null } {
  // Find the submit_extracted_data tool call and its result
  let submittedData: any = null;
  let extractionMetadata: any = null;
  let avgConfidence = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];

    // Check if this is a tool result from submit_extracted_data
    if (msg._getType?.() === 'tool' || msg.constructor?.name === 'ToolMessage') {
      try {
        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        const parsed = JSON.parse(content);

        if (parsed.extractedData) {
          submittedData = parsed.extractedData;
          extractionMetadata = parsed.extractionMetadata;
          avgConfidence = parsed.avgConfidence || 0;
          break;
        }
      } catch (err) {
        // Not the right tool result, continue
      }
    }
  }

  if (!submittedData) {
    console.warn('[PATIENT_INFO_MAPPER] No submit_extracted_data tool call found - agent did not submit results properly');
    return {
      result: {
        patientName: null,
        patientDOB: null,
        subscriberName: null,
        subscriberDOB: null,
        memberId: null,
        groupNumber: null,
        confidence: 0,
        reasoning: "Agent failed to submit structured data via submit_extracted_data tool"
      },
      metadata: null
    };
  }

  // Extract validation warnings from validate_patient_field tool calls
  const validationResults: Record<string, any> = {};
  for (const msg of messages) {
    if (msg.name === 'validate_patient_field') {
      try {
        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        const result = JSON.parse(content);
        validationResults[result.fieldName] = {
          isValid: result.isValid,
          confidence: result.confidence,
          warnings: result.validations
        };
      } catch (err) {
        // Ignore parsing errors
      }
    }
  }

  // Merge validation results into metadata
  if (extractionMetadata) {
    for (const [fieldName, fieldData] of Object.entries(extractionMetadata)) {
      if (validationResults[fieldName]) {
        (fieldData as any).validationWarnings = validationResults[fieldName].warnings;
        (fieldData as any).isValid = validationResults[fieldName].isValid;

        // Use lower of LLM confidence and validation confidence
        const llmConfidence = (fieldData as any).confidence || 0.5;
        const valConfidence = validationResults[fieldName].confidence || 1.0;
        (fieldData as any).confidence = Math.min(llmConfidence, valConfidence);
      }
    }

    // Recalculate average confidence after validation adjustments
    const confidences = Object.values(extractionMetadata)
      .filter((meta: any) => submittedData[Object.keys(extractionMetadata).find(k => extractionMetadata[k] === meta)!] !== null)
      .map((meta: any) => meta.confidence);

    if (confidences.length > 0) {
      avgConfidence = confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
    }
  }

  const fieldsFound = Object.values(submittedData).filter(v => v !== null && v !== undefined).length;

  const metadata: MapperMetadata | null = extractionMetadata ? {
    mapperName: 'patient_info_mapper',
    timestamp: new Date().toISOString(),
    confidence: avgConfidence,
    fields: extractionMetadata
  } : null;

  return {
    result: {
      patientName: submittedData.patientName || null,
      patientDOB: submittedData.patientDOB || null,
      subscriberName: submittedData.subscriberName || null,
      subscriberDOB: submittedData.subscriberDOB || null,
      memberId: submittedData.memberId || null,
      groupNumber: submittedData.groupNumber || null,
      confidence: avgConfidence,
      reasoning: `Extracted ${fieldsFound}/6 fields via submit_extracted_data tool (avg confidence: ${(avgConfidence * 100).toFixed(0)}%)`
    },
    metadata
  };
}

class PatientInfoMapperAgent {
  private readonly fieldMappings: FieldMapping[] = [
    {
      field: "patientName",
      aliases: [
        "firstname", "lastname", "patient_name", "patientname", "member_name", "membername",
        "insured_name", "insuredname", "full_name", "fullname",
        "patient_full_name", "patientfullname"
      ],
      validator: (v) => typeof v === "string" && /^[A-Z][A-Za-z\-']+$/.test(v) && v.length >= 2 && v.length <= 30 && !v.includes('COMPANY') && !v.includes('CORP') && !v.includes('LLC') && !v.includes('INC'),
      pattern: /^[A-Z][A-Za-z\-']+$/
    },
    {
      field: "patientDOB",
      aliases: [
        "patient_dob", "patientdob", "dob", "date_of_birth", "dateofbirth",
        "birth_date", "birthdate", "member_dob", "memberdob", "patient_date_of_birth"
      ],
      validator: (v) => typeof v === "string" && /\d{4}-\d{2}-\d{2}/.test(v),
      pattern: /\d{4}-\d{2}-\d{2}/
    },
    {
      field: "subscriberName",
      aliases: [
        "subscriberfirstname", "subscriberlastname", "subscriber_name", "subscribername",
        "policy_holder", "policyholder", "contract_holder", "contractholder",
        "primary_name", "primaryname", "guarantor_name", "guarantorname"
      ],
      validator: (v) => typeof v === "string" && /^[A-Z][A-Za-z\-']+$/.test(v) && v.length >= 2 && v.length <= 30 && !v.includes('COMPANY') && !v.includes('CORP') && !v.includes('LLC') && !v.includes('INC'),
      pattern: /^[A-Z][A-Za-z\-']+$/
    },
    {
      field: "subscriberDOB",
      aliases: [
        "subscriber_dob", "subscriberdob", "insured_dob", "insureddob",
        "policy_holder_dob", "policyholderdob", "primary_dob", "primarydob"
      ],
      validator: (v) => typeof v === "string" && /\d{4}-\d{2}-\d{2}/.test(v),
      pattern: /\d{4}-\d{2}-\d{2}/
    },
    {
      field: "memberId",
      aliases: [
        "subscriber_id", "subscriberid", "member_number", "membernumber",
        "id_number", "idnumber", "policy_number", "policynumber",
        "insured_id", "insuredid",
        "identification_number", "identificationnumber", "card_number", "cardnumber"
      ],
      validator: (v) => typeof v === "string" && /^[A-Z0-9]{5,}$/i.test(v),
      pattern: /[A-Z0-9]{5,}/i
    },
    {
      field: "groupNumber",
      aliases: [
        "group_number", "groupnumber", "group_id", "groupid",
        "group", "employer_group", "employergroup", "plan_group", "plangroup",
        "group_code", "groupcode"
      ],
      validator: (v) => typeof v === "string" && /^[A-Z0-9]{3,}$/i.test(v),
      pattern: /[A-Z0-9]{3,}/i
    }
  ];

  private regexTool = new RegexTool();
  private jsonExplorer = new JSONExplorer();
  private candidateEvaluator = new CandidateEvaluator(this.fieldMappings);
  private confidenceScorer = new ConfidenceScorer();

  async analyze(jsonFiles: (string | object)[], modelName: string = "openai/gpt-4o-mini"): Promise<PatientInfoResult> {
    const jsonObjects = await this.loadJsonFiles(jsonFiles);
    
    const candidates: Record<string, FieldCandidate[]> = {};
    const fieldNames = this.fieldMappings.map(m => m.field);
    
    for (const field of fieldNames) {
      candidates[field] = [];
    }

    for (const [source, json] of Object.entries(jsonObjects)) {
      for (const fieldMapping of this.fieldMappings) {
        const found = this.jsonExplorer.findCandidates(json, fieldMapping, source);
        candidates[fieldMapping.field].push(...found);
      }
      
      const regexMatches = this.regexTool.searchAll(JSON.stringify(json, null, 2), this.fieldMappings);
      for (const [field, matches] of Object.entries(regexMatches)) {
        matches.forEach((match, idx) => {
          candidates[field].push({
            value: match,
            path: `${source}:regex_match_${idx}`,
            score: 0.3,
            reason: "Regex pattern match in JSON text"
          });
        });
      }
    }

    const scored: Record<string, FieldCandidate[]> = {};
    for (const field of fieldNames) {
      scored[field] = this.candidateEvaluator.rankCandidates(candidates[field], field);
    }

    const bestMatches: Record<string, FieldCandidate | null> = {};
    for (const field of fieldNames) {
      bestMatches[field] = scored[field][0] || null;
    }

    const lowConfidenceFields = fieldNames.filter(
      field => !bestMatches[field] || bestMatches[field]!.score < 0.8
    );

    let llmReasoning = "";
    if (lowConfidenceFields.length > 0) {
      const llmResult = await this.invokeLLM(jsonObjects, scored, lowConfidenceFields, modelName);
      if (llmResult) {
        for (const field of lowConfidenceFields) {
          if (llmResult.fields[field]) {
            bestMatches[field] = {
              value: llmResult.fields[field].value,
              path: llmResult.fields[field].path || "llm_inference",
              score: 0.9,
              reason: llmResult.fields[field].reasoning || "LLM inference"
            };
          }
        }
        llmReasoning = llmResult.reasoning;
      }
    }

    // Post-process: combine firstName + lastName if we found them separately
    const combinedResults = this.combineNameFields(jsonObjects, bestMatches);

    const overallConfidence = this.confidenceScorer.calculateOverallConfidence(combinedResults);

    const foundPaths: Record<string, string> = {};
    for (const [field, candidate] of Object.entries(combinedResults)) {
      if (candidate) {
        foundPaths[field] = candidate.path;
      }
    }

    return {
      patientName: combinedResults.patientName?.value || null,
      patientDOB: combinedResults.patientDOB?.value || null,
      subscriberName: combinedResults.subscriberName?.value || null,
      subscriberDOB: combinedResults.subscriberDOB?.value || null,
      memberId: combinedResults.memberId?.value || null,
      groupNumber: combinedResults.groupNumber?.value || null,
      confidence: overallConfidence,
      sourceFile: Object.keys(jsonObjects)[0],
      foundPaths,
      reasoning: llmReasoning
    };
  }

  private combineNameFields(
    jsonObjects: Record<string, any>,
    matches: Record<string, FieldCandidate | null>
  ): Record<string, FieldCandidate | null> {
    const result = { ...matches };

    // Try to find firstName + lastName pairs for patient
    for (const [source, json] of Object.entries(jsonObjects)) {
      const firstName = this.findValueByKey(json, ['firstname', 'first_name']);
      const lastName = this.findValueByKey(json, ['lastname', 'last_name']);
      
      if (firstName && lastName && this.isValidName(firstName) && this.isValidName(lastName)) {
        const fullName = `${firstName} ${lastName}`;
        result.patientName = {
          value: fullName,
          path: `${source}:firstName+lastName`,
          score: 0.95,
          reason: "Combined firstName and lastName fields"
        };
      }

      // Try to find subscriberFirstName + subscriberLastName
      const subFirst = this.findValueByKey(json, ['subscriberfirstname', 'subscriber_first_name']);
      const subLast = this.findValueByKey(json, ['subscriberlastname', 'subscriber_last_name']);
      
      if (subFirst && subLast && this.isValidName(subFirst) && this.isValidName(subLast)) {
        const fullName = `${subFirst} ${subLast}`;
        result.subscriberName = {
          value: fullName,
          path: `${source}:subscriberFirstName+subscriberLastName`,
          score: 0.95,
          reason: "Combined subscriber firstName and lastName fields"
        };
      }
    }

    return result;
  }

  private findValueByKey(obj: any, keys: string[]): string | null {
    if (!obj || typeof obj !== 'object') return null;

    const normalizedKeys = keys.map(k => k.toLowerCase().replace(/[_\s-]/g, ''));
    
    for (const [key, value] of Object.entries(obj)) {
      const normalizedKey = key.toLowerCase().replace(/[_\s-]/g, '');
      if (normalizedKeys.includes(normalizedKey) && typeof value === 'string') {
        return value;
      }
    }

    // Recurse into nested objects
    for (const value of Object.values(obj)) {
      if (typeof value === 'object' && value !== null) {
        const found = this.findValueByKey(value, keys);
        if (found) return found;
      }
    }

    return null;
  }

  private isValidName(name: string): boolean {
    return /^[A-Z][A-Za-z\-']+$/.test(name) && 
           name.length >= 2 && 
           name.length <= 30 &&
           !name.includes('COMPANY') && 
           !name.includes('CORP') && 
           !name.includes('LLC') && 
           !name.includes('INC');
  }

  private async loadJsonFiles(files: (string | object)[]): Promise<Record<string, any>> {
    const result: Record<string, any> = {};
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (typeof file === "string") {
        try {
          const content = await fs.readFile(file, "utf-8");
          result[file] = JSON.parse(content);
        } catch (err) {
          console.warn(`Failed to load ${file}:`, err);
        }
      } else {
        result[`object_${i}`] = file;
      }
    }
    
    return result;
  }

  private async invokeLLM(
    jsonObjects: Record<string, any>,
    candidates: Record<string, FieldCandidate[]>,
    fields: string[],
    modelName: string
  ): Promise<{ fields: Record<string, { value: string; path?: string; reasoning?: string }>; reasoning: string } | null> {
    try {
      const model = await loadChatModel(modelName);
      
      const systemPrompt = `You are a JSON field mapping expert specializing in extracting patient and insurance information from arbitrary portal data structures.

Your task is to identify the correct values for these fields from the provided JSON data:
${fields.join(", ")}

Guidelines:
- Patient names are typically in ALL CAPS or Title Case format
- Dates of birth follow YYYY-MM-DD format
- Member IDs and Group Numbers are alphanumeric codes
- Subscriber is the policy holder (may differ from patient)
- Use context clues like field names, nested structures, and related values
- Return your analysis in JSON format

Return format:
{
  "fields": {
    "fieldName": {
      "value": "extracted value",
      "path": "json.path.to.field",
      "reasoning": "why you chose this value"
    }
  },
  "reasoning": "overall explanation of your analysis"
}`;

      const candidateSummary = fields.map(field => {
        const cands = candidates[field] || [];
        return `\n${field}:\n${cands.slice(0, 5).map(c => 
          `  - "${c.value}" (score: ${c.score.toFixed(2)}, from: ${c.path})`
        ).join("\n")}`;
      }).join("\n");

      const userPrompt = `Analyze these JSON structures and candidate values to extract patient information:

JSON Data:
${JSON.stringify(jsonObjects, null, 2).slice(0, 8000)}

Candidate values found by deterministic matching:
${candidateSummary}

Which values are correct for: ${fields.join(", ")}?`;

      const response = await model.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt)
      ]);

      const content = typeof response.content === "string" 
        ? response.content 
        : JSON.stringify(response.content);
      
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      return null;
    } catch (err) {
      console.warn("LLM invocation failed:", err);
      return null;
    }
  }
}

class RegexTool {
  searchAll(text: string, fieldMappings: FieldMapping[]): Record<string, string[]> {
    const results: Record<string, string[]> = {};
    
    for (const mapping of fieldMappings) {
      if (mapping.pattern) {
        const matches = text.match(new RegExp(mapping.pattern, "g")) || [];
        results[mapping.field] = matches;
      }
    }
    
    return results;
  }
}

class JSONExplorer {
  findCandidates(
    obj: any,
    fieldMapping: FieldMapping,
    sourceName: string,
    currentPath = "root"
  ): FieldCandidate[] {
    const candidates: FieldCandidate[] = [];
    
    if (obj === null || obj === undefined) {
      return candidates;
    }
    
    if (typeof obj === "object" && !Array.isArray(obj)) {
      for (const [key, value] of Object.entries(obj)) {
        const normalizedKey = key.toLowerCase().replace(/[_\s-]/g, "");
        const path = `${currentPath}.${key}`;
        
        for (const alias of fieldMapping.aliases) {
          const normalizedAlias = alias.toLowerCase().replace(/[_\s-]/g, "");
          if (normalizedKey.includes(normalizedAlias) || normalizedAlias.includes(normalizedKey)) {
            if (fieldMapping.validator(value)) {
              candidates.push({
                value: String(value),
                path: `${sourceName}:${path}`,
                score: this.calculateKeyMatchScore(normalizedKey, normalizedAlias),
                reason: `Key match: "${key}" matches alias "${alias}"`
              });
            }
          }
        }
        
        candidates.push(...this.findCandidates(value, fieldMapping, sourceName, path));
      }
    } else if (Array.isArray(obj)) {
      obj.forEach((item, idx) => {
        candidates.push(...this.findCandidates(item, fieldMapping, sourceName, `${currentPath}[${idx}]`));
      });
    } else {
      if (fieldMapping.validator(obj)) {
        candidates.push({
          value: String(obj),
          path: `${sourceName}:${currentPath}`,
          score: 0.2,
          reason: "Value pattern match without key context"
        });
      }
    }
    
    return candidates;
  }

  private calculateKeyMatchScore(key: string, alias: string): number {
    if (key === alias) return 1.0;
    if (key.includes(alias) || alias.includes(key)) return 0.8;
    
    const keyWords = key.split(/(?=[A-Z])|_|-/).filter(Boolean);
    const aliasWords = alias.split(/(?=[A-Z])|_|-/).filter(Boolean);
    const commonWords = keyWords.filter(w => aliasWords.includes(w));
    
    if (commonWords.length > 0) {
      return 0.6 + (commonWords.length / Math.max(keyWords.length, aliasWords.length)) * 0.2;
    }
    
    return 0.4;
  }
}

class CandidateEvaluator {
  constructor(private fieldMappings: FieldMapping[]) {}

  rankCandidates(candidates: FieldCandidate[], field: string): FieldCandidate[] {
    const mapping = this.fieldMappings.find(m => m.field === field);
    if (!mapping) return candidates;

    const enhanced = candidates.map(c => {
      let score = c.score;
      
      if (mapping.pattern && mapping.pattern.test(c.value)) {
        score += 0.2;
      }
      
      if (c.path.includes(field)) {
        score += 0.15;
      }
      
      const valueWords = c.value.toLowerCase().split(/\s+/);
      if (valueWords.length >= 2 && valueWords.length <= 5) {
        score += 0.05;
      }
      
      return { ...c, score: Math.min(score, 1.0) };
    });

    enhanced.sort((a, b) => b.score - a.score);
    
    const deduped: FieldCandidate[] = [];
    const seen = new Set<string>();
    
    for (const candidate of enhanced) {
      const normalized = candidate.value.toLowerCase().trim();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        deduped.push(candidate);
      }
    }
    
    return deduped;
  }
}

class ConfidenceScorer {
  calculateOverallConfidence(matches: Record<string, FieldCandidate | null>): number {
    const scores = Object.values(matches)
      .filter((m): m is FieldCandidate => m !== null)
      .map(m => m.score);
    
    if (scores.length === 0) return 0;
    
    const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    const coverage = scores.length / 6;
    
    return avgScore * 0.7 + coverage * 0.3;
  }
}

async function extractPatientDataDeterministically(
  folderPath: string,
  agentMessages: any[]
): Promise<PatientInfoResult> {
  console.log('[PATIENT_INFO_MAPPER] Running deterministic extraction fallback from PostgreSQL search results');

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
    patientName: null,
    patientDOB: null,
    subscriberName: null,
    subscriberDOB: null,
    memberId: null,
    groupNumber: null
  };

  // Extract data from semantic search results
  for (const result of searchResults) {
    const text = result.text?.toLowerCase() || '';
    const chunkText = result.text || '';

    // Simple pattern matching on the chunk text
    if (!extractedData.patientName && (text.includes('patient name') || text.includes('member name'))) {
      // Try to extract name after "Patient Name:" or similar
      const nameMatch = chunkText.match(/patient\s+name[:\s]+([A-Z][A-Za-z\s]+)/i);
      if (nameMatch) extractedData.patientName = nameMatch[1].trim();
    }

    if (!extractedData.patientDOB && (text.includes('patient') && (text.includes('dob') || text.includes('birth')))) {
      const dobMatch = chunkText.match(/(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})/);
      if (dobMatch) extractedData.patientDOB = dobMatch[1];
    }

    if (!extractedData.subscriberName && (text.includes('subscriber') || text.includes('policy holder')) && text.includes('name')) {
      const nameMatch = chunkText.match(/subscriber\s+name[:\s]+([A-Z][A-Za-z\s]+)/i);
      if (nameMatch) extractedData.subscriberName = nameMatch[1].trim();
    }

    if (!extractedData.memberId && (text.includes('member id') || text.includes('subscriber id'))) {
      const idMatch = chunkText.match(/[A-Z0-9]{5,}/);
      if (idMatch) extractedData.memberId = idMatch[0];
    }

    if (!extractedData.groupNumber && text.includes('group')) {
      const groupMatch = chunkText.match(/group\s+(?:number|#)[:\s]+([A-Z0-9]+)/i);
      if (groupMatch) extractedData.groupNumber = groupMatch[1];
    }
  }

  const fieldsFound = Object.values(extractedData).filter(v => v !== null).length;

  console.log(`[PATIENT_INFO_MAPPER] Deterministic extraction found ${fieldsFound}/6 fields from ${searchResults.length} search results`);

  return {
    ...extractedData,
    confidence: fieldsFound / 6,
    reasoning: `Extracted ${fieldsFound}/6 fields via deterministic fallback from PostgreSQL semantic search results`
  };
}
