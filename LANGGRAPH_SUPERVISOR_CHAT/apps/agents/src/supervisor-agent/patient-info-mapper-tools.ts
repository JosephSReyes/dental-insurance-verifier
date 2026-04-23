import { tool } from "@langchain/core/tools";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import { flattenJson, searchFlattenedJson } from "../shared/json-flattener-tool.js";

export const readFlattenedFileTool = tool(
  async ({ filePath }) => {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const flattened = JSON.parse(content);
      
      if (!flattened.paths || !Array.isArray(flattened.paths)) {
        return JSON.stringify({
          error: "File is not in flattened format. Expected { totalPaths, paths: [] }"
        });
      }
      
      return JSON.stringify({
        fileName: path.basename(filePath),
        totalPaths: flattened.totalPaths,
        message: `File loaded with ${flattened.totalPaths} paths. Use search tools to find specific data.`
      }, null, 2);
    } catch (err) {
      return JSON.stringify({
        error: err instanceof Error ? err.message : String(err)
      }, null, 2);
    }
  },
  {
    name: "read_flattened_file",
    description: "Read a pre-flattened JSON file to see all its paths and values. The file has been preprocessed into { totalPaths, paths: [{path, value, type}] } format. Use this to explore which files contain the patient data you need.",
    schema: z.object({
      filePath: z.string().describe("Full path to the flattened JSON file to read")
    })
  }
);

export const flattenJsonFileTool = tool(
  async ({ jsonFile }) => {
    try {
      const content = await fs.readFile(jsonFile, "utf-8");
      const json = JSON.parse(content);
      
      const flattened = flattenJson(json);
      
      return JSON.stringify({
        file: jsonFile.split(/[/\\]/).pop(),
        totalPaths: flattened.length,
        message: `Flattened ${flattened.length} paths. Use search tools to find specific fields.`
      }, null, 2);
    } catch (err) {
      return JSON.stringify({
        error: err instanceof Error ? err.message : String(err)
      }, null, 2);
    }
  },
  {
    name: "flatten_json_file",
    description: "ALWAYS USE THIS FIRST. Recursively flattens a JSON file into a complete list of all path-value pairs (e.g., 'data.member.subscriber.firstName' -> 'John'). This lets you see the ENTIRE JSON structure at once before reasoning about field mapping. Use this as your first step to understand what data is available.",
    schema: z.object({
      jsonFile: z.string().describe("Path to JSON file to flatten")
    })
  }
);

export const listJsonFilesTool = tool(
  async ({ directory }) => {
    try {
      const files = await fs.readdir(directory);
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      
      const fileDescriptions = jsonFiles.map(filename => {
        const fullPath = path.join(directory, filename);
        
        // Extract semantic meaning from filename
        let likelyContains = "";
        if (filename.includes("planSummary") || filename.includes("summary")) {
          likelyContains = "Overall plan details, member demographics, coverage dates";
        } else if (filename.includes("benefits") && !filename.includes("procedure")) {
          likelyContains = "Plan benefits, coverage percentages, deductibles, maximums";
        } else if (filename.includes("procedureBenefits")) {
          likelyContains = "Individual procedure coverage details by dental code";
        } else if (filename.includes("procedureHistory") || filename.includes("history")) {
          likelyContains = "Past claims and treatment history";
        } else if (filename.includes("accumulator")) {
          likelyContains = "Financial accumulator data (used amounts, remaining benefits)";
        } else if (filename.includes("associatedMembers") || filename.includes("members")) {
          likelyContains = "Family members or dependents on the plan";
        } else {
          likelyContains = "Unknown - needs exploration";
        }
        
        return {
          filename,
          fullPath,
          likelyContains
        };
      });
      
      return JSON.stringify({
        directory,
        totalFiles: jsonFiles.length,
        files: fileDescriptions
      }, null, 2);
    } catch (err) {
      return JSON.stringify({
        error: err instanceof Error ? err.message : String(err)
      }, null, 2);
    }
  },
  {
    name: "list_json_files",
    description: "List all JSON files in a directory and get hints about what each file likely contains based on its name. Use this FIRST to understand which files to explore.",
    schema: z.object({
      directory: z.string().describe("Directory path containing JSON files")
    })
  }
);

