import { tool } from "@langchain/core/tools";
import { z } from "zod";
import * as fs from "fs/promises";

export const getArrayContextTool = tool(
  async ({ folderPath, arrayPath }) => {
    try {
      const path = await import('path');
      
      const aggregatedFlattenedPath = path.join(folderPath, 'aggregated_flattened.json');
      const content = await fs.readFile(aggregatedFlattenedPath, 'utf-8');
      const flattenedData = JSON.parse(content);
      
      if (!flattenedData.paths || !Array.isArray(flattenedData.paths)) {
        return JSON.stringify({
          error: "File is not in flattened format"
        });
      }
      
      const normalizedArrayPath = arrayPath.trim();
      
      const relevantPaths = flattenedData.paths.filter((entry: any) => {
        return entry.path === normalizedArrayPath || 
               entry.path.startsWith(normalizedArrayPath + '[') ||
               entry.path.startsWith(normalizedArrayPath + '.');
      });
      
      if (relevantPaths.length === 0) {
        return JSON.stringify({
          arrayPath: normalizedArrayPath,
          found: false,
          message: `No data found for array path: ${normalizedArrayPath}`,
          hint: "Try searching with search_aggregated_data first to find the correct path"
        }, null, 2);
      }
      
      const arrayItemPaths = detectArrayItems(relevantPaths, normalizedArrayPath);
      
      const reconstructedArray: any[] = [];
      
      for (const itemPath of arrayItemPaths) {
        const itemFields = relevantPaths.filter((entry: any) => 
          entry.path === itemPath || entry.path.startsWith(itemPath + '.')
        );
        
        const reconstructed = unflattenArrayItem(itemFields, itemPath);
        reconstructedArray.push(reconstructed);
      }
      
      return JSON.stringify({
        arrayPath: normalizedArrayPath,
        found: true,
        totalItems: reconstructedArray.length,
        totalMatchingPaths: relevantPaths.length,
        reconstructedArray: reconstructedArray,
        flattenedSummary: relevantPaths.slice(0, 30).map((e: any) => ({
          path: e.path,
          value: typeof e.value === 'string' && e.value.length > 100 
            ? e.value.substring(0, 100) + '...'
            : e.value,
          type: e.type
        }))
      }, null, 2);
      
    } catch (err) {
      return JSON.stringify({
        error: err instanceof Error ? err.message : String(err)
      }, null, 2);
    }
  },
  {
    name: "get_array_context",
    description: "Generic tool to reconstruct ANY flattened array back to its original nested structure. When search_aggregated_data returns paths like 'domain.someArray[0].field', use this tool with arrayPath='domain.someArray' to get the full unflattened array with all nested objects properly reconstructed. Works with any domain, any array name, any insurance provider.",
    schema: z.object({
      folderPath: z.string().describe("Path to folder containing aggregated_flattened.json"),
      arrayPath: z.string().describe("Base path to the array you want to reconstruct (e.g., if you see 'procedures.someArray[0].field', use 'procedures.someArray')")
    })
  }
);

function detectArrayItems(paths: any[], arrayBasePath: string): string[] {
  const items = new Set<string>();
  
  for (const entry of paths) {
    const arrayItemMatch = entry.path.match(new RegExp(`^${escapeRegex(arrayBasePath)}\\[(\\d+)\\]`));
    if (arrayItemMatch) {
      items.add(`${arrayBasePath}[${arrayItemMatch[1]}]`);
    }
  }
  
  return Array.from(items).sort((a, b) => {
    const aIndex = parseInt(a.match(/\[(\d+)\]$/)?.[1] || '0');
    const bIndex = parseInt(b.match(/\[(\d+)\]$/)?.[1] || '0');
    return aIndex - bIndex;
  });
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function unflattenArrayItem(paths: any[], itemPath: string): any {
  const result: any = {};
  
  for (const entry of paths) {
    const relativePath = entry.path === itemPath 
      ? '' 
      : entry.path.substring(itemPath.length + 1);
    
    if (!relativePath) {
      if (typeof entry.value === 'object' && entry.value !== null) {
        Object.assign(result, entry.value);
      } else if (entry.value !== null && entry.value !== undefined) {
        return entry.value;
      }
      continue;
    }
    
    setNestedValue(result, relativePath, entry.value);
  }
  
  return result;
}

function setNestedValue(obj: any, path: string, value: any): void {
  const parts = parsePathParts(path);
  
  let current = obj;
  
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    
    if (part.type === 'array') {
      if (!Array.isArray(current[part.key])) {
        current[part.key] = [];
      }
      
      while (current[part.key].length <= part.index!) {
        current[part.key].push({});
      }
      
      current = current[part.key][part.index!];
    } else {
      if (!current[part.key]) {
        const nextPart = parts[i + 1];
        current[part.key] = nextPart?.type === 'array' ? [] : {};
      }
      current = current[part.key];
    }
  }
  
  const lastPart = parts[parts.length - 1];
  
  if (lastPart.type === 'array') {
    if (!Array.isArray(current[lastPart.key])) {
      current[lastPart.key] = [];
    }
    current[lastPart.key][lastPart.index!] = value;
  } else {
    current[lastPart.key] = value;
  }
}

function parsePathParts(path: string): Array<{ key: string; type: 'object' | 'array'; index?: number }> {
  const parts: Array<{ key: string; type: 'object' | 'array'; index?: number }> = [];
  
  const tokens = path.split(/\.(?![^\[]*\])/);
  
  for (const token of tokens) {
    const arrayMatch = token.match(/^(.+?)\[(\d+)\]$/);
    
    if (arrayMatch) {
      parts.push({
        key: arrayMatch[1],
        type: 'array',
        index: parseInt(arrayMatch[2], 10)
      });
    } else {
      parts.push({
        key: token,
        type: 'object'
      });
    }
  }
  
  return parts;
}
