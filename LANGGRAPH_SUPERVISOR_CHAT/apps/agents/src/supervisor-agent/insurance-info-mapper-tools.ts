import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const submitInsuranceDataTool = tool(
  async (input: {
    insuranceCompany?: string;
    insuranceCompanyPath?: string;
    insuranceCompanyReasoning?: string;
    insuranceCompanyConfidence?: number;
    insuranceCompanySearchTerms?: string[];
    groupPlanName?: string;
    groupPlanNamePath?: string;
    groupPlanNameReasoning?: string;
    groupPlanNameConfidence?: number;
    groupPlanNameSearchTerms?: string[];
    claimsAddress?: string;
    claimsAddressPath?: string;
    claimsAddressReasoning?: string;
    claimsAddressConfidence?: number;
    claimsAddressSearchTerms?: string[];
    insurancePhone?: string;
    insurancePhonePath?: string;
    insurancePhoneReasoning?: string;
    insurancePhoneConfidence?: number;
    insurancePhoneSearchTerms?: string[];
    payorId?: string;
    payorIdPath?: string;
    payorIdReasoning?: string;
    payorIdConfidence?: number;
    payorIdSearchTerms?: string[];
    networkStatus?: string;
    networkStatusPath?: string;
    networkStatusReasoning?: string;
    networkStatusConfidence?: number;
    networkStatusSearchTerms?: string[];
    feeSchedule?: string;
    feeSchedulePath?: string;
    feeScheduleReasoning?: string;
    feeScheduleConfidence?: number;
    feeScheduleSearchTerms?: string[];
    benefitPeriod?: string;
    benefitPeriodPath?: string;
    benefitPeriodReasoning?: string;
    benefitPeriodConfidence?: number;
    benefitPeriodSearchTerms?: string[];
    effectiveDate?: string;
    effectiveDatePath?: string;
    effectiveDateReasoning?: string;
    effectiveDateConfidence?: number;
    effectiveDateSearchTerms?: string[];
    terminationDate?: string;
    terminationDatePath?: string;
    terminationDateReasoning?: string;
    terminationDateConfidence?: number;
    terminationDateSearchTerms?: string[];
  }) => {
    console.log('[SUBMIT_INSURANCE_DATA] Received insurance data submission with reasoning');

    const insuranceData = {
      insuranceCompany: input.insuranceCompany || null,
      groupPlanName: input.groupPlanName || null,
      claimsAddress: input.claimsAddress || null,
      insurancePhone: input.insurancePhone || null,
      payorId: input.payorId || null,
      networkStatus: input.networkStatus || null,
      feeSchedule: input.feeSchedule || null,
      benefitPeriod: input.benefitPeriod || null,
      effectiveDate: input.effectiveDate || null,
      terminationDate: input.terminationDate || null,
    };

    const extractionMetadata = {
      insuranceCompany: {
        value: input.insuranceCompany || null,
        sourcePath: input.insuranceCompanyPath || "unknown",
        reasoning: input.insuranceCompanyReasoning || "No reasoning provided",
        confidence: input.insuranceCompanyConfidence ?? 0.5,
        searchTermsUsed: input.insuranceCompanySearchTerms || []
      },
      groupPlanName: {
        value: input.groupPlanName || null,
        sourcePath: input.groupPlanNamePath || "unknown",
        reasoning: input.groupPlanNameReasoning || "No reasoning provided",
        confidence: input.groupPlanNameConfidence ?? 0.5,
        searchTermsUsed: input.groupPlanNameSearchTerms || []
      },
      claimsAddress: {
        value: input.claimsAddress || null,
        sourcePath: input.claimsAddressPath || "unknown",
        reasoning: input.claimsAddressReasoning || "No reasoning provided",
        confidence: input.claimsAddressConfidence ?? 0.5,
        searchTermsUsed: input.claimsAddressSearchTerms || []
      },
      insurancePhone: {
        value: input.insurancePhone || null,
        sourcePath: input.insurancePhonePath || "unknown",
        reasoning: input.insurancePhoneReasoning || "No reasoning provided",
        confidence: input.insurancePhoneConfidence ?? 0.5,
        searchTermsUsed: input.insurancePhoneSearchTerms || []
      },
      payorId: {
        value: input.payorId || null,
        sourcePath: input.payorIdPath || "unknown",
        reasoning: input.payorIdReasoning || "No reasoning provided",
        confidence: input.payorIdConfidence ?? 0.5,
        searchTermsUsed: input.payorIdSearchTerms || []
      },
      networkStatus: {
        value: input.networkStatus || null,
        sourcePath: input.networkStatusPath || "unknown",
        reasoning: input.networkStatusReasoning || "No reasoning provided",
        confidence: input.networkStatusConfidence ?? 0.5,
        searchTermsUsed: input.networkStatusSearchTerms || []
      },
      feeSchedule: {
        value: input.feeSchedule || null,
        sourcePath: input.feeSchedulePath || "unknown",
        reasoning: input.feeScheduleReasoning || "No reasoning provided",
        confidence: input.feeScheduleConfidence ?? 0.5,
        searchTermsUsed: input.feeScheduleSearchTerms || []
      },
      benefitPeriod: {
        value: input.benefitPeriod || null,
        sourcePath: input.benefitPeriodPath || "unknown",
        reasoning: input.benefitPeriodReasoning || "No reasoning provided",
        confidence: input.benefitPeriodConfidence ?? 0.5,
        searchTermsUsed: input.benefitPeriodSearchTerms || []
      },
      effectiveDate: {
        value: input.effectiveDate || null,
        sourcePath: input.effectiveDatePath || "unknown",
        reasoning: input.effectiveDateReasoning || "No reasoning provided",
        confidence: input.effectiveDateConfidence ?? 0.5,
        searchTermsUsed: input.effectiveDateSearchTerms || []
      },
      terminationDate: {
        value: input.terminationDate || null,
        sourcePath: input.terminationDatePath || "unknown",
        reasoning: input.terminationDateReasoning || "No reasoning provided",
        confidence: input.terminationDateConfidence ?? 0.5,
        searchTermsUsed: input.terminationDateSearchTerms || []
      }
    };

    // Calculate average confidence from field confidences
    const confidences = [
      input.insuranceCompanyConfidence,
      input.groupPlanNameConfidence,
      input.claimsAddressConfidence,
      input.insurancePhoneConfidence,
      input.payorIdConfidence,
      input.networkStatusConfidence,
      input.feeScheduleConfidence,
      input.benefitPeriodConfidence,
      input.effectiveDateConfidence,
      input.terminationDateConfidence
    ].filter((c): c is number => typeof c === 'number');

    const avgConfidence = confidences.length > 0
      ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
      : 0;

    const fieldsFound = Object.values(insuranceData).filter(v => v !== null).length;

    console.log(`[SUBMIT_INSURANCE_DATA] ✅ Accepted ${fieldsFound}/10 fields with reasoning (avg confidence: ${(avgConfidence * 100).toFixed(0)}%)`);

    return JSON.stringify({
      success: true,
      insuranceData,
      extractionMetadata,
      fieldsExtracted: fieldsFound,
      avgConfidence,
      message: `Successfully submitted ${fieldsFound}/10 insurance fields (avg confidence: ${(avgConfidence * 100).toFixed(0)}%)`
    });
  },
  {
    name: "submit_insurance_data",
    description: `Submit the extracted insurance information WITH reasoning, confidence, and search terms for each field.

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
      insuranceCompany: z.string().optional().describe("Insurance carrier name"),
      insuranceCompanyPath: z.string().optional().describe("JSON path where insurance company was found"),
      insuranceCompanyReasoning: z.string().optional().describe("WHY you believe this is the correct insurance company"),
      insuranceCompanyConfidence: z.number().min(0).max(1).optional().describe("Your confidence in this extraction (0.0-1.0)"),
      insuranceCompanySearchTerms: z.array(z.string()).optional().describe("Search terms/keywords used to locate this field"),

      groupPlanName: z.string().optional().describe("Specific plan name"),
      groupPlanNamePath: z.string().optional().describe("JSON path where plan name was found"),
      groupPlanNameReasoning: z.string().optional().describe("WHY you believe this is the correct plan name"),
      groupPlanNameConfidence: z.number().min(0).max(1).optional().describe("Your confidence in this extraction (0.0-1.0)"),
      groupPlanNameSearchTerms: z.array(z.string()).optional().describe("Search terms/keywords used to locate this field"),

      claimsAddress: z.string().optional().describe("Where to send claims"),
      claimsAddressPath: z.string().optional().describe("JSON path where claims address was found"),
      claimsAddressReasoning: z.string().optional().describe("WHY you believe this is the correct claims address"),
      claimsAddressConfidence: z.number().min(0).max(1).optional().describe("Your confidence in this extraction (0.0-1.0)"),
      claimsAddressSearchTerms: z.array(z.string()).optional().describe("Search terms/keywords used to locate this field"),

      insurancePhone: z.string().optional().describe("Customer service phone"),
      insurancePhonePath: z.string().optional().describe("JSON path where phone was found"),
      insurancePhoneReasoning: z.string().optional().describe("WHY you believe this is the correct phone number"),
      insurancePhoneConfidence: z.number().min(0).max(1).optional().describe("Your confidence in this extraction (0.0-1.0)"),
      insurancePhoneSearchTerms: z.array(z.string()).optional().describe("Search terms/keywords used to locate this field"),

      payorId: z.string().optional().describe("Electronic payor ID"),
      payorIdPath: z.string().optional().describe("JSON path where payor ID was found"),
      payorIdReasoning: z.string().optional().describe("WHY you believe this is the correct payor ID"),
      payorIdConfidence: z.number().min(0).max(1).optional().describe("Your confidence in this extraction (0.0-1.0)"),
      payorIdSearchTerms: z.array(z.string()).optional().describe("Search terms/keywords used to locate this field"),

      networkStatus: z.string().optional().describe("Network type (PPO, HMO, etc.)"),
      networkStatusPath: z.string().optional().describe("JSON path where network status was found"),
      networkStatusReasoning: z.string().optional().describe("WHY you believe this is the correct network status"),
      networkStatusConfidence: z.number().min(0).max(1).optional().describe("Your confidence in this extraction (0.0-1.0)"),
      networkStatusSearchTerms: z.array(z.string()).optional().describe("Search terms/keywords used to locate this field"),

      feeSchedule: z.string().optional().describe("Fee schedule type"),
      feeSchedulePath: z.string().optional().describe("JSON path where fee schedule was found"),
      feeScheduleReasoning: z.string().optional().describe("WHY you believe this is the correct fee schedule"),
      feeScheduleConfidence: z.number().min(0).max(1).optional().describe("Your confidence in this extraction (0.0-1.0)"),
      feeScheduleSearchTerms: z.array(z.string()).optional().describe("Search terms/keywords used to locate this field"),

      benefitPeriod: z.string().optional().describe("When benefits renew"),
      benefitPeriodPath: z.string().optional().describe("JSON path where benefit period was found"),
      benefitPeriodReasoning: z.string().optional().describe("WHY you believe this is the correct benefit period"),
      benefitPeriodConfidence: z.number().min(0).max(1).optional().describe("Your confidence in this extraction (0.0-1.0)"),
      benefitPeriodSearchTerms: z.array(z.string()).optional().describe("Search terms/keywords used to locate this field"),

      effectiveDate: z.string().optional().describe("Coverage start date (YYYY-MM-DD)"),
      effectiveDatePath: z.string().optional().describe("JSON path where effective date was found"),
      effectiveDateReasoning: z.string().optional().describe("WHY you believe this is the correct effective date"),
      effectiveDateConfidence: z.number().min(0).max(1).optional().describe("Your confidence in this extraction (0.0-1.0)"),
      effectiveDateSearchTerms: z.array(z.string()).optional().describe("Search terms/keywords used to locate this field"),

      terminationDate: z.string().optional().describe("Coverage end date (YYYY-MM-DD)"),
      terminationDatePath: z.string().optional().describe("JSON path where termination date was found"),
      terminationDateReasoning: z.string().optional().describe("WHY you believe this is the correct termination date"),
      terminationDateConfidence: z.number().min(0).max(1).optional().describe("Your confidence in this extraction (0.0-1.0)"),
      terminationDateSearchTerms: z.array(z.string()).optional().describe("Search terms/keywords used to locate this field")
    }),
  }
);
