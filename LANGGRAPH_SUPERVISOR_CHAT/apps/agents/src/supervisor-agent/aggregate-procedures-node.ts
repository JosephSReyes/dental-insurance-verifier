import { RunnableConfig } from "@langchain/core/runnables";
import * as fs from "fs/promises";
import { AIMessage } from "@langchain/core/messages";
import type { WorkflowStateType } from "../shared/workflow-state.js";
import { flattenJson, type FlattenedEntry } from "../shared/json-flattener-tool.js";
import { 
  aggregateProcedures, 
  mergeProcedureAggregations,
  procedureAggregatorStats,
  type ProcedureAggregationResult 
} from "../shared/procedure-aggregator-tool.js";
import { logNodeExecution } from "../shared/logging.js";

export async function aggregateProceduresNode(
  state: WorkflowStateType,
  config: RunnableConfig,
): Promise<Partial<WorkflowStateType>> {
  console.log('[AGGREGATE_PROCEDURES] Starting procedure data aggregation from flattened API data');
  
  let patientApiDataFolder = state.patientApiDataFolder;
  if (!patientApiDataFolder) {
    throw new Error('Patient API data folder not set in state');
  }


  const pathModule = await import('path');
  if (!pathModule.isAbsolute(patientApiDataFolder)) {
    const baseDir = process.cwd();
    patientApiDataFolder = pathModule.join(baseDir, 'patient_data', patientApiDataFolder);
  }

  console.log(`[AGGREGATE_PROCEDURES] Processing folder: ${patientApiDataFolder}`);

  const jsonFiles = await fs.readdir(patientApiDataFolder);
  const jsonPaths = jsonFiles
    .filter(f => f.endsWith('.json') && !f.includes('aggregated_procedures'))
    .map(f => pathModule.join(patientApiDataFolder!, f));

  console.log(`[AGGREGATE_PROCEDURES] Found ${jsonPaths.length} JSON files to aggregate`);
  
  console.log('[AGGREGATE_PROCEDURES] ═══════════════════════════════════════════');
  
  const aggregations: ProcedureAggregationResult[] = [];
  let totalProceduresFound = 0;
  let filesProcessed = 0;
  
  for (const jsonPath of jsonPaths) {
    const fileName = pathModule.basename(jsonPath);
    console.log(`[AGGREGATE_PROCEDURES]   Processing: ${fileName}`);
    
    try {
      const content = await fs.readFile(jsonPath, 'utf-8');
      const parsedData = JSON.parse(content);
      
      let flattened: FlattenedEntry[];
      
      if (parsedData.totalPaths && parsedData.paths) {
        flattened = parsedData.paths;
      } else {
        flattened = flattenJson(parsedData);
      }
      
      const aggregation = aggregateProcedures(flattened);
      const procedureCount = Object.keys(aggregation).length;
      
      if (procedureCount > 0) {
        aggregations.push(aggregation);
        totalProceduresFound += procedureCount;
        console.log(`[AGGREGATE_PROCEDURES]      ✓ Found ${procedureCount} procedures`);
      } else {
        console.log(`[AGGREGATE_PROCEDURES]      ○ No procedures found`);
      }
      
      filesProcessed++;
    } catch (err) {
      console.warn(`[AGGREGATE_PROCEDURES]      ✗ Failed to process ${fileName}:`, err);
    }
  }
  
  const mergedAggregation = mergeProcedureAggregations(aggregations);
  const stats = procedureAggregatorStats(mergedAggregation);
  
  const outputPath = pathModule.join(patientApiDataFolder, 'aggregated_procedures.json');
  await fs.writeFile(outputPath, JSON.stringify(mergedAggregation, null, 2), 'utf-8');
  
  console.log('[AGGREGATE_PROCEDURES] ═══════════════════════════════════════════');
  console.log('[AGGREGATE_PROCEDURES] Aggregation complete:');
  console.log(`[AGGREGATE_PROCEDURES]   Files processed: ${filesProcessed}/${jsonPaths.length}`);
  console.log(`[AGGREGATE_PROCEDURES]   Total procedures: ${stats.totalProcedures}`);
  console.log(`[AGGREGATE_PROCEDURES]   Avg fields/proc: ${stats.averageFieldsPerProcedure.toFixed(1)}`);
  console.log(`[AGGREGATE_PROCEDURES]   With description: ${stats.proceduresWithDescription}`);
  console.log(`[AGGREGATE_PROCEDURES]   With coverage: ${stats.proceduresWithCoverage}`);
  console.log(`[AGGREGATE_PROCEDURES]   Output: ${outputPath}`);
  console.log('[AGGREGATE_PROCEDURES] ═══════════════════════════════════════════\n');
  
  console.log('[AGGREGATE_PROCEDURES] Sample procedure codes found:');
  stats.procedureCodes.slice(0, 10).forEach(code => {
    const proc = mergedAggregation[code];
    const desc = proc.fields.description || proc.fields.procedureDescription || 'N/A';
    console.log(`[AGGREGATE_PROCEDURES]   ${code}: ${String(desc).substring(0, 60)}`);
  });
  if (stats.procedureCodes.length > 10) {
    console.log(`[AGGREGATE_PROCEDURES]   ... and ${stats.procedureCodes.length - 10} more`);
  }
  console.log('[AGGREGATE_PROCEDURES] ═══════════════════════════════════════════\n');
  
  logNodeExecution('aggregate_procedures', 'deterministic', 1.0, {
    inputs: { fileCount: jsonPaths.length },
    outputs: { 
      totalProcedures: stats.totalProcedures,
      filesProcessed,
      outputPath
    }
  });

  return {
    messages: [
      new AIMessage(
        `Procedure aggregation complete: ${stats.totalProcedures} procedures from ${filesProcessed} files. ` +
        `Output saved to aggregated_procedures.json`
      )
    ],
    proceduresAggregated: true,
    aggregatedProcedurePath: outputPath
  };
}
