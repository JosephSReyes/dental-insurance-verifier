import { tool } from "@langchain/core/tools";
import { z } from "zod";
import * as fs from "fs/promises";

export const searchAggregatedDataTool = tool(
  async ({ folderPath, domains, searchTerms }) => {
    try {
      const aggregatedPath = folderPath.endsWith('aggregated_flattened.json') 
        ? folderPath 
        : `${folderPath}/aggregated_flattened.json`;
      
      const content = await fs.readFile(aggregatedPath, 'utf-8');
      const flattened = JSON.parse(content);
      
      if (!flattened.paths || !Array.isArray(flattened.paths)) {
        return JSON.stringify({
          error: "File is not in flattened format"
        });
      }
      
      const results: Array<{ path: string; value: any; type: string; matchedDomain: string; matchedTerm: string }> = [];
      
      for (const entry of flattened.paths) {
        const pathLower = entry.path.toLowerCase();
        
        const matchedDomain = domains.find(domain => pathLower.startsWith(domain.toLowerCase() + '.'));
        if (!matchedDomain) continue;
        
        for (const term of searchTerms) {
          const termLower = term.toLowerCase();
          if (pathLower.includes(termLower) && entry.value !== null && entry.value !== undefined && entry.value !== '') {
            results.push({
              path: entry.path,
              value: typeof entry.value === 'string' && entry.value.length > 100 
                ? entry.value.substring(0, 100) + '...' 
                : entry.value,
              type: entry.type,
              matchedDomain,
              matchedTerm: term
            });
            break;
          }
        }
      }
      
      const MAX_RESULTS = 50;
      const limited = results.slice(0, MAX_RESULTS);
      
      const grouped: Record<string, any[]> = {};
      for (const result of limited) {
        if (!grouped[result.matchedDomain]) {
          grouped[result.matchedDomain] = [];
        }
        grouped[result.matchedDomain].push({
          path: result.path,
          value: result.value,
          type: result.type,
          matchedTerm: result.matchedTerm
        });
      }
      
      return JSON.stringify({
        totalMatches: results.length,
        returnedMatches: limited.length,
        truncated: results.length > MAX_RESULTS,
        resultsByDomain: grouped
      }, null, 2);
    } catch (err) {
      return JSON.stringify({
        error: err instanceof Error ? err.message : String(err)
      }, null, 2);
    }
  },
  {
    name: "search_aggregated_data",
    description: "Search the aggregated_flattened.json file for specific fields within specific domains. Returns up to 50 matches organized by domain. Use this instead of reading the entire file.",
    schema: z.object({
      folderPath: z.string().describe("Path to folder containing aggregated_flattened.json (or full path to the file)"),
      domains: z.array(z.string()).describe("Domains to search in (e.g., ['patient', 'subscriber', 'plan'])"),
      searchTerms: z.array(z.string()).describe("Terms to search for in paths (e.g., ['firstName', 'lastName', 'name', 'dob', 'memberId'])")
    })
  }
);