export const exploreJsonPathsTool = tool(
  async ({ jsonFile, searchTerms }) => {
    try {
      const content = await fs.readFile(jsonFile, "utf-8");
      const json = JSON.parse(content);
      
      const allPaths: Array<{ path: string; value: any; matchedTerm?: string }> = [];
      
      // Find paths matching any of the search terms
      for (const term of searchTerms) {
        const paths = findAllPaths(json, term);
        paths.forEach(p => {
          // Avoid duplicates
          if (!allPaths.some(existing => existing.path === p.path)) {
            allPaths.push({ ...p, matchedTerm: term });
          }
        });
      }
      
      // Sort by value type and path depth (simpler paths first)
      allPaths.sort((a, b) => {
        const aDepth = a.path.split('.').length;
        const bDepth = b.path.split('.').length;
        return aDepth - bDepth;
      });
      
      // Limit to 5 most relevant paths to avoid overwhelming the LLM
      const limitedPaths = allPaths.slice(0, 5);
      
      return JSON.stringify({
        file: jsonFile.split(/[/\\]/).pop(),
        totalPathsFound: allPaths.length,
        pathsReturned: limitedPaths.length,
        paths: limitedPaths.map(p => ({
          path: p.path,
          value: typeof p.value === 'object' ? '[Object]' : p.value,
          valueType: Array.isArray(p.value) ? 'array' : typeof p.value,
          matchedTerm: p.matchedTerm
        }))
      }, null, 2);
    } catch (err) {
      return JSON.stringify({
        error: err instanceof Error ? err.message : String(err)
      }, null, 2);
    }
  },
  {
    name: "explore_json_paths",
    description: "Explore a JSON file to find paths matching search terms. Use multiple search terms to cast a wide net (e.g., ['first', 'last', 'name'] to find name fields). Returns top 5 most relevant paths.",
    schema: z.object({
      jsonFile: z.string().describe("Path to a single JSON file to explore"),
      searchTerms: z.array(z.string()).describe("Array of search terms to look for in field names (e.g., ['patient', 'name', 'first', 'last'] or ['member', 'id', 'subscriber'])")
    })
  }
);

export const extractValueByPathTool = tool(
  async ({ jsonFile, jsonPath }) => {
    try {
      const content = await fs.readFile(jsonFile, "utf-8");
      const json = JSON.parse(content);
      
      const value = getValueByPath(json, jsonPath);
      
      return JSON.stringify({
        success: true,
        path: jsonPath,
        value: value,
        type: typeof value
      }, null, 2);
    } catch (err) {
      return JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : String(err)
      }, null, 2);
    }
  },
  {
    name: "extract_value_by_path",
    description: "Extract a value from a JSON file using a specific path (e.g., 'data.firstName', 'data.subscriberLastName')",
    schema: z.object({
      jsonFile: z.string().describe("JSON file path"),
      jsonPath: z.string().describe("JSON path to extract (e.g., 'data.firstName', 'data.benefit.coveragePercent')")
    })
  }
);

