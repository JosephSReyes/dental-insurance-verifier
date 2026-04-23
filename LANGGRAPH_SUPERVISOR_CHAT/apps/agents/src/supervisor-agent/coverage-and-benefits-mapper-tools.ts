import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const submitCoverageBenefitsDataTool = tool(
  async (input: {
    preventiveCoverage?: string;
    preventiveCoveragePath?: string;
    preventiveCoverageReasoning?: string;
    preventiveCoverageConfidence?: number;
    preventiveCoverageSearchTerms?: string[];
    basicCoverage?: string;
    basicCoveragePath?: string;
    basicCoverageReasoning?: string;
    basicCoverageConfidence?: number;
    basicCoverageSearchTerms?: string[];
    majorCoverage?: string;
    majorCoveragePath?: string;
    majorCoverageReasoning?: string;
    majorCoverageConfidence?: number;
    majorCoverageSearchTerms?: string[];
    yearlyMaximum?: string;
    yearlyMaximumPath?: string;
    yearlyMaximumReasoning?: string;
    yearlyMaximumConfidence?: number;
    yearlyMaximumSearchTerms?: string[];
    yearlyMaximumUsed?: string;
    yearlyMaximumUsedPath?: string;
    yearlyMaximumUsedReasoning?: string;
    yearlyMaximumUsedConfidence?: number;
    yearlyMaximumUsedSearchTerms?: string[];
    yearlyDeductible?: string;
    yearlyDeductiblePath?: string;
    yearlyDeductibleReasoning?: string;
    yearlyDeductibleConfidence?: number;
    yearlyDeductibleSearchTerms?: string[];
    yearlyDeductibleUsed?: string;
    yearlyDeductibleUsedPath?: string;
    yearlyDeductibleUsedReasoning?: string;
    yearlyDeductibleUsedConfidence?: number;
    yearlyDeductibleUsedSearchTerms?: string[];
    dependentCoverageAge?: string;
    dependentCoverageAgePath?: string;
    dependentCoverageAgeReasoning?: string;
    dependentCoverageAgeConfidence?: number;
    dependentCoverageAgeSearchTerms?: string[];
    missingToothClause?: boolean;
    missingToothClausePath?: string;
    missingToothClauseReasoning?: string;
    missingToothClauseConfidence?: number;
    missingToothClauseSearchTerms?: string[];
  }): Promise<string> => {
    console.log('[SUBMIT_COVERAGE_BENEFITS] Received coverage & benefits data with reasoning');
    
    const coverageBenefitsData = {
      preventiveCoverage: input.preventiveCoverage || null,
      basicCoverage: input.basicCoverage || null,
      majorCoverage: input.majorCoverage || null,
      yearlyMaximum: input.yearlyMaximum || null,
      yearlyMaximumUsed: input.yearlyMaximumUsed || null,
      yearlyDeductible: input.yearlyDeductible || null,
      yearlyDeductibleUsed: input.yearlyDeductibleUsed || null,
      dependentCoverageAge: input.dependentCoverageAge || null,
      missingToothClause: input.missingToothClause || null,
    };

    const extractionMetadata = {
      preventiveCoverage: {
        value: input.preventiveCoverage || null,
        sourcePath: input.preventiveCoveragePath || "unknown",
        reasoning: input.preventiveCoverageReasoning || "No reasoning provided",
        confidence: input.preventiveCoverageConfidence ?? 0.5,
        searchTermsUsed: input.preventiveCoverageSearchTerms || []
      },
      basicCoverage: {
        value: input.basicCoverage || null,
        sourcePath: input.basicCoveragePath || "unknown",
        reasoning: input.basicCoverageReasoning || "No reasoning provided",
        confidence: input.basicCoverageConfidence ?? 0.5,
        searchTermsUsed: input.basicCoverageSearchTerms || []
      },
      majorCoverage: {
        value: input.majorCoverage || null,
        sourcePath: input.majorCoveragePath || "unknown",
        reasoning: input.majorCoverageReasoning || "No reasoning provided",
        confidence: input.majorCoverageConfidence ?? 0.5,
        searchTermsUsed: input.majorCoverageSearchTerms || []
      },
      yearlyMaximum: {
        value: input.yearlyMaximum || null,
        sourcePath: input.yearlyMaximumPath || "unknown",
        reasoning: input.yearlyMaximumReasoning || "No reasoning provided",
        confidence: input.yearlyMaximumConfidence ?? 0.5,
        searchTermsUsed: input.yearlyMaximumSearchTerms || []
      },
      yearlyMaximumUsed: {
        value: input.yearlyMaximumUsed || null,
        sourcePath: input.yearlyMaximumUsedPath || "unknown",
        reasoning: input.yearlyMaximumUsedReasoning || "No reasoning provided",
        confidence: input.yearlyMaximumUsedConfidence ?? 0.5,
        searchTermsUsed: input.yearlyMaximumUsedSearchTerms || []
      },
      yearlyDeductible: {
        value: input.yearlyDeductible || null,
        sourcePath: input.yearlyDeductiblePath || "unknown",
        reasoning: input.yearlyDeductibleReasoning || "No reasoning provided",
        confidence: input.yearlyDeductibleConfidence ?? 0.5,
        searchTermsUsed: input.yearlyDeductibleSearchTerms || []
      },
      yearlyDeductibleUsed: {
        value: input.yearlyDeductibleUsed || null,
        sourcePath: input.yearlyDeductibleUsedPath || "unknown",
        reasoning: input.yearlyDeductibleUsedReasoning || "No reasoning provided",
        confidence: input.yearlyDeductibleUsedConfidence ?? 0.5,
        searchTermsUsed: input.yearlyDeductibleUsedSearchTerms || []
      },
      dependentCoverageAge: {
        value: input.dependentCoverageAge || null,
        sourcePath: input.dependentCoverageAgePath || "unknown",
        reasoning: input.dependentCoverageAgeReasoning || "No reasoning provided",
        confidence: input.dependentCoverageAgeConfidence ?? 0.5,
        searchTermsUsed: input.dependentCoverageAgeSearchTerms || []
      },
      missingToothClause: {
        value: input.missingToothClause || null,
        sourcePath: input.missingToothClausePath || "unknown",
        reasoning: input.missingToothClauseReasoning || "No reasoning provided",
        confidence: input.missingToothClauseConfidence ?? 0.5,
        searchTermsUsed: input.missingToothClauseSearchTerms || []
      }
    };

    // Calculate average confidence from field confidences
    const confidences = [
      input.preventiveCoverageConfidence,
      input.basicCoverageConfidence,
      input.majorCoverageConfidence,
      input.yearlyMaximumConfidence,
      input.yearlyMaximumUsedConfidence,
      input.yearlyDeductibleConfidence,
      input.yearlyDeductibleUsedConfidence,
      input.dependentCoverageAgeConfidence,
      input.missingToothClauseConfidence
    ].filter((c): c is number => typeof c === 'number');

    const avgConfidence = confidences.length > 0
      ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
      : 0;
    
    const fieldsFound = Object.values(coverageBenefitsData).filter(v => v !== null).length;

    console.log(`[SUBMIT_COVERAGE_BENEFITS] Successfully submitted ${fieldsFound}/9 fields with reasoning (avg confidence: ${(avgConfidence * 100).toFixed(0)}%)`);

    return JSON.stringify({
      success: true,
      coverageBenefitsData,
      extractionMetadata,
      fieldsSubmitted: fieldsFound,
      avgConfidence,
      message: `Coverage & benefits data submitted successfully with ${fieldsFound}/9 fields populated (avg confidence: ${(avgConfidence * 100).toFixed(0)}%)`
    });
  },
  {
    name: "submit_coverage_benefits_data",
    description: `Submit the extracted coverage and benefits data WITH reasoning, confidence, and search terms for each field.

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
      preventiveCoverage: z.string().optional().describe("Coverage percentage for preventive care (e.g., '100%')"),
      preventiveCoveragePath: z.string().optional().describe("JSON path where preventive coverage was found"),
      preventiveCoverageReasoning: z.string().optional().describe("WHY you believe this is the correct preventive coverage"),
      preventiveCoverageConfidence: z.number().min(0).max(1).optional().describe("Your confidence in this extraction (0.0-1.0)"),
      preventiveCoverageSearchTerms: z.array(z.string()).optional().describe("Search terms/keywords used to locate this field"),

      basicCoverage: z.string().optional().describe("Coverage percentage for basic services (e.g., '80%')"),
      basicCoveragePath: z.string().optional().describe("JSON path where basic coverage was found"),
      basicCoverageReasoning: z.string().optional().describe("WHY you believe this is the correct basic coverage"),
      basicCoverageConfidence: z.number().min(0).max(1).optional().describe("Your confidence in this extraction (0.0-1.0)"),
      basicCoverageSearchTerms: z.array(z.string()).optional().describe("Search terms/keywords used to locate this field"),

      majorCoverage: z.string().optional().describe("Coverage percentage for major services (e.g., '50%')"),
      majorCoveragePath: z.string().optional().describe("JSON path where major coverage was found"),
      majorCoverageReasoning: z.string().optional().describe("WHY you believe this is the correct major coverage"),
      majorCoverageConfidence: z.number().min(0).max(1).optional().describe("Your confidence in this extraction (0.0-1.0)"),
      majorCoverageSearchTerms: z.array(z.string()).optional().describe("Search terms/keywords used to locate this field"),

      yearlyMaximum: z.string().optional().describe("Annual benefit maximum in format '$XXXX' - extract actual value from JSON data"),
      yearlyMaximumPath: z.string().optional().describe("JSON path where yearly maximum was found"),
      yearlyMaximumReasoning: z.string().optional().describe("WHY you believe this is the correct yearly maximum"),
      yearlyMaximumConfidence: z.number().min(0).max(1).optional().describe("Your confidence in this extraction (0.0-1.0)"),
      yearlyMaximumSearchTerms: z.array(z.string()).optional().describe("Search terms/keywords used to locate this field"),

      yearlyMaximumUsed: z.string().optional().describe("Amount of annual maximum already used in format '$XXX.XX' - extract actual value from JSON data"),
      yearlyMaximumUsedPath: z.string().optional().describe("JSON path where used amount was found"),
      yearlyMaximumUsedReasoning: z.string().optional().describe("WHY you believe this is the correct used amount"),
      yearlyMaximumUsedConfidence: z.number().min(0).max(1).optional().describe("Your confidence in this extraction (0.0-1.0)"),
      yearlyMaximumUsedSearchTerms: z.array(z.string()).optional().describe("Search terms/keywords used to locate this field"),

      yearlyDeductible: z.string().optional().describe("Annual deductible amount in format '$XX' - extract actual value from JSON data"),
      yearlyDeductiblePath: z.string().optional().describe("JSON path where deductible was found"),
      yearlyDeductibleReasoning: z.string().optional().describe("WHY you believe this is the correct deductible"),
      yearlyDeductibleConfidence: z.number().min(0).max(1).optional().describe("Your confidence in this extraction (0.0-1.0)"),
      yearlyDeductibleSearchTerms: z.array(z.string()).optional().describe("Search terms/keywords used to locate this field"),

      yearlyDeductibleUsed: z.string().optional().describe("Amount of deductible already used in format '$X.XX' - extract actual value from JSON data"),
      yearlyDeductibleUsedPath: z.string().optional().describe("JSON path where deductible used was found"),
      yearlyDeductibleUsedReasoning: z.string().optional().describe("WHY you believe this is the correct deductible used"),
      yearlyDeductibleUsedConfidence: z.number().min(0).max(1).optional().describe("Your confidence in this extraction (0.0-1.0)"),
      yearlyDeductibleUsedSearchTerms: z.array(z.string()).optional().describe("Search terms/keywords used to locate this field"),

      dependentCoverageAge: z.string().optional().describe("Maximum age for dependent coverage (e.g., '26')"),
      dependentCoverageAgePath: z.string().optional().describe("JSON path where dependent age was found"),
      dependentCoverageAgeReasoning: z.string().optional().describe("WHY you believe this is the correct dependent age"),
      dependentCoverageAgeConfidence: z.number().min(0).max(1).optional().describe("Your confidence in this extraction (0.0-1.0)"),
      dependentCoverageAgeSearchTerms: z.array(z.string()).optional().describe("Search terms/keywords used to locate this field"),

      missingToothClause: z.boolean().optional().describe("Boolean indicating if plan has missing tooth clause (true = has clause/restriction, false = no clause)"),
      missingToothClausePath: z.string().optional().describe("JSON path where missing tooth clause was found"),
      missingToothClauseReasoning: z.string().optional().describe("WHY you believe this is the correct missing tooth clause"),
      missingToothClauseConfidence: z.number().min(0).max(1).optional().describe("Your confidence in this extraction (0.0-1.0)"),
      missingToothClauseSearchTerms: z.array(z.string()).optional().describe("Search terms/keywords used to locate this field")
    })
  }
);
