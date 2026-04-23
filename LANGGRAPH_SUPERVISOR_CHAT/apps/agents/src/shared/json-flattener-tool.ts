export interface FlattenedEntry {
  path: string;
  value: any;
  type: string;
}

export function flattenJson(
  obj: any,
  parentPath: string = "",
  result: FlattenedEntry[] = []
): FlattenedEntry[] {
  if (obj === null || obj === undefined) {
    result.push({
      path: parentPath || "root",
      value: obj,
      type: obj === null ? "null" : "undefined"
    });
    return result;
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) {
      result.push({
        path: parentPath,
        value: [],
        type: "array[empty]"
      });
    } else {
      obj.forEach((item, index) => {
        const arrayPath = parentPath ? `${parentPath}[${index}]` : `[${index}]`;
        flattenJson(item, arrayPath, result);
      });
    }
    return result;
  }

  if (typeof obj === "object") {
    const keys = Object.keys(obj);
    
    if (keys.length === 0) {
      result.push({
        path: parentPath || "root",
        value: {},
        type: "object[empty]"
      });
    } else {
      for (const key of keys) {
        const fullPath = parentPath ? `${parentPath}.${key}` : key;
        flattenJson(obj[key], fullPath, result);
      }
    }
    return result;
  }

  result.push({
    path: parentPath,
    value: obj,
    type: typeof obj
  });

  return result;
}

export function flattenJsonToMap(obj: any): Record<string, any> {
  const flattened = flattenJson(obj);
  const map: Record<string, any> = {};
  
  for (const entry of flattened) {
    map[entry.path] = entry.value;
  }
  
  return map;
}

export function searchFlattenedJson(
  flattened: FlattenedEntry[],
  searchTerms: string[],
  options: {
    caseSensitive?: boolean;
    searchKeys?: boolean;
    searchValues?: boolean;
    useRegex?: boolean;
  } = {}
): FlattenedEntry[] {
  const {
    caseSensitive = false,
    searchKeys = true,
    searchValues = true,
    useRegex = false
  } = options;

  const normalizeForSearch = (str: string) => 
    caseSensitive ? str : str.toLowerCase();

  const matches = (text: string, term: string): boolean => {
    if (useRegex) {
      try {
        const regex = new RegExp(term, caseSensitive ? "" : "i");
        return regex.test(text);
      } catch {
        return false;
      }
    }
    return normalizeForSearch(text).includes(normalizeForSearch(term));
  };

  return flattened.filter(entry => {
    for (const term of searchTerms) {
      if (searchKeys && matches(entry.path, term)) {
        return true;
      }
      
      if (searchValues && entry.value !== null && entry.value !== undefined) {
        const valueStr = String(entry.value);
        if (matches(valueStr, term)) {
          return true;
        }
      }
    }
    return false;
  });
}

export const jsonFlattenerTool = {
  name: "flatten_json",
  description: `Recursively flattens a JSON object or array into a list of path-value pairs.
  
This tool extracts every full path (like "data.member.subscriber.firstName") and its corresponding value from the provided JSON.

Use this to:
- Inspect the entire JSON structure without navigating nested objects manually
- Enable regex search, keyword matching, and fuzzy matching across all keys and values
- Build a "semantic map" of the JSON for deterministic preprocessing
- See all available paths before reasoning about field mapping

Input: JSON string or object
Output: Array of { path, value, type } objects representing every leaf node in the JSON tree`,
  
  func: async (input: string | object): Promise<string> => {
    try {
      const parsed = typeof input === "string" ? JSON.parse(input) : input;
      const flattened = flattenJson(parsed);
      
      return JSON.stringify({
        totalPaths: flattened.length,
        paths: flattened.map(e => ({
          path: e.path,
          value: e.value,
          type: e.type
        }))
      }, null, 2);
    } catch (error) {
      return JSON.stringify({
        error: "Failed to flatten JSON",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
};

export const searchFlattenedJsonTool = {
  name: "search_flattened_json",
  description: `Searches through a flattened JSON structure using keyword or regex matching.
  
Input format (JSON string):
{
  "json": <the JSON object to search>,
  "searchTerms": ["term1", "term2", ...],
  "options": {
    "caseSensitive": false,
    "searchKeys": true,
    "searchValues": true,
    "useRegex": false
  }
}

Output: Array of matching { path, value, type } objects`,
  
  func: async (input: string | { json: any; searchTerms: string[]; options?: any }): Promise<string> => {
    try {
      const params = typeof input === "string" ? JSON.parse(input) : input;
      const { json, searchTerms, options = {} } = params;
      
      if (!json || !searchTerms || !Array.isArray(searchTerms)) {
        throw new Error("Input must include 'json' and 'searchTerms' (array)");
      }
      
      const flattened = flattenJson(json);
      const matches = searchFlattenedJson(flattened, searchTerms, options);
      
      return JSON.stringify({
        totalMatches: matches.length,
        matches: matches.map(e => ({
          path: e.path,
          value: e.value,
          type: e.type
        }))
      }, null, 2);
    } catch (error) {
      return JSON.stringify({
        error: "Failed to search flattened JSON",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
};