export const submitExtractedDataTool = tool(
  async ({
    patientName, patientDOB, subscriberName, subscriberDOB, memberId, groupNumber,
    patientNamePath, patientDOBPath, subscriberNamePath, subscriberDOBPath, memberIdPath, groupNumberPath,
    patientNameReasoning, patientDOBReasoning, subscriberNameReasoning, subscriberDOBReasoning, memberIdReasoning, groupNumberReasoning,
    patientNameConfidence, patientDOBConfidence, subscriberNameConfidence, subscriberDOBConfidence, memberIdConfidence, groupNumberConfidence,
    patientNameSearchTerms, patientDOBSearchTerms, subscriberNameSearchTerms, subscriberDOBSearchTerms, memberIdSearchTerms, groupNumberSearchTerms
  }) => {
    const cleanValue = (val: any) => {
      if (!val || val === "null" || val === "undefined") return null;
      return val;
    };

    const result = {
      patientName: cleanValue(patientName),
      patientDOB: cleanValue(patientDOB),
      subscriberName: cleanValue(subscriberName),
      subscriberDOB: cleanValue(subscriberDOB),
      memberId: cleanValue(memberId),
      groupNumber: cleanValue(groupNumber)
    };

    const metadata = {
      patientName: {
        value: result.patientName,
        sourcePath: cleanValue(patientNamePath) || "unknown",
        reasoning: cleanValue(patientNameReasoning) || "No reasoning provided",
        confidence: patientNameConfidence || 0.5,
        searchTermsUsed: patientNameSearchTerms || []
      },
      patientDOB: {
        value: result.patientDOB,
        sourcePath: cleanValue(patientDOBPath) || "unknown",
        reasoning: cleanValue(patientDOBReasoning) || "No reasoning provided",
        confidence: patientDOBConfidence || 0.5,
        searchTermsUsed: patientDOBSearchTerms || []
      },
      subscriberName: {
        value: result.subscriberName,
        sourcePath: cleanValue(subscriberNamePath) || "unknown",
        reasoning: cleanValue(subscriberNameReasoning) || "No reasoning provided",
        confidence: subscriberNameConfidence || 0.5,
        searchTermsUsed: subscriberNameSearchTerms || []
      },
      subscriberDOB: {
        value: result.subscriberDOB,
        sourcePath: cleanValue(subscriberDOBPath) || "unknown",
        reasoning: cleanValue(subscriberDOBReasoning) || "No reasoning provided",
        confidence: subscriberDOBConfidence || 0.5,
        searchTermsUsed: subscriberDOBSearchTerms || []
      },
      memberId: {
        value: result.memberId,
        sourcePath: cleanValue(memberIdPath) || "unknown",
        reasoning: cleanValue(memberIdReasoning) || "No reasoning provided",
        confidence: memberIdConfidence || 0.5,
        searchTermsUsed: memberIdSearchTerms || []
      },
      groupNumber: {
        value: result.groupNumber,
        sourcePath: cleanValue(groupNumberPath) || "unknown",
        reasoning: cleanValue(groupNumberReasoning) || "No reasoning provided",
        confidence: groupNumberConfidence || 0.5,
        searchTermsUsed: groupNumberSearchTerms || []
      }
    };

    const fieldsPopulated = Object.values(result).filter(v => v !== null).length;
    const allFieldsComplete = fieldsPopulated === 6;

    // Calculate average confidence (only for fields that have values)
    const confidences = Object.entries(metadata)
      .filter(([key, _]) => result[key as keyof typeof result] !== null)
      .map(([_, meta]) => meta.confidence);

    const avgConfidence = confidences.length > 0
      ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
      : 0;

    return JSON.stringify({
      success: true,
      message: allFieldsComplete
        ? `All 6 required fields extracted successfully (avg confidence: ${(avgConfidence * 100).toFixed(0)}%)`
        : `Extracted ${fieldsPopulated}/6 fields (avg confidence: ${(avgConfidence * 100).toFixed(0)}%). Missing fields set to null (data may not exist in source files).`,
      extractedData: result,
      extractionMetadata: metadata,
      fieldsPopulated,
      avgConfidence,
      missingFields: Object.entries(result)
        .filter(([_, value]) => value === null)
        .map(([key]) => key)
    }, null, 2);
  },
  {
    name: "submit_extracted_data",
    description: `Submit the final extracted patient data WITH reasoning AND confidence for each field.

IMPORTANT: For every field you extract, you MUST provide:
1. VALUE - The extracted data
2. PATH - Exact JSON path where found (e.g., 'patient.firstName+lastName')
3. REASONING - WHY you chose this value (minimum 20 characters)
4. CONFIDENCE - Your confidence level (0.0-1.0)

CONFIDENCE GUIDELINES:
• 0.9-1.0: Exact match in expected location, standard format, zero ambiguity
  Example: Found 'patient.dateOfBirth' = '1985-03-15' in standard YYYY-MM-DD format

• 0.7-0.9: Good match, minor variations or alternative paths considered
  Example: Combined 'patient.firstName' + 'patient.lastName', both fields clearly labeled

• 0.5-0.7: Moderate confidence, some uncertainty or non-standard location
  Example: Found 'member.id' but unclear if this is memberId or accountId

• 0.3-0.5: Low confidence, significant ambiguity or required inference
  Example: Found 'groupNum' field with value 'GRP12345' - assuming this is group number

• 0.0-0.3: Very low confidence, guessing or likely incorrect
  Example: No group number found, using placeholder value from company name

This metadata helps humans understand and validate your extraction logic, and trains the system to improve over time.`,
    schema: z.object({
      patientName: z.string().optional().describe("Patient's full name (e.g., 'John Smith')"),
      patientNamePath: z.string().optional().describe("JSON path where patient name was found (e.g., 'patient.firstName+lastName')"),
      patientNameReasoning: z.string().optional().describe("WHY you believe this is the correct patient name (e.g., 'Combined patient.firstName and patient.lastName fields')"),
      patientNameConfidence: z.number().min(0).max(1).optional().describe("Your confidence in this extraction (0.0-1.0). Consider path quality, value format, and ambiguity."),
      patientNameSearchTerms: z.array(z.string()).optional().describe("Search terms you used to find this field (e.g., ['name', 'firstName', 'lastName'])"),

      patientDOB: z.string().optional().describe("Patient's date of birth in YYYY-MM-DD format"),
      patientDOBPath: z.string().optional().describe("JSON path where patient DOB was found"),
      patientDOBReasoning: z.string().optional().describe("WHY you believe this is the correct DOB"),
      patientDOBConfidence: z.number().min(0).max(1).optional().describe("Your confidence in this extraction (0.0-1.0)"),
      patientDOBSearchTerms: z.array(z.string()).optional().describe("Search terms used (e.g., ['dob', 'dateOfBirth', 'birth'])"),

      subscriberName: z.string().optional().describe("Subscriber's full name"),
      subscriberNamePath: z.string().optional().describe("JSON path where subscriber name was found"),
      subscriberNameReasoning: z.string().optional().describe("WHY you believe this is the correct subscriber name"),
      subscriberNameConfidence: z.number().min(0).max(1).optional().describe("Your confidence in this extraction (0.0-1.0)"),
      subscriberNameSearchTerms: z.array(z.string()).optional().describe("Search terms used"),

      subscriberDOB: z.string().optional().describe("Subscriber's date of birth in YYYY-MM-DD format"),
      subscriberDOBPath: z.string().optional().describe("JSON path where subscriber DOB was found"),
      subscriberDOBReasoning: z.string().optional().describe("WHY you believe this is the correct subscriber DOB"),
      subscriberDOBConfidence: z.number().min(0).max(1).optional().describe("Your confidence in this extraction (0.0-1.0)"),
      subscriberDOBSearchTerms: z.array(z.string()).optional().describe("Search terms used"),

      memberId: z.string().optional().describe("Insurance member ID"),
      memberIdPath: z.string().optional().describe("JSON path where member ID was found"),
      memberIdReasoning: z.string().optional().describe("WHY you believe this is the correct member ID"),
      memberIdConfidence: z.number().min(0).max(1).optional().describe("Your confidence in this extraction (0.0-1.0)"),
      memberIdSearchTerms: z.array(z.string()).optional().describe("Search terms used"),

      groupNumber: z.string().optional().describe("Insurance group number"),
      groupNumberPath: z.string().optional().describe("JSON path where group number was found"),
      groupNumberReasoning: z.string().optional().describe("WHY you believe this is the correct group number"),
      groupNumberConfidence: z.number().min(0).max(1).optional().describe("Your confidence in this extraction (0.0-1.0)"),
      groupNumberSearchTerms: z.array(z.string()).optional().describe("Search terms used")
    })
  }
);

