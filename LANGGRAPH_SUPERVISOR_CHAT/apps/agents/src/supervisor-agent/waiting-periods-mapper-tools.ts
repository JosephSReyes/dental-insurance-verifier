import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const submitWaitingPeriodsDataTool = tool(
  async (input: {
    basicWaitingPeriod?: string;
    basicWaitingPeriodPath?: string;
    basicWaitingPeriodReasoning?: string;
    basicWaitingPeriodConfidence?: number;
    basicWaitingPeriodSearchTerms?: string[];
    majorWaitingPeriod?: string;
    majorWaitingPeriodPath?: string;
    majorWaitingPeriodReasoning?: string;
    majorWaitingPeriodConfidence?: number;
    majorWaitingPeriodSearchTerms?: string[];
    orthoWaitingPeriod?: string;
    orthoWaitingPeriodPath?: string;
    orthoWaitingPeriodReasoning?: string;
    orthoWaitingPeriodConfidence?: number;
    orthoWaitingPeriodSearchTerms?: string[];
  }): Promise<string> => {
    console.log('[SUBMIT_WAITING_PERIODS] Received waiting periods data with reasoning');
    
    const waitingPeriodsData = {
      basicWaitingPeriod: input.basicWaitingPeriod || null,
      majorWaitingPeriod: input.majorWaitingPeriod || null,
      orthoWaitingPeriod: input.orthoWaitingPeriod || null,
    };

    const extractionMetadata = {
      basicWaitingPeriod: {
        value: input.basicWaitingPeriod || null,
        sourcePath: input.basicWaitingPeriodPath || "unknown",
        reasoning: input.basicWaitingPeriodReasoning || "No reasoning provided",
        confidence: input.basicWaitingPeriodConfidence ?? 0.5,
        searchTermsUsed: input.basicWaitingPeriodSearchTerms || []
      },
      majorWaitingPeriod: {
        value: input.majorWaitingPeriod || null,
        sourcePath: input.majorWaitingPeriodPath || "unknown",
        reasoning: input.majorWaitingPeriodReasoning || "No reasoning provided",
        confidence: input.majorWaitingPeriodConfidence ?? 0.5,
        searchTermsUsed: input.majorWaitingPeriodSearchTerms || []
      },
      orthoWaitingPeriod: {
        value: input.orthoWaitingPeriod || null,
        sourcePath: input.orthoWaitingPeriodPath || "unknown",
        reasoning: input.orthoWaitingPeriodReasoning || "No reasoning provided",
        confidence: input.orthoWaitingPeriodConfidence ?? 0.5,
        searchTermsUsed: input.orthoWaitingPeriodSearchTerms || []
      }
    };

    // Calculate average confidence from field confidences
    const confidences = [
      input.basicWaitingPeriodConfidence,
      input.majorWaitingPeriodConfidence,
      input.orthoWaitingPeriodConfidence
    ].filter((c): c is number => typeof c === 'number');

    const avgConfidence = confidences.length > 0
      ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
      : 0;
    
    const fieldsFound = Object.values(waitingPeriodsData).filter(v => v !== null).length;

    console.log(`[SUBMIT_WAITING_PERIODS] Successfully submitted ${fieldsFound}/3 fields with reasoning (avg confidence: ${(avgConfidence * 100).toFixed(0)}%)`);

    return JSON.stringify({
      success: true,
      waitingPeriodsData,
      extractionMetadata,
      fieldsSubmitted: fieldsFound,
      avgConfidence,
      message: `Waiting periods data submitted successfully with ${fieldsFound}/3 fields populated (avg confidence: ${(avgConfidence * 100).toFixed(0)}%)`
    });
  },
  {
    name: "submit_waiting_periods_data",
    description: `Submit the extracted waiting periods data WITH reasoning, confidence, and search terms for each field.

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
      basicWaitingPeriod: z.string().optional().describe("Waiting period for basic services (e.g., '6 months', 'None')"),
      basicWaitingPeriodPath: z.string().optional().describe("JSON path where basic waiting period was found"),
      basicWaitingPeriodReasoning: z.string().optional().describe("WHY you believe this is the correct basic waiting period"),
      basicWaitingPeriodConfidence: z.number().min(0).max(1).optional().describe("Your confidence in this extraction (0.0-1.0)"),
      basicWaitingPeriodSearchTerms: z.array(z.string()).optional().describe("Search terms/keywords used to locate this field"),

      majorWaitingPeriod: z.string().optional().describe("Waiting period for major services (e.g., '12 months', 'None')"),
      majorWaitingPeriodPath: z.string().optional().describe("JSON path where major waiting period was found"),
      majorWaitingPeriodReasoning: z.string().optional().describe("WHY you believe this is the correct major waiting period"),
      majorWaitingPeriodConfidence: z.number().min(0).max(1).optional().describe("Your confidence in this extraction (0.0-1.0)"),
      majorWaitingPeriodSearchTerms: z.array(z.string()).optional().describe("Search terms/keywords used to locate this field"),

      orthoWaitingPeriod: z.string().optional().describe("Waiting period for orthodontic services (e.g., '12 months', 'None')"),
      orthoWaitingPeriodPath: z.string().optional().describe("JSON path where ortho waiting period was found"),
      orthoWaitingPeriodReasoning: z.string().optional().describe("WHY you believe this is the correct ortho waiting period"),
      orthoWaitingPeriodConfidence: z.number().min(0).max(1).optional().describe("Your confidence in this extraction (0.0-1.0)"),
      orthoWaitingPeriodSearchTerms: z.array(z.string()).optional().describe("Search terms/keywords used to locate this field")
    })
  }
);
