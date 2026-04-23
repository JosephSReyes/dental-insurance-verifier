import { RunnableConfig } from "@langchain/core/runnables";
import * as fs from "fs/promises";
import { AIMessage } from "@langchain/core/messages";
import type { WorkflowStateType } from "../shared/workflow-state.js";
import { flattenJson } from "../shared/json-flattener-tool.js";
import { aggregateByDomain, getAggregationStats } from "../shared/intelligent-aggregator-tool.js";
import { logNodeExecution } from "../shared/logging.js";
import { extractAllProcedureCodes } from "./procedure-code-extractor.js";

export async function aggregateApiDataNode(
  state: WorkflowStateType,
  config: RunnableConfig,
): Promise<Partial<WorkflowStateType>> {
  console.log('[AGGREGATE_API_DATA] Starting intelligent domain-based aggregation');
  
  let patientApiDataFolder = state.patientApiDataFolder;
  if (!patientApiDataFolder) {
    throw new Error('Patient API data folder not set in state');
  }

  const pathModule = await import('path');
  if (!pathModule.isAbsolute(patientApiDataFolder)) {
    const baseDir = process.cwd();
    patientApiDataFolder = pathModule.join(baseDir, 'patient_data', patientApiDataFolder);
  }

  console.log(`[AGGREGATE_API_DATA] Processing folder: ${patientApiDataFolder}`);

  const allFiles = await fs.readdir(patientApiDataFolder);
  const jsonFiles = allFiles.filter(f => 
    f.endsWith('.json') && 
    !f.includes('aggregated') &&
    !f.includes('flattened')
  );

  console.log(`[AGGREGATE_API_DATA] Found ${jsonFiles.length} raw API JSON files`);
  
  console.log('[AGGREGATE_API_DATA] ═══════════════════════════════════════════');
  console.log('[AGGREGATE_API_DATA] STEP 1: Load Raw API Files (Keep Originals)');
  console.log('[AGGREGATE_API_DATA] ═══════════════════════════════════════════');
  
  const loadedFiles: Array<{ fileName: string; data: any }> = [];
  
  for (const fileName of jsonFiles) {
    const filePath = pathModule.join(patientApiDataFolder, fileName);
    console.log(`[AGGREGATE_API_DATA]   Loading: ${fileName}`);
    
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      
      const actualData = parsed.data || parsed;
      
      loadedFiles.push({ fileName, data: actualData });
      console.log(`[AGGREGATE_API_DATA]      ✓ Loaded successfully`);
    } catch (err) {
      console.warn(`[AGGREGATE_API_DATA]      ✗ Failed to load ${fileName}:`, err);
    }
  }
  
  console.log('\n[AGGREGATE_API_DATA] ═══════════════════════════════════════════');
  console.log('[AGGREGATE_API_DATA] STEP 2: Aggregate by Domain');
  console.log('[AGGREGATE_API_DATA] ═══════════════════════════════════════════');
  
  const aggregated = aggregateByDomain(loadedFiles);
  const stats = getAggregationStats(aggregated);
  
  console.log(`[AGGREGATE_API_DATA]   Provider Detected: ${stats.provider}`);
  console.log(`[AGGREGATE_API_DATA]   Source Files: ${stats.sourceFileCount}`);
  console.log(`[AGGREGATE_API_DATA]   Total Fields: ${stats.totalFields}`);
  console.log(`[AGGREGATE_API_DATA]   By Domain:`);
  console.log(`[AGGREGATE_API_DATA]     • Patient: ${stats.fieldsByDomain.patient} fields`);
  console.log(`[AGGREGATE_API_DATA]     • Subscriber: ${stats.fieldsByDomain.subscriber} fields`);
  console.log(`[AGGREGATE_API_DATA]     • Coverage: ${stats.fieldsByDomain.coverage} fields`);
  console.log(`[AGGREGATE_API_DATA]     • Plan: ${stats.fieldsByDomain.plan} fields`);
  console.log(`[AGGREGATE_API_DATA]     • Procedures: ${stats.fieldsByDomain.procedures} fields`);
  console.log(`[AGGREGATE_API_DATA]     • Limits: ${stats.fieldsByDomain.limits} fields`);
  
  const aggregatedPath = pathModule.join(patientApiDataFolder, 'aggregated.json');
  await fs.writeFile(aggregatedPath, JSON.stringify(aggregated, null, 2), 'utf-8');
  console.log(`[AGGREGATE_API_DATA]   ✓ Saved: aggregated.json`);
  
  console.log('\n[AGGREGATE_API_DATA] ═══════════════════════════════════════════');
  console.log('[AGGREGATE_API_DATA] STEP 3: Flatten Aggregated Structure');
  console.log('[AGGREGATE_API_DATA] ═══════════════════════════════════════════');
  
  const flattened = flattenJson(aggregated);
  console.log(`[AGGREGATE_API_DATA]   Flattened Paths: ${flattened.length}`);
  
  const flattenedData = {
    totalPaths: flattened.length,
    paths: flattened.map(e => ({
      path: e.path,
      value: e.value,
      type: e.type
    }))
  };
  
  const flattenedPath = pathModule.join(patientApiDataFolder, 'aggregated_flattened.json');
  await fs.writeFile(flattenedPath, JSON.stringify(flattenedData, null, 2), 'utf-8');
  console.log(`[AGGREGATE_API_DATA]   ✓ Saved: aggregated_flattened.json`);
  
  console.log('\n[AGGREGATE_API_DATA] ═══════════════════════════════════════════');
  console.log('[AGGREGATE_API_DATA] STEP 4: Extract Procedure Codes (Deterministic)');
  console.log('[AGGREGATE_API_DATA] ═══════════════════════════════════════════');
  
  const procedureCodes = await extractAllProcedureCodes(patientApiDataFolder);
  console.log(`[AGGREGATE_API_DATA]   ✓ Extracted ${procedureCodes.length} unique procedure codes deterministically`);
  
  if (procedureCodes.length > 0) {
    console.log(`[AGGREGATE_API_DATA]   Code Range: ${procedureCodes[0].code} - ${procedureCodes[procedureCodes.length - 1].code}`);
    console.log(`[AGGREGATE_API_DATA]   Sample: ${procedureCodes.slice(0, 5).map(p => p.code).join(', ')}`);
  }
  
  console.log('\n[AGGREGATE_API_DATA] ═══════════════════════════════════════════');
  console.log('[AGGREGATE_API_DATA] Aggregation Complete');
  console.log('[AGGREGATE_API_DATA] ═══════════════════════════════════════════');
  console.log(`[AGGREGATE_API_DATA] Files in folder:`);
  console.log(`[AGGREGATE_API_DATA]   • ${jsonFiles.length} raw API files (unflattened, preserved)`);
  console.log(`[AGGREGATE_API_DATA]   • 1 aggregated.json (domain-organized)`);
  console.log(`[AGGREGATE_API_DATA]   • 1 aggregated_flattened.json (for mappers)`);
  console.log('[AGGREGATE_API_DATA] ═══════════════════════════════════════════\n');
  
  console.log('[AGGREGATE_API_DATA] Sample aggregated structure:');
  console.log(`[AGGREGATE_API_DATA]   patient.* - ${stats.fieldsByDomain.patient} fields`);
  if (stats.fieldsByDomain.patient > 0) {
    const samplePatientKeys = Object.keys(aggregated.patient).slice(0, 3);
    samplePatientKeys.forEach(key => {
      console.log(`[AGGREGATE_API_DATA]     ${key}: ${String(aggregated.patient[key]).substring(0, 40)}`);
    });
  }
  
  console.log(`[AGGREGATE_API_DATA]   subscriber.* - ${stats.fieldsByDomain.subscriber} fields`);
  if (stats.fieldsByDomain.subscriber > 0) {
    const sampleSubscriberKeys = Object.keys(aggregated.subscriber).slice(0, 3);
    sampleSubscriberKeys.forEach(key => {
      console.log(`[AGGREGATE_API_DATA]     ${key}: ${String(aggregated.subscriber[key]).substring(0, 40)}`);
    });
  }
  
  console.log(`[AGGREGATE_API_DATA]   coverage.* - ${stats.fieldsByDomain.coverage} fields`);
  console.log(`[AGGREGATE_API_DATA]   plan.* - ${stats.fieldsByDomain.plan} fields`);
  console.log(`[AGGREGATE_API_DATA]   procedures.* - ${stats.fieldsByDomain.procedures} fields`);
  console.log(`[AGGREGATE_API_DATA]   limits.* - ${stats.fieldsByDomain.limits} fields`);
  console.log('[AGGREGATE_API_DATA] ═══════════════════════════════════════════\n');
  
  const { validateAggregatedData } = await import('../shared/domain-classifier.js');
  const validation = validateAggregatedData(aggregated);
  
  console.log('[AGGREGATE_API_DATA] ═══════════════════════════════════════════');
  console.log('[AGGREGATE_API_DATA] Data Validation');
  console.log('[AGGREGATE_API_DATA] ═══════════════════════════════════════════');
  console.log(`[AGGREGATE_API_DATA]   Status: ${validation.isValid ? '✓ VALID' : '✗ INVALID'}`);
  
  if (validation.errors.length > 0) {
    console.log(`[AGGREGATE_API_DATA]   Errors:`);
    validation.errors.forEach(err => {
      console.log(`[AGGREGATE_API_DATA]     ✗ ${err}`);
    });
  }
  
  if (validation.warnings.length > 0) {
    console.log(`[AGGREGATE_API_DATA]   Warnings:`);
    validation.warnings.forEach(warn => {
      console.log(`[AGGREGATE_API_DATA]     ⚠ ${warn}`);
    });
  }
  
  if (validation.isValid && validation.warnings.length === 0) {
    console.log(`[AGGREGATE_API_DATA]   ✓ All critical fields present`);
  }
  console.log('[AGGREGATE_API_DATA] ═══════════════════════════════════════════\n');
  
  logNodeExecution('aggregate_api_data', 'deterministic', 1.0, {
    inputs: { rawFileCount: jsonFiles.length },
    outputs: { 
      totalFields: stats.totalFields,
      provider: stats.provider,
      flattenedPaths: flattened.length,
      procedureCodesExtracted: procedureCodes.length,
      validationStatus: validation.isValid ? 'valid' : 'invalid'
    }
  });

  return {
    messages: [
      new AIMessage(
        `API data aggregated: ${stats.provider} - ${stats.totalFields} fields from ${stats.sourceFileCount} files. ` +
        `Organized into domains: Patient (${stats.fieldsByDomain.patient}), Subscriber (${stats.fieldsByDomain.subscriber}), ` +
        `Coverage (${stats.fieldsByDomain.coverage}), Plan (${stats.fieldsByDomain.plan}), ` +
        `Procedures (${stats.fieldsByDomain.procedures}), Limits (${stats.fieldsByDomain.limits}). ` +
        `Extracted ${procedureCodes.length} unique procedure codes.`
      )
    ],
    jsonFlattened: true,
    aggregatedDataPath: aggregatedPath,
    procedureCodes: procedureCodes
  };
}