export const validatePatientFieldTool = tool(
  async ({ fieldName, value, extractedFromPath }) => {
    const validations: string[] = [];
    let isValid = true;
    let confidence = 1.0;

    if (fieldName === "patientName" || fieldName === "subscriberName") {
      // Check if value looks like a person name
      if (!value || typeof value !== "string") {
        isValid = false;
        validations.push("Value is not a string");
      } else if (value.includes("COMPANY") || value.includes("CORP") || value.includes("LLC") || value.includes("INC")) {
        isValid = false;
        confidence = 0.0;
        validations.push("Value appears to be a company name, not a person name");
      } else if (!/^[A-Z][A-Za-z\-'\s]+$/.test(value)) {
        isValid = false;
        validations.push("Value doesn't match typical name format");
      } else if (value.length < 2 || value.length > 50) {
        isValid = false;
        validations.push("Value length is unusual for a name");
      }

      // Check if path makes semantic sense
      if (fieldName === "patientName" && extractedFromPath) {
        if (extractedFromPath.toLowerCase().includes("subscriber") && !extractedFromPath.toLowerCase().includes("patient")) {
          confidence *= 0.3;
          validations.push("WARNING: Path contains 'subscriber' but we're looking for patient name - likely wrong field");
        } else if (extractedFromPath.toLowerCase().includes("group")) {
          confidence *= 0.2;
          validations.push("WARNING: Path contains 'group' - likely a group/company name, not patient");
        }
      }

      if (fieldName === "subscriberName" && extractedFromPath) {
        if (extractedFromPath.toLowerCase().includes("patient") && !extractedFromPath.toLowerCase().includes("subscriber")) {
          confidence *= 0.3;
          validations.push("WARNING: Path contains 'patient' but we're looking for subscriber name - might be wrong field");
        }
      }
    }

    if (fieldName === "patientDOB" || fieldName === "subscriberDOB") {
      if (!/\d{4}-\d{2}-\d{2}/.test(value)) {
        isValid = false;
        validations.push("Value doesn't match ISO date format YYYY-MM-DD");
      }
    }

    if (fieldName === "memberId") {
      if (!/^[A-Z0-9]{5,}$/i.test(value)) {
        isValid = false;
        validations.push("Value doesn't look like a member ID (expected alphanumeric, 5+ chars)");
      }
    }

    if (fieldName === "groupNumber") {
      if (!/^[A-Z0-9]{3,}$/i.test(value)) {
        isValid = false;
        validations.push("Value doesn't look like a group number (expected alphanumeric, 3+ chars)");
      }
    }

    return JSON.stringify({
      fieldName,
      value,
      extractedFromPath,
      isValid,
      confidence,
      validations: validations.length > 0 ? validations : ["Value appears valid"]
    }, null, 2);
  },
  {
    name: "validate_patient_field",
    description: "Validate if an extracted value is correct for a specific patient field. Checks value format AND semantic path correctness (e.g., warns if patientName was extracted from a 'subscriber' path).",
    schema: z.object({
      fieldName: z.string().describe("The field being validated (e.g., 'patientName', 'subscriberName', 'patientDOB', 'memberId')"),
      value: z.string().describe("The extracted value to validate"),
      extractedFromPath: z.string().optional().describe("The JSON path where this value was found (e.g., 'data.firstName', 'data.subscriberName')")
    })
  }
);

function findAllPaths(obj: any, targetField: string, currentPath = ""): Array<{ path: string; value: any }> {
  const results: Array<{ path: string; value: any }> = [];
  
  if (obj === null || obj === undefined) {
    return results;
  }

  if (typeof obj === "object" && !Array.isArray(obj)) {
    for (const [key, value] of Object.entries(obj)) {
      const newPath = currentPath ? `${currentPath}.${key}` : key;
      
      // Check if key matches target field (fuzzy)
      const normalizedKey = key.toLowerCase().replace(/[_\s-]/g, "");
      const normalizedTarget = targetField.toLowerCase().replace(/[_\s-]/g, "");
      
      if (normalizedKey.includes(normalizedTarget) || normalizedTarget.includes(normalizedKey)) {
        results.push({ path: newPath, value });
      }
      
      // Recurse
      results.push(...findAllPaths(value, targetField, newPath));
    }
  } else if (Array.isArray(obj)) {
    obj.forEach((item, idx) => {
      results.push(...findAllPaths(item, targetField, `${currentPath}[${idx}]`));
    });
  }

  return results;
}

function calculateSemanticMatch(path: string, targetField: string): number {
  const pathLower = path.toLowerCase();
  const targetLower = targetField.toLowerCase();
  
  let score = 0;

  // Exact match in path
  if (pathLower.includes(targetLower)) {
    score += 0.5;
  }

  // Semantic penalties
  if (targetField === "patientName") {
    if (pathLower.includes("subscriber") && !pathLower.includes("patient")) {
      score -= 0.4;
    }
    if (pathLower.includes("group") || pathLower.includes("company")) {
      score -= 0.5;
    }
    if (pathLower.includes("firstname") || pathLower.includes("lastname")) {
      score += 0.3;
    }
  }

  if (targetField === "subscriberName") {
    if (pathLower.includes("subscriber")) {
      score += 0.4;
    }
    if (pathLower.includes("patient") && !pathLower.includes("subscriber")) {
      score -= 0.3;
    }
  }

  return Math.max(0, Math.min(1, score));
}

function getValueByPath(obj: any, path: string): any {
  // Handle array notation: data[0].field or data.items[1].value
  const parts = path.split(/\.(?![^\[]*\])/); // Split on dots not inside brackets
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }

    // Check if this part has array notation like "data[0]"
    const arrayMatch = part.match(/^(.+?)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, fieldName, index] = arrayMatch;
      current = current[fieldName];
      if (Array.isArray(current)) {
        current = current[parseInt(index)];
      } else {
        return undefined;
      }
    } else {
      current = current[part];
    }
  }

  return current;
}
