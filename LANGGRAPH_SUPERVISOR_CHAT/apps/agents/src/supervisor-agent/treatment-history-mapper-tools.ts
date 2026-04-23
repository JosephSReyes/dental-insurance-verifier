import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const submitTreatmentHistoryDataTool = tool(
  async (input: {
    treatmentHistory: Array<{
      serviceDate: string;
      procedureCode: string;
      description: string;
      tooth: string;
      surface: string;
      status: string;
      extraction_reasoning: string;
      source_path: string;
      confidence?: number;
      searchTermsUsed?: string[];
    }>;
    extractionSourcePath?: string;
    extractionReasoning?: string;
    extractionConfidence?: number;
    extractionSearchTerms?: string[];
  }) => {
    console.log('[SUBMIT_TREATMENT_HISTORY] Received treatment history submission with reasoning');
    console.log(`[SUBMIT_TREATMENT_HISTORY] Total records: ${input.treatmentHistory.length}`);
    
    const treatmentHistoryData = {
      treatmentHistory: input.treatmentHistory || [],
    };

    // Calculate average confidence from record confidences
    const recordConfidences = input.treatmentHistory
      .map(r => r.confidence)
      .filter((c): c is number => typeof c === 'number');

    const avgRecordConfidence = recordConfidences.length > 0
      ? recordConfidences.reduce((sum, c) => sum + c, 0) / recordConfidences.length
      : 0;

    const overallConfidence = input.extractionConfidence ?? 0.5;
    const combinedConfidence = recordConfidences.length > 0
      ? (avgRecordConfidence + overallConfidence) / 2
      : overallConfidence;

    const extractionMetadata = {
      treatmentHistory: {
        value: input.treatmentHistory || [],
        count: input.treatmentHistory?.length || 0,
        sourcePath: input.extractionSourcePath || "unknown",
        reasoning: input.extractionReasoning || "No reasoning provided",
        confidence: combinedConfidence,
        searchTermsUsed: input.extractionSearchTerms || [],
        avgRecordConfidence,
        overallConfidence
      }
    };
    
    for (const record of input.treatmentHistory) {
      console.log(`[SUBMIT_TREATMENT_HISTORY]   ${record.serviceDate} - ${record.procedureCode} - ${record.description}`);
    }
    
    const recordCount = input.treatmentHistory.length;
    console.log(`[SUBMIT_TREATMENT_HISTORY] Successfully submitted ${recordCount} treatment history records with reasoning (avg confidence: ${(combinedConfidence * 100).toFixed(0)}%)`);

    return JSON.stringify({
      success: true,
      treatmentHistoryData,
      extractionMetadata,
      recordCount,
      avgConfidence: combinedConfidence,
      message: `Successfully submitted ${recordCount} treatment history records (avg confidence: ${(combinedConfidence * 100).toFixed(0)}%)`
    }, null, 2);
  },
  {
    name: "submit_treatment_history",
    description: `FINAL STEP: Submit the extracted treatment history data WITH reasoning, confidence, and search terms. Complete the task.

CONFIDENCE SCALE (0.0-1.0):
• 0.9-1.0: Perfect match, all fields clear, standard format
• 0.7-0.9: Good match, minor uncertainties in some fields
• 0.5-0.7: Moderate uncertainty, some inference required
• 0.3-0.5: Low confidence, significant ambiguity
• 0.0-0.3: Very uncertain, guessing

For the overall extraction:
1. Provide overall confidence for finding the treatment history array
2. List search terms used to locate treatment history
3. Explain WHY these are the relevant records

For each record:
1. Include confidence for that specific record extraction
2. Optionally include search terms used for that record
3. Explain where you found it (extraction_reasoning)

Call this tool EXACTLY ONCE after extracting all treatment records. Do NOT call any other tools after this.`,
    schema: z.object({
      treatmentHistory: z.array(z.object({
        serviceDate: z.string().describe("Service date in YYYY-MM-DD format"),
        procedureCode: z.string().describe("Procedure code (e.g., 'D0120', 'D1110')"),
        description: z.string().describe("Full procedure description"),
        tooth: z.string().describe("Tooth number/identifier or 'N/A' if not applicable"),
        surface: z.string().describe("Tooth surface or 'N/A' if not applicable"),
        status: z.string().describe("Treatment status (e.g., 'Completed', 'Pending') or 'N/A' if not available"),
        extraction_reasoning: z.string().min(20).describe("REQUIRED: Explain where you found this specific record (at least 20 characters). Example: 'Found in claims.history[0]: serviceDate from dos field (2025-10-07), procedureCode from code (120 converted to D0120), description from desc field'"),
        source_path: z.string().min(1).describe("REQUIRED: JSON path to this record (e.g., 'claims.history[0]')"),
        confidence: z.number().min(0).max(1).optional().describe("Your confidence in this specific record extraction (0.0-1.0)"),
        searchTermsUsed: z.array(z.string()).optional().describe("Search terms/keywords used to locate this specific record")
      })).describe("Array of treatment history records sorted by date (most recent first)"),
      extractionSourcePath: z.string().optional().describe("JSON path or file where treatment history was found (e.g., 'apiData.claims.history[]')"),
      extractionReasoning: z.string().optional().describe("WHY you extracted these specific treatment records and how you determined the correct date range and relevance"),
      extractionConfidence: z.number().min(0).max(1).optional().describe("Your overall confidence in finding and extracting the treatment history array (0.0-1.0)"),
      extractionSearchTerms: z.array(z.string()).optional().describe("Search terms/keywords used to locate the treatment history array")
    })
  }
);
