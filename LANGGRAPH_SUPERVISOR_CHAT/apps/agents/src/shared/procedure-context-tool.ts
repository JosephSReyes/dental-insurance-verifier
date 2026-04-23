import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { semanticSearch } from "./postgres-semantic-search.js";

export const getProcedureContextTool = tool(
  async ({ patientSessionId, procedureCode }) => {
    try {
      const normalizedCode = normalizeProcedureCode(procedureCode);
      if (!normalizedCode) {
        return JSON.stringify({
          error: `Invalid procedure code format: ${procedureCode}`,
          hint: "Expected format: D0272, 0272, or 272"
        });
      }

      // Query PostgreSQL for procedure-specific data using semantic search
      const queries = [
        `procedure code ${normalizedCode} coverage benefits limitations`,
        `${normalizedCode} dental procedure frequency restriction`,
        `${normalizedCode} deductible applies maximum coverage percent`
      ];

      const allResults: any[] = [];

      for (const query of queries) {
        const searchResults = await semanticSearch({
          query,
          patientName: patientSessionId,
          contentType: 'benefits',
          limit: 10,
          minSimilarity: 0.5
        });

        // semanticSearch returns array directly, not wrapped in results object
        if (Array.isArray(searchResults)) {
          allResults.push(...searchResults);
        }
      }

      // Deduplicate results by chunk_text
      const uniqueResults = Array.from(
        new Map(allResults.map(r => [r.chunk_text, r])).values()
      );

      if (uniqueResults.length === 0) {
        return JSON.stringify({
          procedureCode: normalizedCode,
          found: false,
          message: `No data found for procedure code ${normalizedCode} in PostgreSQL`,
          hint: "This procedure may not be covered or data may not be embedded yet"
        }, null, 2);
      }

      // Extract relevant data from search results
      const procedureData = extractProcedureDataFromChunks(uniqueResults, normalizedCode);

      return JSON.stringify({
        procedureCode: normalizedCode,
        found: true,
        totalChunks: uniqueResults.length,
        extractedData: procedureData,
        rawChunks: uniqueResults.slice(0, 5).map((r: any) => ({
          text: r.chunk_text,
          section: r.section_title,
          similarity: r.similarity,
          contentType: r.content_type
        }))
      }, null, 2);

    } catch (err) {
      return JSON.stringify({
        error: err instanceof Error ? err.message : String(err)
      }, null, 2);
    }
  },
  {
    name: "get_procedure_context",
    description: "Retrieves comprehensive benefit details for a specific procedure code from PostgreSQL semantic search. This tool queries the vector database to find all relevant information about a procedure (e.g., D0272), including coverage percentages, limitations, frequencies, age restrictions, and deductible applicability. Use this when you need complete context about a single procedure's benefits and restrictions.",
    schema: z.object({
      patientSessionId: z.string().describe("Patient session identifier (e.g., 'LASTNAME_FIRSTNAME_CARRIER_FB_2025-12-16_17-05-13')"),
      procedureCode: z.string().describe("Procedure code to find context for (e.g., 'D0272', '0272', or '272')")
    })
  }
);

function extractProcedureDataFromChunks(chunks: any[], procedureCode: string): any {
  const extracted: any = {
    description: null,
    category: null,
    coverage_percent: null,
    limitations: [],
    frequency: null,
    age_restrictions: null,
    deductible_applies: null,
    maximum_applies: null,
    waiting_period: null,
    pre_auth_required: null
  };

  for (const chunk of chunks) {
    const text = chunk.chunk_text || '';
    const textLower = text.toLowerCase();

    // Extract coverage percentage
    if (!extracted.coverage_percent && textLower.includes(procedureCode.toLowerCase())) {
      const coverageMatch = text.match(/(\d+)%\s*(?:coverage|covered)/i);
      if (coverageMatch) extracted.coverage_percent = parseInt(coverageMatch[1]);
    }

    // Extract category
    if (!extracted.category) {
      if (textLower.includes('preventive') || textLower.includes('diagnostic')) {
        extracted.category = 'Preventive';
      } else if (textLower.includes('basic') || textLower.includes('restorative')) {
        extracted.category = 'Basic';
      } else if (textLower.includes('major')) {
        extracted.category = 'Major';
      }
    }

    // Extract frequency limitations
    if (textLower.includes('limited to') || textLower.includes('frequency')) {
      const freqMatch = text.match(/limited to (\d+)[^\n]*/i);
      if (freqMatch && !extracted.frequency) {
        extracted.frequency = freqMatch[0];
      }
    }

    // Extract waiting period
    if (textLower.includes('waiting period')) {
      const waitMatch = text.match(/(\d+)\s*months?\s*waiting/i);
      if (waitMatch && !extracted.waiting_period) {
        extracted.waiting_period = `${waitMatch[1]} months`;
      }
    }

    // Collect limitations
    if (textLower.includes('limitation') || textLower.includes('restricted')) {
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.includes('Limited') || line.includes('restricted')) {
          if (!extracted.limitations.includes(line.trim())) {
            extracted.limitations.push(line.trim());
          }
        }
      }
    }
  }

  // Clean up empty arrays
  if (extracted.limitations.length === 0) extracted.limitations = null;

  return extracted;
}

function normalizeProcedureCode(code: string): string | null {
  if (!code) return null;
  
  let codeStr = String(code).trim();
  
  if (codeStr.match(/^D\d{4}$/i)) {
    return codeStr.toUpperCase();
  }
  
  if (codeStr.match(/^\d{3,4}$/)) {
    const numericCode = parseInt(codeStr, 10);
    return `D${String(numericCode).padStart(4, '0')}`;
  }
  
  if (codeStr.match(/^[A-Z]\d{4}$/i)) {
    return codeStr.toUpperCase();
  }
  
  return null;
}

function detectProcedureRoots(paths: any[], procedureCode: string): string[] {
  const roots = new Set<string>();
  
  for (const entry of paths) {
    const valueLower = String(entry.value || '').toLowerCase();
    const codeLower = procedureCode.toLowerCase();
    
    if (valueLower === codeLower || valueLower.includes(codeLower)) {
      const root = extractRootPath(entry.path);
      if (root) {
        roots.add(root);
      }
    }
  }
  
  if (roots.size === 0) {
    for (const entry of paths) {
      const root = extractRootPath(entry.path);
      if (root) {
        roots.add(root);
      }
    }
  }
  
  return Array.from(roots);
}

function extractRootPath(path: string): string | null {
  const arrayIndexMatch = path.match(/^(.+?\[\d+\])/);
  if (arrayIndexMatch) {
    return arrayIndexMatch[1];
  }
  
  const parts = path.split('.');
  
  if (parts.length <= 2) {
    return parts[0];
  }
  
  const procedureIndex = parts.findIndex(p => 
    p.toLowerCase().includes('procedure') || 
    p.toLowerCase().includes('benefit')
  );
  
  if (procedureIndex !== -1 && procedureIndex < parts.length - 1) {
    return parts.slice(0, procedureIndex + 1).join('.');
  }
  
  return parts.slice(0, -1).join('.');
}

function unflattenPaths(paths: any[], rootPath: string): any {
  const result: any = {};
  
  for (const entry of paths) {
    const relativePath = entry.path === rootPath 
      ? '' 
      : entry.path.substring(rootPath.length + 1);
    
    if (!relativePath) {
      if (typeof entry.value === 'object' && entry.value !== null) {
        Object.assign(result, entry.value);
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
