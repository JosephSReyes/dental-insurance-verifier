import * as fs from "fs/promises";
import * as path from "path";

export interface ProcedureCodeEntry {
  code: string;
  processed: boolean;
  sourceFile?: string;
}

export async function extractAllProcedureCodes(folderPath: string): Promise<ProcedureCodeEntry[]> {
  console.log('[PROCEDURE_CODE_EXTRACTOR] Starting deterministic extraction');
  console.log(`[PROCEDURE_CODE_EXTRACTOR] Reading from: ${folderPath}`);
  
  const aggregatedPath = path.join(folderPath, 'aggregated_flattened.json');
  
  try {
    const content = await fs.readFile(aggregatedPath, 'utf-8');
    const flattened = JSON.parse(content);
    
    if (!flattened.paths || !Array.isArray(flattened.paths)) {
      console.warn('[PROCEDURE_CODE_EXTRACTOR] File is not in flattened format');
      return [];
    }
    
    const procedureCodeSet = new Set<string>();
    const codeToSourceFile = new Map<string, string>();
    
    const procedureCodeRegex = /D\d{4}/gi;
    
    for (const entry of flattened.paths) {
      const pathStr = entry.path;
      
      const matches = pathStr.match(procedureCodeRegex);
      if (matches) {
        for (const match of matches) {
          const upperCode = match.toUpperCase();
          procedureCodeSet.add(upperCode);
          
          if (!codeToSourceFile.has(upperCode)) {
            const fileMatch = pathStr.match(/^([^.]+)/);
            if (fileMatch) {
              codeToSourceFile.set(upperCode, fileMatch[1]);
            }
          }
        }
      }
    }
    
    const procedureCodes: ProcedureCodeEntry[] = Array.from(procedureCodeSet)
      .sort()
      .map(code => ({
        code,
        processed: false,
        sourceFile: codeToSourceFile.get(code)
      }));
    
    console.log(`[PROCEDURE_CODE_EXTRACTOR] Found ${procedureCodes.length} unique procedure codes`);
    console.log(`[PROCEDURE_CODE_EXTRACTOR] Code range: ${procedureCodes[0]?.code} to ${procedureCodes[procedureCodes.length - 1]?.code}`);
    
    if (procedureCodes.length > 0) {
      console.log(`[PROCEDURE_CODE_EXTRACTOR] Sample codes: ${procedureCodes.slice(0, 5).map(p => p.code).join(', ')}`);
    }
    
    return procedureCodes;
  } catch (err) {
    console.error('[PROCEDURE_CODE_EXTRACTOR] Error reading aggregated file:', err);
    return [];
  }
}

export async function extractProcedureCodesFromJson(jsonFilePath: string): Promise<ProcedureCodeEntry[]> {
  console.log(`[PROCEDURE_CODE_EXTRACTOR] Extracting from individual file: ${jsonFilePath}`);
  
  try {
    const content = await fs.readFile(jsonFilePath, 'utf-8');
    const json = JSON.parse(content);
    
    const procedureCodeSet = new Set<string>();
    const procedureCodeRegex = /D\d{4}/gi;
    
    function traverse(obj: any, currentPath: string = '') {
      if (obj === null || obj === undefined) return;
      
      if (typeof obj === 'object') {
        for (const [key, value] of Object.entries(obj)) {
          const keyMatches = key.match(procedureCodeRegex);
          if (keyMatches) {
            keyMatches.forEach(match => procedureCodeSet.add(match.toUpperCase()));
          }
          
          const newPath = currentPath ? `${currentPath}.${key}` : key;
          traverse(value, newPath);
        }
      } else if (typeof obj === 'string') {
        const matches = obj.match(procedureCodeRegex);
        if (matches) {
          matches.forEach(match => procedureCodeSet.add(match.toUpperCase()));
        }
      }
    }
    
    traverse(json);
    
    const procedureCodes: ProcedureCodeEntry[] = Array.from(procedureCodeSet)
      .sort()
      .map(code => ({
        code,
        processed: false,
        sourceFile: path.basename(jsonFilePath)
      }));
    
    console.log(`[PROCEDURE_CODE_EXTRACTOR] Found ${procedureCodes.length} codes in ${path.basename(jsonFilePath)}`);
    
    return procedureCodes;
  } catch (err) {
    console.error(`[PROCEDURE_CODE_EXTRACTOR] Error reading file ${jsonFilePath}:`, err);
    return [];
  }
}

export function mergeProcedureCodes(...lists: ProcedureCodeEntry[][]): ProcedureCodeEntry[] {
  const codeMap = new Map<string, ProcedureCodeEntry>();
  
  for (const list of lists) {
    for (const entry of list) {
      if (!codeMap.has(entry.code)) {
        codeMap.set(entry.code, { ...entry });
      }
    }
  }
  
  return Array.from(codeMap.values()).sort((a, b) => a.code.localeCompare(b.code));
}
