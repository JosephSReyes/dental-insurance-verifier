import { FlattenedEntry } from "./json-flattener-tool.js";

export interface AggregatedProcedure {
  rootPath: string;
  fields: Record<string, any>;
}

export interface ProcedureAggregationResult {
  [normalizedCode: string]: AggregatedProcedure;
}

const PROCEDURE_CODE_PATTERNS = [
  /\bprocedureCode\b/i,
  /\bcode\b/i,
  /^code$/i,
  /\.code$/i,
  /\[(\d+)\]\.code$/i,
];

const PROCEDURE_CODE_FIELD_NAMES = [
  "procedurecode",
  "code",
  "procedure.code",
  "benefit.procedurecode",
  "benefit.code",
  "data.benefit.procedurecode",
  "data.benefit.code",
];

export function detectProcedureRoots(flattened: FlattenedEntry[]): string[] {
  const roots = new Set<string>();

  for (const entry of flattened) {
    const lowerPath = entry.path.toLowerCase();
    
    const matchesCodeField = PROCEDURE_CODE_FIELD_NAMES.some(fieldName => 
      lowerPath.includes(fieldName)
    ) || PROCEDURE_CODE_PATTERNS.some(pattern => pattern.test(entry.path));

    if (matchesCodeField) {
      const root = extractRecordRoot(entry.path);
      if (root) {
        roots.add(root);
      }
    }
  }

  return Array.from(roots);
}

function extractRecordRoot(path: string): string | null {
  const arrayIndexMatch = path.match(/^(.+?\[\d+\])/);
  if (arrayIndexMatch) {
    return arrayIndexMatch[1];
  }

  const parts = path.split('.');
  
  if (parts.length <= 1) {
    return null;
  }

  const codeFieldIndex = parts.findIndex(part => 
    part.toLowerCase() === 'code' || 
    part.toLowerCase() === 'procedurecode'
  );

  if (codeFieldIndex !== -1) {
    if (codeFieldIndex >= 2) {
      return parts.slice(0, codeFieldIndex - 1).join('.');
    }
    if (codeFieldIndex === 1) {
      return parts[0];
    }
  }

  const procedureKeyMatch = path.match(/^(.+?\.procedure(?:s)?(?:\[\d+\])?)/i);
  if (procedureKeyMatch) {
    return procedureKeyMatch[1];
  }

  const benefitKeyMatch = path.match(/^(.+?\.benefit(?:s)?(?:\[\d+\])?)/i);
  if (benefitKeyMatch) {
    return benefitKeyMatch[1];
  }

  if (parts.length >= 3) {
    return parts.slice(0, -2).join('.');
  }

  return parts[0];
}

export function normalizeProcedureCode(code: any): string | null {
  if (code === null || code === undefined) {
    return null;
  }

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

export function aggregateProcedures(flattened: FlattenedEntry[]): ProcedureAggregationResult {
  const roots = detectProcedureRoots(flattened);
  
  const result: ProcedureAggregationResult = {};

  for (const root of roots) {
    const groupEntries = flattened.filter(entry => 
      entry.path === root || entry.path.startsWith(root + '.')
    );

    const codeEntry = groupEntries.find(entry => {
      const relativePath = entry.path.substring(root.length + 1).toLowerCase();
      return relativePath === 'code' || 
             relativePath === 'procedurecode' ||
             relativePath.endsWith('.code') ||
             relativePath.endsWith('.procedurecode');
    });

    if (!codeEntry) {
      continue;
    }

    const normalizedCode = normalizeProcedureCode(codeEntry.value);
    
    if (!normalizedCode) {
      continue;
    }

    const fields: Record<string, any> = {};
    
    for (const entry of groupEntries) {
      const relativePath = entry.path.substring(root.length + 1);
      
      if (relativePath && relativePath !== 'code' && relativePath !== 'procedureCode') {
        fields[relativePath] = entry.value;
      }
    }

    if (result[normalizedCode]) {
      Object.assign(result[normalizedCode].fields, fields);
    } else {
      result[normalizedCode] = {
        rootPath: root,
        fields
      };
    }
  }

  return result;
}

export function mergeProcedureAggregations(
  aggregations: ProcedureAggregationResult[]
): ProcedureAggregationResult {
  const merged: ProcedureAggregationResult = {};

  for (const aggregation of aggregations) {
    for (const [code, data] of Object.entries(aggregation)) {
      if (merged[code]) {
        Object.assign(merged[code].fields, data.fields);
      } else {
        merged[code] = {
          rootPath: data.rootPath,
          fields: { ...data.fields }
        };
      }
    }
  }

  return merged;
}

export function extractProcedureFieldValue(
  aggregated: AggregatedProcedure,
  fieldAliases: string[]
): any {
  for (const alias of fieldAliases) {
    const lowerAlias = alias.toLowerCase();
    
    for (const [key, value] of Object.entries(aggregated.fields)) {
      if (key.toLowerCase().includes(lowerAlias)) {
        return value;
      }
    }
  }
  
  return null;
}

export function getProcedureDescription(proc: AggregatedProcedure): string | null {
  return extractProcedureFieldValue(proc, ['description', 'proceduredescription', 'desc']);
}

export function getProcedureCoverage(
  proc: AggregatedProcedure,
  networkType?: string
): number | null {
  const coverageValue = extractProcedureFieldValue(proc, [
    'benefitcoveragelevel',
    'coverage',
    'coinsurance',
    'percent',
    'coinsuranceinnetwork',
    'coinsuranceoutofnetwork'
  ]);

  if (coverageValue === null || coverageValue === undefined) {
    return null;
  }

  const numericValue = typeof coverageValue === 'string' 
    ? parseFloat(coverageValue.replace('%', ''))
    : Number(coverageValue);

  return isNaN(numericValue) ? null : numericValue;
}

export const procedureAggregatorStats = (
  aggregation: ProcedureAggregationResult
): {
  totalProcedures: number;
  procedureCodes: string[];
  averageFieldsPerProcedure: number;
  proceduresWithDescription: number;
  proceduresWithCoverage: number;
} => {
  const codes = Object.keys(aggregation);
  const totalProcedures = codes.length;
  
  const totalFields = codes.reduce((sum, code) => 
    sum + Object.keys(aggregation[code].fields).length, 0
  );
  
  const proceduresWithDescription = codes.filter(code => 
    getProcedureDescription(aggregation[code]) !== null
  ).length;
  
  const proceduresWithCoverage = codes.filter(code => 
    getProcedureCoverage(aggregation[code]) !== null
  ).length;

  return {
    totalProcedures,
    procedureCodes: codes.sort(),
    averageFieldsPerProcedure: totalProcedures > 0 ? totalFields / totalProcedures : 0,
    proceduresWithDescription,
    proceduresWithCoverage
  };
};
