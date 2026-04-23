import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const submitProcedureDetailsDataTool = tool(
  async (input: {
    procedureDetails?: Array<{
      procedureCode: string;
      description?: string;
      coverageInNetwork?: string;
      coverageOutNetwork?: string;
      frequency?: string;
      limitationNotes?: string;
      deductibleApplies?: boolean;
      ageLimit?: number | null;
      waitingPeriod?: string | null;
      missingToothClause?: boolean;
      category?: string;
      preAuthRequired?: boolean;
      confidence?: number;
      searchTermsUsed?: string[];
    }>;
    extractionSourcePath?: string;
    extractionReasoning?: string;
    extractionConfidence?: number;
    extractionSearchTerms?: string[];
  }): Promise<string> => {
    console.log('[SUBMIT_PROCEDURE_DETAILS] Received procedure details data with reasoning');
    console.log(`[SUBMIT_PROCEDURE_DETAILS] Number of procedures: ${input.procedureDetails?.length || 0}`);
    
    const procedureDetailsData = {
      procedureDetails: input.procedureDetails || [],
    };

    // Calculate average confidence from procedure confidences
    const procedureConfidences = (input.procedureDetails || [])
      .map(p => p.confidence)
      .filter((c): c is number => typeof c === 'number');

    const avgProcedureConfidence = procedureConfidences.length > 0
      ? procedureConfidences.reduce((sum, c) => sum + c, 0) / procedureConfidences.length
      : 0;

    const overallConfidence = input.extractionConfidence ?? 0.5;
    const combinedConfidence = procedureConfidences.length > 0
      ? (avgProcedureConfidence + overallConfidence) / 2
      : overallConfidence;

    const extractionMetadata = {
      procedureDetails: {
        value: input.procedureDetails || [],
        count: input.procedureDetails?.length || 0,
        sourcePath: input.extractionSourcePath || "unknown",
        reasoning: input.extractionReasoning || "No reasoning provided",
        confidence: combinedConfidence,
        searchTermsUsed: input.extractionSearchTerms || [],
        avgProcedureConfidence,
        overallConfidence
      }
    };
    
    const procedureCount = procedureDetailsData.procedureDetails.length;

    console.log(`[SUBMIT_PROCEDURE_DETAILS] Successfully submitted ${procedureCount} procedure details with reasoning (avg confidence: ${(combinedConfidence * 100).toFixed(0)}%)`);

    if (procedureCount > 0) {
      const sample = procedureDetailsData.procedureDetails[0];
      console.log(`[SUBMIT_PROCEDURE_DETAILS] Sample procedure: ${sample.procedureCode} - ${sample.description || 'N/A'}`);
      console.log(`[SUBMIT_PROCEDURE_DETAILS]   Coverage In: ${sample.coverageInNetwork || 'N/A'}, Out: ${sample.coverageOutNetwork || 'N/A'}`);
      console.log(`[SUBMIT_PROCEDURE_DETAILS]   Frequency: ${sample.frequency || 'N/A'}`);
    }

    return JSON.stringify({
      success: true,
      procedureDetailsData,
      extractionMetadata,
      procedureCount,
      avgConfidence: combinedConfidence,
      message: `Procedure details submitted successfully with ${procedureCount} procedures (avg confidence: ${(combinedConfidence * 100).toFixed(0)}%)`
    });
  },
  {
    name: "submit_procedure_details_data",
    description: `Submit extracted procedure details in the standardized schema format WITH reasoning, confidence, and search terms.

CONFIDENCE SCALE (0.0-1.0):
• 0.9-1.0: Perfect match, all fields clear, standard format
• 0.7-0.9: Good match, minor uncertainties in some fields
• 0.5-0.7: Moderate uncertainty, some inference required
• 0.3-0.5: Low confidence, significant ambiguity
• 0.0-0.3: Very uncertain, guessing

For the overall extraction:
1. Provide overall confidence for finding the procedure details array
2. List search terms used to locate procedure details
3. Explain WHY these are the relevant procedures

For each procedure:
1. Include confidence for that specific procedure extraction
2. Optionally include search terms used for that procedure

You MUST call this tool to finalize extraction. Each procedure should be normalized to the standard format, not the raw portal structure.`,
    schema: z.object({
      procedureDetails: z.array(z.object({
        procedureCode: z.string().describe("Procedure code (e.g., 'D0272')"),
        description: z.string().optional().describe("Procedure description (e.g., 'Bitewings - Two Radiographic Images')"),
        coverageInNetwork: z.string().optional().describe("In-network coverage with % symbol (e.g., '100%', '80%')"),
        coverageOutNetwork: z.string().optional().describe("Out-of-network coverage with % symbol (e.g., '100%', '50%')"),
        frequency: z.string().optional().describe("Frequency limitation text (e.g., '2 per benefit period', 'Twice per year')"),
        limitationNotes: z.string().optional().describe("Combined limitation notes (e.g., 'Covered twice per year; grouped with D0210, D0220')"),
        deductibleApplies: z.boolean().optional().describe("Whether deductible applies"),
        ageLimit: z.number().nullable().optional().describe("Age limit as number (e.g., 19) or null"),
        waitingPeriod: z.string().nullable().optional().describe("Waiting period text (e.g., '6 months') or null"),
        missingToothClause: z.boolean().optional().describe("Whether missing tooth clause applies"),
        category: z.string().optional().describe("Benefit category (e.g., 'Preventive', 'Basic', 'Major', 'Orthodontic')"),
        preAuthRequired: z.boolean().optional().describe("Whether pre-authorization is required"),
        confidence: z.number().min(0).max(1).optional().describe("Your confidence in this specific procedure extraction (0.0-1.0)"),
        searchTermsUsed: z.array(z.string()).optional().describe("Search terms/keywords used to locate this specific procedure")
      })).optional().describe("Array of normalized procedure details matching the internal verification schema"),
      extractionSourcePath: z.string().optional().describe("JSON path or file where procedures were found (e.g., 'apiData.procedures.items[]')"),
      extractionReasoning: z.string().optional().describe("WHY you extracted these specific procedures and how you determined they match the treatment codes requested"),
      extractionConfidence: z.number().min(0).max(1).optional().describe("Your overall confidence in finding and extracting the procedure details array (0.0-1.0)"),
      extractionSearchTerms: z.array(z.string()).optional().describe("Search terms/keywords used to locate the procedure details array")
    })
  }
);
