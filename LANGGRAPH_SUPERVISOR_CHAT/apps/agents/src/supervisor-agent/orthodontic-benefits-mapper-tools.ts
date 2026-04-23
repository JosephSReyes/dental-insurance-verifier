import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const submitOrthodonticBenefitsDataTool = tool(
  async (input: {
    orthoLifetimeMax?: string;
    orthoLifetimeMaxPath?: string;
    orthoLifetimeMaxReasoning?: string;
    orthoLifetimeMaxConfidence?: number;
    orthoLifetimeMaxSearchTerms?: string[];
    orthoLifetimeMaxUsed?: string;
    orthoLifetimeMaxUsedPath?: string;
    orthoLifetimeMaxUsedReasoning?: string;
    orthoLifetimeMaxUsedConfidence?: number;
    orthoLifetimeMaxUsedSearchTerms?: string[];
    orthoAgeLimit?: string;
    orthoAgeLimitPath?: string;
    orthoAgeLimitReasoning?: string;
    orthoAgeLimitConfidence?: number;
    orthoAgeLimitSearchTerms?: string[];
    orthoCoverage?: string;
    orthoCoveragePath?: string;
    orthoCoverageReasoning?: string;
    orthoCoverageConfidence?: number;
    orthoCoverageSearchTerms?: string[];
  }): Promise<string> => {
    console.log('[SUBMIT_ORTHODONTIC_BENEFITS] Received orthodontic benefits data with reasoning');
    
    const orthodonticBenefitsData = {
      orthoLifetimeMax: input.orthoLifetimeMax || null,
      orthoLifetimeMaxUsed: input.orthoLifetimeMaxUsed || null,
      orthoAgeLimit: input.orthoAgeLimit || null,
      orthoCoverage: input.orthoCoverage || null,
    };

    const extractionMetadata = {
      orthoLifetimeMax: {
        value: input.orthoLifetimeMax || null,
        sourcePath: input.orthoLifetimeMaxPath || "unknown",
        reasoning: input.orthoLifetimeMaxReasoning || "No reasoning provided",
        confidence: input.orthoLifetimeMaxConfidence ?? 0.5,
        searchTermsUsed: input.orthoLifetimeMaxSearchTerms || []
      },
      orthoLifetimeMaxUsed: {
        value: input.orthoLifetimeMaxUsed || null,
        sourcePath: input.orthoLifetimeMaxUsedPath || "unknown",
        reasoning: input.orthoLifetimeMaxUsedReasoning || "No reasoning provided",
        confidence: input.orthoLifetimeMaxUsedConfidence ?? 0.5,
        searchTermsUsed: input.orthoLifetimeMaxUsedSearchTerms || []
      },
      orthoAgeLimit: {
        value: input.orthoAgeLimit || null,
        sourcePath: input.orthoAgeLimitPath || "unknown",
        reasoning: input.orthoAgeLimitReasoning || "No reasoning provided",
        confidence: input.orthoAgeLimitConfidence ?? 0.5,
        searchTermsUsed: input.orthoAgeLimitSearchTerms || []
      },
      orthoCoverage: {
        value: input.orthoCoverage || null,
        sourcePath: input.orthoCoveragePath || "unknown",
        reasoning: input.orthoCoverageReasoning || "No reasoning provided",
        confidence: input.orthoCoverageConfidence ?? 0.5,
        searchTermsUsed: input.orthoCoverageSearchTerms || []
      }
    };

    // Calculate average confidence from field confidences
    const confidences = [
      input.orthoLifetimeMaxConfidence,
      input.orthoLifetimeMaxUsedConfidence,
      input.orthoAgeLimitConfidence,
      input.orthoCoverageConfidence
    ].filter((c): c is number => typeof c === 'number');

    const avgConfidence = confidences.length > 0
      ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
      : 0;
    
    const fieldsFound = Object.values(orthodonticBenefitsData).filter(v => v !== null).length;

    console.log(`[SUBMIT_ORTHODONTIC_BENEFITS] Successfully submitted ${fieldsFound}/4 fields with reasoning (avg confidence: ${(avgConfidence * 100).toFixed(0)}%)`);

    return JSON.stringify({
      success: true,
      orthodonticBenefitsData,
      extractionMetadata,
      fieldsSubmitted: fieldsFound,
      avgConfidence,
      message: `Orthodontic benefits data submitted successfully with ${fieldsFound}/4 fields populated (avg confidence: ${(avgConfidence * 100).toFixed(0)}%)`
    });
  },
  {
    name: "submit_orthodontic_benefits_data",
    description: `Submit the extracted orthodontic benefits data WITH reasoning, confidence, and search terms for each field.

CONFIDENCE SCALE (0.0-1.0):
• 0.9-1.0: Perfect match in expected location, standard format, zero ambiguity
• 0.7-0.9: Good match, minor format variations or combined fields
• 0.5-0.7: Moderate uncertainty, non-standard location or format
• 0.3-0.5: Low confidence, significant ambiguity or inference required
• 0.0-0.3: Very uncertain, guessing or likely incorrect

For every field you extract, provide:
1. The extracted value
2. JSON path where found
3. WHY you chose that value (reasoning)
4. Your confidence level (0.0-1.0)
5. Search terms you used to find this field

This metadata helps humans validate your extraction logic and improves future extractions.`,
    schema: z.object({
      orthoLifetimeMax: z.string().optional().describe("Lifetime maximum for orthodontic benefits (e.g., '$1500')"),
      orthoLifetimeMaxPath: z.string().optional().describe("JSON path where ortho lifetime max was found"),
      orthoLifetimeMaxReasoning: z.string().optional().describe("WHY you believe this is the correct ortho lifetime maximum"),
      orthoLifetimeMaxConfidence: z.number().min(0).max(1).optional().describe("Your confidence in this extraction (0.0-1.0)"),
      orthoLifetimeMaxSearchTerms: z.array(z.string()).optional().describe("Search terms/keywords used to locate this field"),

      orthoLifetimeMaxUsed: z.string().optional().describe("Amount of lifetime maximum already used (e.g., '$0')"),
      orthoLifetimeMaxUsedPath: z.string().optional().describe("JSON path where used amount was found"),
      orthoLifetimeMaxUsedReasoning: z.string().optional().describe("WHY you believe this is the correct used amount"),
      orthoLifetimeMaxUsedConfidence: z.number().min(0).max(1).optional().describe("Your confidence in this extraction (0.0-1.0)"),
      orthoLifetimeMaxUsedSearchTerms: z.array(z.string()).optional().describe("Search terms/keywords used to locate this field"),

      orthoAgeLimit: z.string().optional().describe("Age limit for orthodontic coverage (e.g., '19')"),
      orthoAgeLimitPath: z.string().optional().describe("JSON path where age limit was found"),
      orthoAgeLimitReasoning: z.string().optional().describe("WHY you believe this is the correct age limit"),
      orthoAgeLimitConfidence: z.number().min(0).max(1).optional().describe("Your confidence in this extraction (0.0-1.0)"),
      orthoAgeLimitSearchTerms: z.array(z.string()).optional().describe("Search terms/keywords used to locate this field"),

      orthoCoverage: z.string().optional().describe("Coverage percentage for orthodontic services (e.g., '50%')"),
      orthoCoveragePath: z.string().optional().describe("JSON path where ortho coverage was found"),
      orthoCoverageReasoning: z.string().optional().describe("WHY you believe this is the correct ortho coverage percentage"),
      orthoCoverageConfidence: z.number().min(0).max(1).optional().describe("Your confidence in this extraction (0.0-1.0)"),
      orthoCoverageSearchTerms: z.array(z.string()).optional().describe("Search terms/keywords used to locate this field")
    })
  }
);
