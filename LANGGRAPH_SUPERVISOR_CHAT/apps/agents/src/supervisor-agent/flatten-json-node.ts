import { RunnableConfig } from "@langchain/core/runnables";
import * as fs from "fs/promises";
import * as path from "path";
import { AIMessage } from "@langchain/core/messages";
import type { WorkflowStateType } from "../shared/workflow-state.js";
import { flattenJson, type FlattenedEntry } from "../shared/json-flattener-tool.js";
import { logNodeExecution } from "../shared/logging.js";

export async function flattenJsonNode(
  state: WorkflowStateType,
  config: RunnableConfig,
): Promise<Partial<WorkflowStateType>> {
  console.log('[FLATTEN_JSON] Starting deterministic JSON flattening for all patient API data');
  
  let patientApiDataFolder = state.patientApiDataFolder;
  if (!patientApiDataFolder) {
    throw new Error('Patient API data folder not set in state');
  }

  const pathModule = await import('path');
  if (!pathModule.isAbsolute(patientApiDataFolder)) {
    const baseDir = process.cwd();
    patientApiDataFolder = pathModule.join(baseDir, 'patient_data', patientApiDataFolder);
  }

  console.log(`[FLATTEN_JSON] Processing folder: ${patientApiDataFolder}`);

  const jsonFiles = await fs.readdir(patientApiDataFolder);
  const jsonPaths = jsonFiles
    .filter(f => f.endsWith('.json'))
    .map(f => pathModule.join(patientApiDataFolder!, f));

  console.log(`[FLATTEN_JSON] Found ${jsonPaths.length} JSON files to flatten`);
  
  console.log('[FLATTEN_JSON] ═══════════════════════════════════════════');
  
  let totalPaths = 0;
  let filesProcessed = 0;
  
  for (const jsonPath of jsonPaths) {
    const fileName = pathModule.basename(jsonPath);
    console.log(`[FLATTEN_JSON]   Flattening: ${fileName}`);
    
    try {
      const content = await fs.readFile(jsonPath, 'utf-8');
      const json = JSON.parse(content);
      const flattened = flattenJson(json);
      
      const flattenedData = {
        totalPaths: flattened.length,
        paths: flattened.map(e => ({
          path: e.path,
          value: e.value,
          type: e.type
        }))
      };
      
      await fs.writeFile(jsonPath, JSON.stringify(flattenedData, null, 2), 'utf-8');
      
      totalPaths += flattened.length;
      filesProcessed++;
      console.log(`[FLATTEN_JSON]      ✓ ${flattened.length} paths extracted and saved`);
    } catch (err) {
      console.warn(`[FLATTEN_JSON]      ✗ Failed to flatten ${fileName}:`, err);
    }
  }
  
  console.log('[FLATTEN_JSON] ═══════════════════════════════════════════');
  console.log('[FLATTEN_JSON] Flattening complete:');
  console.log(`[FLATTEN_JSON]   Files processed: ${filesProcessed}/${jsonPaths.length}`);
  console.log(`[FLATTEN_JSON]   Total paths: ${totalPaths}`);
  console.log('[FLATTEN_JSON] ═══════════════════════════════════════════\n');
  
  logNodeExecution('flatten_json', 'deterministic', 1.0, {
    inputs: { fileCount: jsonPaths.length },
    outputs: { totalPaths, filesProcessed }
  });

  return {
    messages: [
      new AIMessage(`Flattened ${filesProcessed} JSON files: ${totalPaths} total paths extracted and saved to disk`)
    ],
    jsonFlattened: true
  };
}
