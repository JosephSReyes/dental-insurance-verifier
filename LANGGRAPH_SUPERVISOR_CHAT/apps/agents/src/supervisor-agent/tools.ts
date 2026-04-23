import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { StandardVerificationData } from '../shared/verification-types.js';

// Helper function to format coverage percentage as integer (no decimals)
function formatCoveragePercent(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return 'N/A';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return 'N/A';
  return `${Math.round(num)}%`;
}

// TODO: Replace with universal verification logic
function performComprehensiveVerification(
  patientName: string,
  insurance: string,
  appointmentDate: string,
  codes: string[],
  scrapedData: any
): any {
  return {
    status: 'pending',
    message: 'Comprehensive verification not yet implemented - awaiting universal extraction subgraph',
    patient: patientName,
    insurance,
    appointmentDate,
    codes
  };
}

// TODO: Replace with universal verification logic
function performBasicVerification(
  patientName: string,
  insurance: string,
  appointmentDate: string,
  codes: string[]
): any {
  return {
    status: 'pending',
    message: 'Basic verification not yet implemented - awaiting universal extraction subgraph',
    patient: patientName,
    insurance,
    appointmentDate,
    codes
  };
}

// Tool for extracting patient information from verification requests
export const extractPatientInfoTool = tool(
  async ({ request }) => {
    try {
      // Extract patient details from request text
      const patientInfo = {
        patient_name: extractField(request, /patient:?\s*([^\n,]+)/i) ||
                     extractField(request, /name:?\s*([^\n,]+)/i) ||
                     "Not specified",
        insurance: extractField(request, /insurance:?\s*([^\n,]+)/i) ||
                  extractField(request, /(aetna|cigna|humana|metlife|united healthcare|blue cross|anthem|bcbs)/i) ||
                  "Not specified",
        appointment_date: extractField(request, /appointment:?\s*([^\n,]+)/i) ||
                         extractField(request, /date:?\s*([^\n,]+)/i) ||
                         extractField(request, /\b(\d{1,2}\/\d{1,2}\/\d{4})\b/) ||
                         "Not specified",
        codes: extractCodes(request)
      };

      console.log('[EXTRACT_TOOL] Extracted patient info:', patientInfo);
      return JSON.stringify(patientInfo, null, 2);
    } catch (error) {
      console.error('[EXTRACT_TOOL] Error:', error);
      return `Error extracting patient info: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "extract_patient_info",
    description: "Extract patient information, insurance details, and appointment data from verification requests",
    schema: z.object({
      request: z.string().describe("The verification request text to parse")
    })
  }
);

// Tool for performing insurance verification using scraped data
export const verifyInsuranceTool = tool(
  async ({ patientName, insurance, appointmentDate, codes, patientApiDataFolder }) => {
    try {
      console.log('[VERIFY_TOOL] Starting comprehensive insurance verification...');
      console.log('[VERIFY_TOOL] Patient:', patientName);
      console.log('[VERIFY_TOOL] Codes to verify:', codes);
      console.log('[VERIFY_TOOL] Patient data folder:', patientApiDataFolder);

      let verificationResult;

      // If we have scraped data, use it for comprehensive verification
      if (patientApiDataFolder) {
        try {
          const scrapedData = loadPatientJsonFiles(patientApiDataFolder);
          console.log('[VERIFY_TOOL] Loaded scraped data for verification');
          
          verificationResult = performComprehensiveVerification(
            patientName, 
            insurance, 
            appointmentDate, 
            codes, 
            scrapedData
          );
        } catch (dataError) {
          console.warn('[VERIFY_TOOL] Could not load scraped data, using basic verification:', dataError.message);
          verificationResult = performBasicVerification(patientName, insurance, appointmentDate, codes);
        }
      } else {
        console.log('[VERIFY_TOOL] No scraped data available, using basic verification');
        verificationResult = performBasicVerification(patientName, insurance, appointmentDate, codes);
      }

      console.log('[VERIFY_TOOL] Verification completed:', verificationResult.status);
      return JSON.stringify(verificationResult, null, 2);
    } catch (error) {
      console.error('[VERIFY_TOOL] Error:', error);
      return `Error during verification: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "verify_insurance",
    description: "Perform comprehensive insurance verification using scraped data to check coverage, limitations, and eligibility for specific procedures",
    schema: z.object({
      patientName: z.string().describe("Patient's full name"),
      insurance: z.string().describe("Insurance company name"),
      appointmentDate: z.string().describe("Appointment date"),
      codes: z.array(z.string()).optional().describe("Dental procedure codes to verify"),
      patientApiDataFolder: z.string().optional().describe("Reference to patient's scraped API data folder")
    })
  }
);

// Tool for generating forms and reports
export const generateFormsTool = tool(
  async ({ verificationData, format, patientApiDataFolder }) => {
    try {
      console.log('[FORMS_TOOL] ===== STARTING FORM GENERATION =====');
      console.log('[FORMS_TOOL] Input format:', format);
      console.log('[FORMS_TOOL] patientApiDataFolder:', patientApiDataFolder);
      console.log('[FORMS_TOOL] verificationData type:', typeof verificationData);
      
      const data = typeof verificationData === 'string' ? JSON.parse(verificationData) : verificationData;

      console.log('[FORMS_TOOL] Parsed data keys:', Object.keys(data || {}));
      console.log('[FORMS_TOOL] Has procedure_details:', !!data.procedure_details);
      console.log('[FORMS_TOOL] Has benefits_package:', !!data.benefits_package);
      console.log('[FORMS_TOOL] patient_name:', data.patient_name);
      console.log('[FORMS_TOOL] patient_full_name:', data.patient_full_name);

      // Compile individual procedure_* fields from _metadata into procedure_details array
      if (!data.procedure_details && data._metadata) {
        const procedureFields = Object.keys(data._metadata).filter(key => key.startsWith('procedure_') && key !== 'procedureDetails');
        if (procedureFields.length > 0) {
          console.log('[FORMS_TOOL] Found', procedureFields.length, 'individual procedure fields in _metadata, compiling into array...');
          data.procedure_details = procedureFields.map(key => data._metadata[key].value).filter(proc => proc && proc.code);
          console.log('[FORMS_TOOL] Compiled', data.procedure_details.length, 'procedures into procedure_details array');
        }
      }

      // ⚠️ IMPORTANT: Form generation should NOT load or transform data
      // All analysis and transformations should happen BEFORE this point
      // For BCBS: procedure_details should already be in verificationData from analyze_procedures node
      
      if (!data.procedure_details && !data.benefits_package && patientApiDataFolder) {
        console.warn('[FORMS_TOOL] WARNING: No procedure_details or benefits_package found in verification data.');
        console.warn('[FORMS_TOOL] This indicates the analysis step did not complete properly.');
        console.warn('[FORMS_TOOL] Attempting fallback data load (should not be needed in production)...');
        
        const apiResults = loadPatientJsonFiles(patientApiDataFolder);
        
        if (apiResults.benefitsPackage?.data) {
          data.benefits_package = apiResults.benefitsPackage.data;
        } else if (apiResults.benefits?.data) {
          console.warn('[FORMS_TOOL] FALLBACK: BCBS data detected but procedure_details missing - this should have been analyzed earlier');
          // In production, this should throw an error - for now, just log warning
        }
        
        if (apiResults.maximumsDeductibles?.data) {
          data.maximums_deductibles = apiResults.maximumsDeductibles.data;
        } else if (apiResults.planAccumulators?.data) {
          data.maximums_deductibles = apiResults.planAccumulators.data;
        }
        
        if (apiResults.treatmentHistory?.data) {
          data.treatment_history = apiResults.treatmentHistory.data;
        } else if (apiResults.procedureHistory?.data) {
          data.treatment_history = apiResults.procedureHistory.data;
        }
      }

      // Create forms directory if it doesn't exist
      const formsDir = path.join(process.cwd(), 'forms');
      if (!fs.existsSync(formsDir)) {
        fs.mkdirSync(formsDir, { recursive: true });
      }

      // Generate timestamp and patient name for file naming
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const patientName = (data.patient_full_name || data.patient_name || 'Unknown')
        .replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
      
      const filePaths: { [key: string]: string } = {};

      // Infer waiting periods from procedure table if high-level data is N/A
      if (data.benefits_package && (!data.waiting_periods || 
          data.waiting_periods.preventive === 'N/A' || 
          data.waiting_periods.basic === 'N/A' || 
          data.waiting_periods.major === 'N/A')) {
        const inferred = inferWaitingPeriodsFromProcedures(data.benefits_package);
        if (!data.waiting_periods) {
          data.waiting_periods = { preventive: 'N/A', basic: 'N/A', major: 'N/A' };
        }
        if (data.waiting_periods.preventive === 'N/A' && inferred.preventive !== 'N/A') {
          data.waiting_periods.preventive = inferred.preventive;
        }
        if (data.waiting_periods.basic === 'N/A' && inferred.basic !== 'N/A') {
          data.waiting_periods.basic = inferred.basic;
        }
        if (data.waiting_periods.major === 'N/A' && inferred.major !== 'N/A') {
          data.waiting_periods.major = inferred.major;
        }
      }

      // Generate forms based on format requested
      const generateHTML = format === 'html' || format === 'all';
      const generateJSON = format === 'json' || format === 'all';
      const generateSummary = format === 'summary' || format === 'all';

      console.log('[FORMS_TOOL] ===== GENERATING FILES =====');
      console.log('[FORMS_TOOL] HTML:', generateHTML);
      console.log('[FORMS_TOOL] JSON:', generateJSON);
      console.log('[FORMS_TOOL] Summary:', generateSummary);

      if (generateHTML) {
        console.log('[FORMS_TOOL] Creating HTML content...');
        const htmlContent = generateComprehensiveHtmlForm(data);
        const htmlFileName = `verification_${patientName}_${timestamp}.html`;
        const htmlPath = path.join(formsDir, htmlFileName);
        console.log('[FORMS_TOOL] Writing HTML file to:', htmlPath);
        console.log('[FORMS_TOOL] HTML content size:', htmlContent.length, 'bytes');
        fs.writeFileSync(htmlPath, htmlContent, 'utf8');
        const stats = fs.statSync(htmlPath);
        filePaths.html = htmlPath;
        console.log('[FORMS_TOOL] ✅ HTML file written successfully:', htmlFileName, `(${stats.size} bytes)`);
      }

      if (generateJSON) {
        console.log('[FORMS_TOOL] Creating JSON content...');
        
        // Load and attach extraction metadata if available
        if (patientApiDataFolder) {
          try {
            const { loadAllMetadata } = await import("../shared/metadata-utils.js");
            
            let patientFolder = patientApiDataFolder;
            if (!path.isAbsolute(patientFolder)) {
              const baseDir = process.cwd();
              patientFolder = path.join(baseDir, 'patient_data', patientFolder);
            }
            
            console.log('[FORMS_TOOL] Loading extraction metadata from:', patientFolder);
            const allMetadata = await loadAllMetadata(patientFolder);
            
            if (Object.keys(allMetadata).length > 0) {
              console.log('[FORMS_TOOL] Found metadata for mappers:', Object.keys(allMetadata));
              
              // Consolidate all field metadata into _metadata field
              const fieldMetadata: Record<string, any> = {};
              
              for (const [mapperName, metadata] of Object.entries(allMetadata)) {
                console.log(`[FORMS_TOOL] Processing ${mapperName} with ${Object.keys(metadata.fields || {}).length} fields`);
                
                // Add each field's metadata
                for (const [fieldName, fieldMeta] of Object.entries(metadata.fields || {})) {
                  fieldMetadata[fieldName] = {
                    value: fieldMeta.value,
                    sourcePath: fieldMeta.sourcePath,
                    reasoning: fieldMeta.reasoning,
                    mapperName: mapperName
                  };
                }
              }
              
              // Attach metadata to data before saving JSON
              data._metadata = fieldMetadata;
              console.log('[FORMS_TOOL] ✅ Attached metadata for', Object.keys(fieldMetadata).length, 'fields to JSON');
            } else {
              console.warn('[FORMS_TOOL] ⚠️ No extraction metadata files found - AI reasoning will not be available in review dashboard');
            }
          } catch (error) {
            console.error('[FORMS_TOOL] ❌ Failed to load extraction metadata:', error);
            console.warn('[FORMS_TOOL] Continuing without metadata - AI reasoning will not be available in review dashboard');
          }
        }
        
        const jsonContent = JSON.stringify(data, null, 2);
        const jsonFileName = `verification_${patientName}_${timestamp}.json`;
        const jsonPath = path.join(formsDir, jsonFileName);
        console.log('[FORMS_TOOL] Writing JSON file to:', jsonPath);
        console.log('[FORMS_TOOL] JSON content size:', jsonContent.length, 'bytes');
        fs.writeFileSync(jsonPath, jsonContent, 'utf8');
        const stats = fs.statSync(jsonPath);
        filePaths.json = jsonPath;
        console.log('[FORMS_TOOL] ✅ JSON file written successfully:', jsonFileName, `(${stats.size} bytes)`);
      }

      if (generateSummary) {
        console.log('[FORMS_TOOL] Creating summary content...');
        const summaryContent = generateComprehensiveSummary(data);
        const summaryFileName = `verification_summary_${patientName}_${timestamp}.txt`;
        const summaryPath = path.join(formsDir, summaryFileName);
        console.log('[FORMS_TOOL] Writing summary file to:', summaryPath);
        console.log('[FORMS_TOOL] Summary content size:', summaryContent.length, 'bytes');
        fs.writeFileSync(summaryPath, summaryContent, 'utf8');
        const stats = fs.statSync(summaryPath);
        filePaths.summary = summaryPath;
        console.log('[FORMS_TOOL] ✅ Summary file written successfully:', summaryFileName, `(${stats.size} bytes)`);
      }

      console.log('[FORMS_TOOL] ===== ALL FILES CREATED =====');
      console.log('[FORMS_TOOL] Total files:', Object.keys(filePaths).length);
      console.log('[FORMS_TOOL] File paths:', JSON.stringify(filePaths, null, 2));

      // Return only file paths - no content in chat
      const result = {
        success: true,
        patient: data.patient_full_name || data.patient_name || 'Unknown',
        files_created: Object.keys(filePaths),
        file_paths: filePaths,
        forms_directory: formsDir
      };
      
      console.log('[FORMS_TOOL] Returning result:', JSON.stringify(result, null, 2));

      console.log('[FORMS_TOOL] Forms generation completed successfully');
      return JSON.stringify(result, null, 2);
      
    } catch (error) {
      console.error('[FORMS_TOOL] Error:', error);
      return `Error generating forms: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "generate_forms",
    description: "Generate and save various forms and reports from verification data. Returns file paths only.",
    schema: z.object({
      verificationData: z.union([z.string(), z.object({})]).describe("Verification result data"),
      format: z.enum(["json", "html", "summary", "all"]).describe("Format to generate and save"),
      patientApiDataFolder: z.string().optional().describe("Patient folder containing API data files")
    })
  }
);

// Tool for final human review and reporting
export const humanReviewTool = tool(
  async ({ verificationData, forms }) => {
    try {
      const data = typeof verificationData === 'string' ? JSON.parse(verificationData) : verificationData;
      const formsData = typeof forms === 'string' ? JSON.parse(forms) : forms;

      console.log('[REVIEW_TOOL] ===== INCOMING DATA STRUCTURE =====');
      console.log('[REVIEW_TOOL] verificationData type:', typeof verificationData);
      console.log('[REVIEW_TOOL] verificationData keys:', Object.keys(data || {}));
      console.log('[REVIEW_TOOL] forms keys:', Object.keys(formsData || {}));
      console.log('[REVIEW_TOOL] Full verificationData (first 1000 chars):', JSON.stringify(data, null, 2).substring(0, 1000));
      
      // Map old field names to new field names
      const patient = data.patient_name || data.patient_full_name || data.patient || 'Unknown';
      const insurance = data.insurance_company || data.insurance_carrier || data.insurance || 'Unknown';
      const appointmentDate = data.appointment_date || 'Not specified';
      const status = data.overallStatus || data.status || data.network_status || 'Unknown';
      const copay = data.copay || 'N/A';
      const deductible = data.yearly_deductible || data.deductible || 'N/A';
      const deductibleUsed = data.yearly_deductible_used || 'N/A';
      const yearlyMax = data.yearly_maximum || data.max_benefit || 'N/A';
      const yearlyMaxUsed = data.yearly_maximum_used || 'N/A';
      const timestamp = data.timestamp || new Date().toISOString();
      
      console.log('[REVIEW_TOOL] ===== MAPPED FIELD VALUES =====');
      console.log('[REVIEW_TOOL] Patient:', patient);
      console.log('[REVIEW_TOOL] Insurance:', insurance);
      console.log('[REVIEW_TOOL] Status:', status);
      console.log('[REVIEW_TOOL] Appointment Date:', appointmentDate);
      console.log('[REVIEW_TOOL] Deductible:', deductible, '(Used:', deductibleUsed, ')');
      console.log('[REVIEW_TOOL] Yearly Maximum:', yearlyMax, '(Used:', yearlyMaxUsed, ')');

      // Extract procedure coverage information
      let proceduresCovered = [];
      if (data.procedure_details && Array.isArray(data.procedure_details)) {
        proceduresCovered = data.procedure_details.map((p: any) => `${p.code} - ${p.description || 'N/A'} (${p.coverage || 'N/A'})`);
      } else if (data.procedures_covered && Array.isArray(data.procedures_covered)) {
        proceduresCovered = data.procedures_covered;
      } else if (data.procedureAnalysis && Array.isArray(data.procedureAnalysis)) {
        proceduresCovered = data.procedureAnalysis.map((p: any) => `${p.code} - ${p.status || 'N/A'}`);
      }

      const finalReport = `
# Insurance Verification Report

**Patient**: ${patient}
**Insurance**: ${insurance}
**Date**: ${appointmentDate}
**Status**: ${status}

## Coverage Details
- **Copay**: ${copay}
- **Deductible**: ${deductible}${deductibleUsed !== 'N/A' ? ` (Used: ${deductibleUsed})` : ''}
- **Annual Maximum**: ${yearlyMax}${yearlyMaxUsed !== 'N/A' ? ` (Used: ${yearlyMaxUsed})` : ''}

## Coverage Percentages
- **Preventive**: ${data.preventive_coverage || 'N/A'}
- **Basic**: ${data.basic_coverage || 'N/A'}
- **Major**: ${data.major_coverage || 'N/A'}
- **Orthodontic**: ${data.ortho_coverage || 'N/A'}

## Waiting Periods
- **Basic**: ${data.basic_waiting_period || 'N/A'}
- **Major**: ${data.major_waiting_period || 'N/A'}
- **Orthodontic**: ${data.ortho_waiting_period || 'N/A'}

## Procedures Analyzed
${proceduresCovered.length > 0 ? proceduresCovered.map((p: string) => `- ${p}`).join('\n') : '- Standard preventive care'}

## Forms Generated
${Object.keys(formsData || {}).map(format => `- ${format.toUpperCase()}`).join('\n')}

**Verification completed at**: ${timestamp}
      `.trim();

      console.log('[REVIEW_TOOL] ===== FINAL REPORT GENERATED =====');
      console.log('[REVIEW_TOOL] Report length:', finalReport.length, 'characters');
      return finalReport;
    } catch (error) {
      console.error('[REVIEW_TOOL] Error:', error);
      return `Error generating final report: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "human_review",
    description: "Generate final comprehensive report for insurance verification",
    schema: z.object({
      verificationData: z.union([z.string(), z.object({})]).describe("Verification result data"),
      forms: z.union([z.string(), z.object({})]).optional().describe("Generated forms data")
    })
  }
);

// Helper functions
function extractField(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern);
  return match ? match[1].trim() : null;
}

function extractCodes(text: string): string[] {
  const codePattern = /\b[Dd]\d{4}\b/g;
  const matches = text.match(codePattern);
  return matches ? matches.map(code => code.toUpperCase()) : [];
}

function generateComprehensiveHtmlForm(data: StandardVerificationData | any): string {
  return `<!DOCTYPE html>
<html>
<head>
    <title>Dental Insurance Verification - Full Breakdown</title>
    <style>
        body { font-family: Arial, sans-serif; font-size: 10pt; }
        .header { text-align: center; margin-bottom: 20px; }
        .section { margin-bottom: 15px; }
        .section-title { font-weight: bold; background-color: #f0f0f0; padding: 3px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
        table, th, td { border: 1px solid #666; }
        th { background-color: #5a3a7a; color: white; font-weight: bold; text-align: left; padding: 5px; }
        td { padding: 5px; border: 1px solid #666; }
        .label { font-weight: bold; width: 200px; background-color: #5a3a7a !important; color: white !important; }
        .value { width: 200px; }
        .notes { white-space: pre-wrap; }
        
        /* Network highlighting styles */
        .network-header.active-network { background-color: #2d6a3e !important; color: white !important; font-weight: bold; }
        .network-cell.active-network { background-color: #d4edda; font-weight: bold; }
        .ppo-network.active-network { border-left: 4px solid #1e4d2b; }
        .premier-network.active-network { border-left: 4px solid #1e4d2b; }
        .non-delta-network.active-network { border-left: 4px solid #1e4d2b; }
        
        /* Responsive table for procedure details */
        .procedure-table { font-size: 9pt; table-layout: fixed; width: 100%; }
        .procedure-table th { text-align: center; background-color: #5a3a7a; color: white; border: 1px solid #666; padding: 4px; font-size: 8pt; }
        .procedure-table td { padding: 3px; text-align: center; border: 1px solid #666; font-size: 8pt; }
        .procedure-table tr:nth-child(even) { background-color: #e8e8e8; }
        .procedure-table tr:nth-child(odd) { background-color: #ffffff; }
        .procedure-table th:nth-child(1) { width: 4%; }  /* Code */
        .procedure-table td:nth-child(1) { width: 4%; }
        .procedure-table th:nth-child(2) { width: 14%; }  /* Description */
        .procedure-table td:nth-child(2) { width: 14%; text-align: left; }
        .procedure-table th:nth-child(3) { width: 4%; }  /* Coverage % */
        .procedure-table td:nth-child(3) { width: 4%; }
        .procedure-table th:nth-child(4) { width: 5%; }  /* Network */
        .procedure-table td:nth-child(4) { width: 5%; }
        .procedure-table th:nth-child(5) { width: 4%; }  /* Deductible */
        .procedure-table td:nth-child(5) { width: 4%; }
        .procedure-table th:nth-child(6) { width: 3%; }  /* Max */
        .procedure-table td:nth-child(6) { width: 3%; }
        .procedure-table th:nth-child(7) { width: 7%; }  /* Age Limits */
        .procedure-table td:nth-child(7) { width: 7%; }
        .procedure-table th:nth-child(8) { width: 10%; }  /* Frequency */
        .procedure-table td:nth-child(8) { width: 10%; font-size: 7pt; }
        .procedure-table th:nth-child(9) { width: 12%; }  /* Frequency Shared */
        .procedure-table td:nth-child(9) { width: 12%; font-size: 7pt; word-wrap: break-word; }
        .procedure-table th:nth-child(10) { width: 6%; }  /* Waiting Period */
        .procedure-table td:nth-child(10) { width: 6%; }
        .procedure-table th:nth-child(11) { width: 5%; }  /* Pre-Auth */
        .procedure-table td:nth-child(11) { width: 5%; }
        .procedure-table th:nth-child(12) { width: 6%; }  /* Category */
        .procedure-table td:nth-child(12) { width: 6%; }
        .procedure-table th:nth-child(13) { width: 16%; }  /* Notes */
        .procedure-table td:nth-child(13) { width: 16%; word-wrap: break-word; text-align: left; }
        .procedure-description { text-align: left; }
        .coverage-cell { text-align: center; font-weight: bold; }
        .deductible-exempt { color: #28a745; font-weight: bold; }
        .deductible-applies { color: #dc3545; }
        .pre-auth-required { color: #dc3545; font-weight: bold; }
        .pre-auth-not-required { color: #28a745; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Dental Insurance Verification</h1>
        <h2>Full Breakdown Form</h2>
    </div>

    <div class="section">
        <div class="section-title">Patient & Subscriber Information</div>
        <table>
            <tr>
                <td class="label">Patient Name:</td>
                <td class="value">${data.patient_full_name || 'N/A'}</td>
                <td class="label">Patient DOB:</td>
                <td class="value">${data.patient_dob || 'N/A'}</td>
            </tr>
            <tr>
                <td class="label">Subscriber Name:</td>
                <td class="value">${data.subscriber_name || 'N/A'}</td>
                <td class="label">Subscriber DOB:</td>
                <td class="value">${data.subscriber_dob || 'N/A'}</td>
            </tr>
            <tr>
                <td class="label">Subscriber ID:</td>
                <td class="value">${data.subscriber_id || 'N/A'}</td>
                <td class="label">Group Number:</td>
                <td class="value">${data.group_number || 'N/A'}</td>
            </tr>
        </table>
    </div>

    <div class="section">
        <div class="section-title">Insurance Information</div>
        <table>
            <tr>
                <td class="label">Insurance Company:</td>
                <td class="value">${data.insurance_company || 'N/A'}</td>
                <td class="label">Group Plan Name:</td>
                <td class="value">${data.plan_name || 'N/A'}</td>
            </tr>
            <tr>
                <td class="label">Claims Address:</td>
                <td class="value">${data.claims_address || 'N/A'}</td>
                <td class="label">Insurance Phone:</td>
                <td class="value">${data.insurance_phone || 'N/A'}</td>
            </tr>
            <tr>
                <td class="label">Payor ID:</td>
                <td class="value">${data.payor_id || 'N/A'}</td>
                <td class="label">Network Status:</td>
                <td class="value">${data.network_status || 'N/A'}</td>
            </tr>
            <tr>
                <td class="label">Fee Schedule:</td>
                <td class="value">${data.fee_schedule || 'N/A'}</td>
                <td class="label">Benefit Period:</td>
                <td class="value">${data.benefit_period || 'N/A'}</td>
            </tr>
            <tr>
                <td class="label">Effective Date:</td>
                <td class="value">${data.effective_date || 'N/A'}</td>
                <td class="label">Termination Date:</td>
                <td class="value">${data.termination_date || 'N/A'}</td>
            </tr>
        </table>
    </div>

    <div class="section">
        <div class="section-title">Coverage & Benefits</div>
        <table>
            <tr>
                <td class="label">Preventive Coverage:</td>
                <td class="value">${data.preventive_coverage || 'N/A'}</td>
                <td class="label">Basic Coverage:</td>
                <td class="value">${data.basic_coverage || 'N/A'}</td>
            </tr>
            <tr>
                <td class="label">Major Coverage:</td>
                <td class="value">${data.major_coverage || 'N/A'}</td>
                <td class="label">Yearly Maximum:</td>
                <td class="value">${data.yearly_maximum || 'N/A'}</td>
            </tr>
            <tr>
                <td class="label">Yearly Maximum Used:</td>
                <td class="value">${data.yearly_maximum_used || 'N/A'}</td>
                <td class="label">Yearly Deductible:</td>
                <td class="value">${data.yearly_deductible || 'N/A'}</td>
            </tr>
            <tr>
                <td class="label">Yearly Deductible Used:</td>
                <td class="value">${data.yearly_deductible_used || 'N/A'}</td>
                <td class="label">Dependent Coverage Age:</td>
                <td class="value">${data.dependent_coverage_age || 'N/A'}</td>
            </tr>
            <tr>
                <td class="label">Missing Tooth Clause:</td>
                <td colspan="3">${typeof data.missing_tooth_clause === 'boolean' ? (data.missing_tooth_clause ? 'Yes' : 'No') : (data.missing_tooth_clause || 'N/A')}</td>
            </tr>
        </table>
    </div>

    <div class="section">
        <div class="section-title">Orthodontic Benefits</div>
        <table>
            <tr>
                <td class="label">Ortho Lifetime Maximum:</td>
                <td class="value">${data.ortho_lifetime_maximum || 'N/A'}</td>
                <td class="label">Ortho Coverage Percentage:</td>
                <td class="value">${data.orthodontic_coverage || 'N/A'}</td>
            </tr>
            <tr>
                <td class="label">Ortho Age Limit:</td>
                <td class="value">${data.ortho_age_limit || 'N/A'}</td>
                <td class="label">Ortho Deductible:</td>
                <td class="value">${data.ortho_deductible || 'N/A'}</td>
            </tr>
            <tr>
                <td class="label">Ortho Payment Schedule:</td>
                <td colspan="3">${data.ortho_payment_schedule || 'N/A'}</td>
            </tr>
        </table>
    </div>

    <div class="section">
        <div class="section-title">Waiting Periods</div>
        <table>
            <tr>
                <td class="label">Preventive:</td>
                <td class="value">${data.waiting_periods?.preventive || 'N/A'}</td>
                <td class="label">Basic:</td>
                <td class="value">${data.waiting_periods?.basic || 'N/A'}</td>
            </tr>
            <tr>
                <td class="label">Major:</td>
                <td colspan="3">${data.waiting_periods?.major || 'N/A'}</td>
            </tr>
        </table>
    </div>

    <div class="section">
        <div class="section-title">Procedure Details</div>
        <table class="procedure-table">
            ${generateProcedureDetailsTable(data)}
        </table>
    </div>

    <div class="section">
        <div class="section-title">Treatment History</div>
        <table>
            <tr>
                <th>Service Date</th>
                <th>Procedure Code</th>
                <th>Description</th>
                <th>Tooth/Surface</th>
                <th>Status</th>
            </tr>
            ${(data.recent_procedures || []).map((proc: any) => {
                // Standardize date format (prefer most recent service date)
                const serviceDate = proc.serviceDate || proc.lastServiceDate || proc.firstServiceDate || 'N/A';
                
                // Standardize code format (add D prefix and pad to 4 digits)
                let code = proc.code || 'N/A';
                if (code !== 'N/A' && typeof code === 'number') {
                    // Pad numeric codes to 4 digits (e.g., 120 -> D0120)
                    code = `D${String(code).padStart(4, '0')}`;
                } else if (code !== 'N/A' && typeof code === 'string' && !code.startsWith('D')) {
                    // Handle string codes without D prefix
                    code = `D${code.padStart(4, '0')}`;
                }
                
                // Standardize tooth/surface display
                let toothSurface = 'N/A';
                if (proc.toothNumber) {
                    toothSurface = proc.surfaces ? `#${proc.toothNumber} (${proc.surfaces})` : `#${proc.toothNumber}`;
                } else if (proc.tooth) {
                    toothSurface = `#${proc.tooth}`;
                }
                
                // Get status (BCBS doesn't provide status field)
                const status = proc.services?.[0]?.statusCodeDescription || 'N/A';
                
                return `
            <tr>
                <td>${serviceDate}</td>
                <td>${code}</td>
                <td>${proc.description || 'N/A'}</td>
                <td>${toothSurface}</td>
                <td>${status}</td>
            </tr>`;
            }).join('')}
        </table>
    </div>

    <div class="section">
        <div class="section-title">Verification Information</div>
        <table>
            <tr>
                <td class="label">Verified By:</td>
                <td class="value">${data.verified_by || 'N/A'}</td>
                <td class="label">Verification Date:</td>
                <td class="value">${data.verification_date?.split('T')[0] || 'N/A'}</td>
            </tr>
            <tr>
                <td class="label">Representative:</td>
                <td class="value">${data.representative || 'N/A'}</td>
                <td class="label">Reference Number:</td>
                <td class="value">${data.reference_number || 'N/A'}</td>
            </tr>
        </table>
    </div>

    <div class="section">
        <div class="section-title">Notes</div>
        <div class="notes">AI-assisted verification for ${data.insurance_company || 'insurance carrier'}. All coverage information is based on actual API data from ${data.verification_date?.split('T')[0] || 'unknown date'}. Please verify major treatment coverage with the carrier before proceeding.</div>
    </div>
</body>
</html>`;
}

/**
 * Generate procedure table from pre-analyzed BCBS procedure_details
 * This is PURE TEMPLATING - no business logic, just reading pre-determined values
 */
function generateBCBSProcedureTable(procedureDetails: any[], networkResolution: any): string {
  const tableHeader = `
    <tr>
      <th>Code</th>
      <th>Description</th>
      <th>Coverage %</th>
      <th>Network</th>
      <th>Deductible</th>
      <th>Max</th>
      <th>Age Limits</th>
      <th>Frequency</th>
      <th>Frequency Shared</th>
      <th>Waiting Period</th>
      <th>Pre-Auth</th>
      <th>Category</th>
      <th>Notes</th>
    </tr>`;
  
  const procedureRows = procedureDetails.map(proc => `
    <tr>
      <td>${proc.code}</td>
      <td style="text-align: left;">${proc.description}</td>
      <td style="font-weight: bold; ${proc.coverage_percent === 0 ? 'color: red;' : ''}">${proc.coverage_percent}%</td>
      <td>${proc.network_used === 'in-network' ? 'In-Network' : proc.network_used === 'out-of-network' ? 'Out-of-Network' : 'Unknown'}</td>
      <td>${proc.deductible_applies ? 'Applies' : 'Exempt'}</td>
      <td>${proc.maximum_applies ? 'Applies' : 'Exempt'}</td>
      <td>${proc.age_limitation || 'N/A'}</td>
      <td>${proc.frequency_limitation || 'None'}</td>
      <td>${proc.frequency_shared_codes || 'None'}</td>
      <td>${proc.waiting_period || 'None'}</td>
      <td>${proc.pre_auth_required ? 'Required' : 'Not Required'}</td>
      <td>${proc.category}</td>
      <td style="font-size: 7pt; text-align: left;">${proc.limitations && Array.isArray(proc.limitations) ? proc.limitations.join('; ') : 'None'}</td>
    </tr>
  `).join('');
  
  return tableHeader + procedureRows;
}

function generateProcedureDetailsTable(data: any): string {
  try {
    // BCBS PATH: Use pre-analyzed procedure_details (NO LOGIC, PURE TEMPLATING)
    if (data.procedure_details && Array.isArray(data.procedure_details)) {
      console.log(`[PROCEDURE_TABLE] Using pre-analyzed procedure_details (${data.procedure_details.length} procedures)`);
      return generateBCBSProcedureTable(data.procedure_details, data.network_resolution);
    }
    
    // DELTA DENTAL PATH: Use benefits_package
    if (!data.benefits_package?.treatment) {
      return '<tr><td colspan="12">No procedure details available</td></tr>';
    }

    console.log('[PROCEDURE_TABLE] Using benefits_package (Delta Dental format)');
    const procedures: any[] = [];
    
    const applicableNetwork = resolveApplicableNetwork(data);
    const patientNetworkKey = applicableNetwork?.key || determineActiveNetwork(data);
    
    console.log(`[PROCEDURE_TABLE] Resolved applicable network: ${patientNetworkKey} (${applicableNetwork?.label || 'fallback'})`);
    
    const tableHeader = `
      <tr>
        <th>Code</th>
        <th>Description</th>
        <th>Coverage %</th>
        <th>Network</th>
        <th>Deductible</th>
        <th>Max</th>
        <th>Age Limits</th>
        <th>Frequency</th>
        <th>Frequency Shared</th>
        <th>Waiting Period</th>
        <th>Pre-Auth</th>
        <th>Category</th>
        <th>Notes</th>
      </tr>`;
    
    const crossCheckReverseLookup = buildCrossCheckReverseLookup(data.benefits_package.treatment);
    
    data.benefits_package.treatment.forEach((treatment: any) => {
      if (treatment.procedureClass) {
        treatment.procedureClass.forEach((procClass: any) => {
          if (procClass.procedure) {
            procClass.procedure.forEach((proc: any) => {
              
              const resolvedCoverage = resolveSingleCoverage(proc, patientNetworkKey);
              
              const frequencyDetail = extractFrequencyDetails(proc);
              const ageLimits = extractAgeLimitations(proc);
              const category = treatment.treatmentDescription || 'N/A';
              const frequencySharedCodes = extractFrequencySharedCodes(proc, crossCheckReverseLookup);
              const notes = buildComprehensiveNotes(proc, crossCheckReverseLookup);

              procedures.push({
                code: proc.code,
                description: proc.description,
                coverage: resolvedCoverage.coverage,
                network: patientNetworkKey === 'ppo' ? 'In-Network' : patientNetworkKey === 'premier' ? 'Premier' : patientNetworkKey === 'non-delta' ? 'Non-Delta' : 'Out-of-Network',
                deductible: resolvedCoverage.deductibleExempted ? 'Exempt' : 'Applies',
                max: resolvedCoverage.maximumExempted ? 'Exempt' : 'Applies',
                ageLimits: ageLimits,
                frequencyDetail: frequencyDetail,
                frequencyShared: frequencySharedCodes.length > 0 ? frequencySharedCodes.join(', ') : 'None',
                waitingPeriod: formatWaitingPeriodValue(proc.waitingPeriod),
                preAuth: proc.preApprovalRequired === true || proc.preAuthorizationRequired === true 
                  ? 'Required' 
                  : proc.preApprovalRequired === false || proc.preAuthorizationRequired === false 
                    ? 'Not Required' 
                    : 'N/A',
                category: category,
                notes: notes,
                treatmentCode: treatment.treatmentCode
              });
            });
          }
        });
      }
    });

    procedures.sort((a, b) => a.code.localeCompare(b.code));

    const procedureRows = procedures.map(proc => generateSimpleProcedureRow(proc)).join('');
    
    return tableHeader + procedureRows;

  } catch (error) {
    console.error('Error generating procedure details table:', error);
    return '<tr><td colspan="9">Error loading procedure details</td></tr>';
  }
}

function resolveSingleCoverage(proc: any, networkKey: string): any {
  const networkCodeMap: {[key: string]: string} = {
    'ppo': '##PPO',
    'premier': '##PMR',
    'non-delta': '##NP',
    'oon': '##OON'
  };
  
  const targetNetworkCode = networkCodeMap[networkKey] || '##PPO';
  
  const networkData = proc.network?.find((n: any) => n.code === targetNetworkCode);
  
  if (networkData?.coverageDetail?.[0]) {
    const detail = networkData.coverageDetail[0];
    return {
      coverage: formatCoveragePercent(detail.benefitCoverageLevel),
      copay: detail.copay || '$0.00',
      deductibleExempted: detail.deductibleWaived || detail.deductibleExempted || false,
      maximumExempted: detail.maximumExempted || false
    };
  }
  
  console.warn(`[COVERAGE_RESOLUTION] No coverage found for ${proc.code} on network ${networkKey} (${targetNetworkCode}), using fallback`);
  
  if (proc.network && proc.network.length > 0) {
    const fallbackNetwork = proc.network[0];
    const fallbackDetail = fallbackNetwork.coverageDetail?.[0];
    if (fallbackDetail) {
      return {
        coverage: formatCoveragePercent(fallbackDetail.benefitCoverageLevel),
        copay: fallbackDetail.copay || '$0.00',
        deductibleExempted: fallbackDetail.deductibleWaived || fallbackDetail.deductibleExempted || false,
        maximumExempted: fallbackDetail.maximumExempted || false
      };
    }
  }
  
  return {
    coverage: 'N/A',
    copay: '$0.00',
    deductibleExempted: false,
    maximumExempted: false
  };
}

// Helper function to detect available networks from data
function detectAvailableNetworks(data: any): Array<{key: string, code: string, label: string}> {
  const networkMap = new Map<string, {key: string, code: string, label: string}>();
  
  // Check first procedure to see what networks are available
  if (data.benefits_package?.treatment?.[0]?.procedureClass?.[0]?.procedure?.[0]?.network) {
    const sampleProc = data.benefits_package.treatment[0].procedureClass[0].procedure[0];
    sampleProc.network.forEach((net: any) => {
      if (net.code === '##PPO') {
        networkMap.set('ppo', {key: 'ppo', code: '##PPO', label: 'In-Network (PPO)'});
      } else if (net.code === '##PMR') {
        networkMap.set('premier', {key: 'premier', code: '##PMR', label: 'Premier'});
      } else if (net.code === '##NP') {
        networkMap.set('non-delta', {key: 'non-delta', code: '##NP', label: 'Non-Delta'});
      } else if (net.code === '##OON') {
        networkMap.set('oon', {key: 'oon', code: '##OON', label: 'Out-of-Network'});
      }
    });
  }
  
  // Default to PPO and OON if nothing found
  if (networkMap.size === 0) {
    networkMap.set('ppo', {key: 'ppo', code: '##PPO', label: 'In-Network (PPO)'});
    networkMap.set('oon', {key: 'oon', code: '##OON', label: 'Out-of-Network'});
  }
  
  return Array.from(networkMap.values());
}

function normalizeNetworkKey(networkString: string): string {
  const normalized = networkString.toLowerCase();
  if (normalized.includes('ppo')) return 'ppo';
  if (normalized.includes('premier') || normalized.includes('pmr')) return 'premier';
  if (normalized.includes('non-delta') || normalized.includes('non delta')) return 'non-delta';
  if (normalized.includes('out') && normalized.includes('network')) return 'oon';
  if (normalized.includes('oon')) return 'oon';
  return 'ppo';
}

function resolveApplicableNetwork(data: any): {key: string, code: string, label: string} | null {
  const patientNetworkStatus = data.network_status?.toLowerCase() || '';
  const officeContracts = data.office_contracted_plans?.toLowerCase() || '';
  
  const patientNetworkKey = normalizeNetworkKey(patientNetworkStatus);
  
  const officeContractsArray = officeContracts.split(',').map(c => c.trim().toLowerCase());
  
  if (officeContractsArray.includes(patientNetworkKey) || 
      officeContractsArray.includes('all') || 
      officeContractsArray.includes('both')) {
    
    const networkMap: {[key: string]: {key: string, code: string, label: string}} = {
      'ppo': {key: 'ppo', code: '##PPO', label: 'In-Network (PPO)'},
      'premier': {key: 'premier', code: '##PMR', label: 'Premier'},
      'non-delta': {key: 'non-delta', code: '##NP', label: 'Non-Delta'},
      'oon': {key: 'oon', code: '##OON', label: 'Out-of-Network'}
    };
    
    return networkMap[patientNetworkKey] || networkMap['ppo'];
  }
  
  console.warn(`[NETWORK_RESOLUTION] Patient network "${patientNetworkKey}" not in office contracts "${officeContracts}". Falling back to available network.`);
  return null;
}

function determineActiveNetwork(data: any): string {
  const networkStatus = data.network_status?.toLowerCase() || '';
  
  if (networkStatus.includes('ppo')) return 'ppo';
  if (networkStatus.includes('premier')) return 'premier';
  if (networkStatus.includes('non-delta')) return 'non-delta';
  
  return 'ppo';
}

// Helper function to extract coverage information from network
function extractCoverageInfo(network: any): any {
  if (!network?.coverageDetail?.[0]) {
    return {
      coverage: 'N/A',
      copay: '$0.00',
      deductibleExempted: false,
      maximumExempted: false
    };
  }
  
  const detail = network.coverageDetail[0];
  
  const coverage = formatCoveragePercent(detail.benefitCoverageLevel);
  
  return {
    coverage: coverage,
    copay: `$${detail.copayAmount || '0.00'}`,
    deductibleExempted: detail.deductibleExempted || detail.deductibleWaived || false,
    maximumExempted: detail.maximumExempted || !detail.maximumApplies || false
  };
}

// Helper function to extract frequency details
function extractFrequencyDetails(proc: any): string {
  if (proc.frequencyLimitation) {
    return proc.frequencyLimitation;
  }
  
  if (!proc.limitation || proc.limitation.length === 0) {
    return 'As needed';
  }
  
  const limitation = proc.limitation[0];
  if (limitation.frequencyLimitationText) {
    return limitation.frequencyLimitationText;
  }
  
  if (limitation.benefitQuantity) {
    const period = limitation.periodTypeCode === 'CA' ? 'calendar year' : 'period';
    return `${limitation.benefitQuantity} per ${period}`;
  }
  
  return 'See notes';
}

// Helper function to extract age limitations
function extractAgeLimitations(proc: any): string {
  if (proc.ageLimitation) {
    return proc.ageLimitation;
  }
  
  if (!proc.network?.[0]?.coverageDetail?.[0]) {
    return 'None';
  }
  
  const detail = proc.network[0].coverageDetail[0];
  if (detail.minAge === 0 && detail.maxAge === 0) {
    return 'None';
  }
  
  if (detail.adult) {
    return 'Adult only';
  }
  
  if (detail.minAge > 0 || detail.maxAge > 0) {
    if (detail.maxAge === 0) return `Ages ${detail.minAge}+`;
    if (detail.minAge === 0) return `Ages 0-${detail.maxAge}`;
    return `Ages ${detail.minAge}-${detail.maxAge}`;
  }
  
  return 'None';
}

// Helper function to build reverse lookup for crossCheckProcedureCodes
function buildCrossCheckReverseLookup(treatments: any[]): Map<string, Set<string>> {
  const lookup = new Map<string, Set<string>>();
  
  treatments.forEach((treatment: any) => {
    if (treatment.procedureClass) {
      treatment.procedureClass.forEach((procClass: any) => {
        if (procClass.procedure) {
          procClass.procedure.forEach((proc: any) => {
            if (proc.crossCheckProcedureCodes) {
              const codes = proc.crossCheckProcedureCodes.split(',').map((c: string) => c.trim());
              // For each code in the list, record that proc.code mentions it
              codes.forEach((code: string) => {
                if (!lookup.has(code)) {
                  lookup.set(code, new Set<string>());
                }
                // Add all codes from this group to this code's set
                codes.forEach((c: string) => lookup.get(code)!.add(c));
              });
            }
          });
        }
      });
    }
  });
  
  return lookup;
}

// Helper function to infer waiting periods from procedure table
function inferWaitingPeriodsFromProcedures(benefitsPackage: any): { preventive: string, basic: string, major: string } {
  const result = { preventive: 'N/A', basic: 'N/A', major: 'N/A' };
  
  const preventiveNames = ['oral exam', 'prophylaxis', 'x-ray', 'fluoride', 'sealant', 'space maintainer', 'diagnostic', 'preventive'];
  const basicNames = ['filling', 'amalgam', 'composite', 'extraction', 'oral surgery', 'endodontic', 'periodontic', 'root canal', 'basic'];
  const majorNames = ['crown', 'bridge', 'denture', 'implant', 'prosthetic', 'major'];
  
  const preventiveWaitingPeriods = new Set<string>();
  const basicWaitingPeriods = new Set<string>();
  const majorWaitingPeriods = new Set<string>();
  
  if (!benefitsPackage?.treatment) return result;
  
  benefitsPackage.treatment.forEach((treatment: any) => {
    if (treatment.procedureClass) {
      treatment.procedureClass.forEach((procClass: any) => {
        if (procClass.procedure) {
          procClass.procedure.forEach((proc: any) => {
            const category = (proc.benefitCategory || treatment.treatmentDescription || '').toLowerCase();
            const description = (proc.description || '').toLowerCase();
            const waitingPeriod = formatWaitingPeriodValue(proc.waitingPeriod);
            
            console.log(`[INFER_WAITING] Code: ${proc.code}, Category: ${category}, Description: ${description.substring(0, 30)}, WaitingPeriod: ${waitingPeriod}`);
            
            if (waitingPeriod === 'N/A' || waitingPeriod === 'None') return;
            
            // Try to match by category first
            let matched = false;
            if (preventiveNames.some(name => category.includes(name) || description.includes(name))) {
              preventiveWaitingPeriods.add(waitingPeriod);
              matched = true;
            } else if (basicNames.some(name => category.includes(name) || description.includes(name))) {
              basicWaitingPeriods.add(waitingPeriod);
              matched = true;
            } else if (majorNames.some(name => category.includes(name) || description.includes(name))) {
              majorWaitingPeriods.add(waitingPeriod);
              matched = true;
            }
            
            // If no match by name, infer by coverage percentage
            if (!matched && proc.network && proc.network.length > 0) {
              const coverage = proc.network[0]?.coverageDetail?.[0]?.benefitCoverageLevel;
              if (coverage !== null && coverage !== undefined) {
                if (coverage >= 90) {
                  preventiveWaitingPeriods.add(waitingPeriod);
                } else if (coverage >= 60 && coverage < 90) {
                  basicWaitingPeriods.add(waitingPeriod);
                } else if (coverage >= 40 && coverage < 60) {
                  majorWaitingPeriods.add(waitingPeriod);
                }
              }
            }
          });
        }
      });
    }
  });
  
  if (preventiveWaitingPeriods.size > 0) {
    const periods = Array.from(preventiveWaitingPeriods);
    result.preventive = periods.length === 1 ? periods[0] : periods.join('/');
  }
  
  if (basicWaitingPeriods.size > 0) {
    const periods = Array.from(basicWaitingPeriods);
    result.basic = periods.length === 1 ? periods[0] : periods.join('/');
  }
  
  if (majorWaitingPeriods.size > 0) {
    const periods = Array.from(majorWaitingPeriods);
    result.major = periods.length === 1 ? periods[0] : periods.join('/');
  }
  
  console.log('[INFER_WAITING] Final result:', result);
  console.log('[INFER_WAITING] Preventive periods collected:', Array.from(preventiveWaitingPeriods));
  console.log('[INFER_WAITING] Basic periods collected:', Array.from(basicWaitingPeriods));
  console.log('[INFER_WAITING] Major periods collected:', Array.from(majorWaitingPeriods));
  
  return result;
}

// Helper function to format waiting period value
function formatWaitingPeriodValue(waitingPeriod: any): string {
  if (waitingPeriod === null || waitingPeriod === undefined) {
    return 'N/A';
  }
  
  if (typeof waitingPeriod === 'string') {
    if (waitingPeriod.toLowerCase() === 'none' || waitingPeriod === '0' || waitingPeriod === '0 months') {
      return 'None';
    }
    return waitingPeriod;
  }
  
  if (typeof waitingPeriod === 'object') {
    const inNetwork = waitingPeriod.inNetwork;
    const unit = waitingPeriod.unit || 'months';
    
    if (inNetwork === null || inNetwork === undefined) {
      return 'N/A';
    }
    
    if (inNetwork === 0 || waitingPeriod.waived === true) {
      return 'None';
    }
    
    return `${inNetwork} ${unit}`;
  }
  
  return 'N/A';
}

// Helper function to extract frequency shared codes
function extractFrequencySharedCodes(proc: any, reverseLookup?: Map<string, Set<string>>): string[] {
  let crossCheckCodes: string[] = [];
  
  if (proc.crossCheckProcedureCodes && proc.crossCheckProcedureCodes !== proc.code) {
    const codes = proc.crossCheckProcedureCodes.split(',').map((c: string) => c.trim());
    const otherCodes = codes.filter((c: string) => c !== proc.code);
    
    if (otherCodes.length > 0) {
      crossCheckCodes = otherCodes;
    } else if (reverseLookup && reverseLookup.has(proc.code)) {
      const relatedCodes = Array.from(reverseLookup.get(proc.code)!).filter(c => c !== proc.code).sort();
      if (relatedCodes.length > 0) {
        crossCheckCodes = relatedCodes;
      }
    }
  } else if (reverseLookup && reverseLookup.has(proc.code)) {
    const relatedCodes = Array.from(reverseLookup.get(proc.code)!).filter(c => c !== proc.code).sort();
    if (relatedCodes.length > 0) {
      crossCheckCodes = relatedCodes;
    }
  }
  
  return crossCheckCodes;
}

// Helper function to build comprehensive notes
function buildComprehensiveNotes(proc: any, reverseLookup?: Map<string, Set<string>>): string {
  if (proc.notes && Array.isArray(proc.notes) && proc.notes.length > 0) {
    return proc.notes.join('<br>');
  }
  
  const notes: string[] = [];
  
  if (proc.suppressionIndicator) {
    notes.push('May require additional documentation');
  }
  
  if (proc.incentiveProcedure) {
    notes.push('Incentive procedure');
  }
  
  return notes.join('<br>') || 'None';
}

// Helper function to generate a procedure row with network highlighting
function generateSimpleProcedureRow(proc: any): string {
  const preAuthClass = proc.preAuth === 'Required' ? 'pre-auth-required' : 'pre-auth-not-required';
  const deductibleClass = proc.deductible === 'Exempt' ? 'deductible-exempt' : 'deductible-applies';
  const maxClass = proc.max === 'Exempt' ? 'deductible-exempt' : 'deductible-applies';
  
  return `
    <tr>
      <td>${proc.code}</td>
      <td class="procedure-description">${proc.description}</td>
      <td class="coverage-cell">${proc.coverage}</td>
      <td>${proc.network || 'N/A'}</td>
      <td class="${deductibleClass}">${proc.deductible}</td>
      <td class="${maxClass}">${proc.max}</td>
      <td>${proc.ageLimits}</td>
      <td>${proc.frequencyDetail}</td>
      <td>${proc.frequencyShared || 'None'}</td>
      <td>${proc.waitingPeriod || 'N/A'}</td>
      <td class="${preAuthClass}">${proc.preAuth}</td>
      <td>${proc.category}</td>
      <td class="notes">${proc.notes}</td>
    </tr>`;
}

function generateComprehensiveSummary(data: any): string {
  // Network resolution info (BCBS specific)
  let networkSection = `Network Status: ${data.network_status || 'N/A'}`;
  if (data.network_resolution) {
    networkSection = `Network Status: ${data.network_resolution.resolved_status}
Patient Plan Type: ${data.network_resolution.patient_plan_type}
Office Contracts: ${data.network_resolution.office_contracts.join(', ')}
Determination: ${data.network_resolution.determination_logic}`;
  }

  return `DENTAL INSURANCE VERIFICATION SUMMARY

Patient: ${data.patient_full_name || 'N/A'}
DOB: ${data.patient_dob || 'N/A'}
Subscriber ID: ${data.subscriber_id || 'N/A'}
Group: ${data.group_number || 'N/A'}

Insurance: ${data.insurance_company || 'N/A'}
Plan: ${data.plan_name || 'N/A'}
${networkSection}
Effective: ${data.effective_date || 'N/A'} - ${data.termination_date || 'N/A'}

COVERAGE SUMMARY:
- Preventive: ${data.preventive_coverage || 'N/A'}
- Basic: ${data.basic_coverage || 'N/A'}  
- Major: ${data.major_coverage || 'N/A'}
- Annual Maximum: ${data.yearly_maximum || 'N/A'}
- Annual Deductible: ${data.yearly_deductible || 'N/A'}

VERIFICATION DETAILS:
- Verified By: ${data.verified_by || 'N/A'}
- Date: ${data.verification_date?.split('T')[0] || 'N/A'}
- Reference: ${data.reference_number || 'N/A'}
- Data Source: ${data.data_source || 'N/A'}

${data.procedure_details ? 'This verification was completed using real-time BCBS API data.' : 'This verification was completed using real-time Delta Dental API data.'}
Please contact the carrier for pre-authorization of major treatments.`;
}

// Legacy functions for backward compatibility
function generateHtmlForm(data: any): string {
  return generateComprehensiveHtmlForm(data);
}

function generateSummary(data: any): string {
  return generateComprehensiveSummary(data);
}

// ===== REUSABLE API LISTENER TOOL =====

interface ApiEndpointConfig {
  key: string;
  urlPattern: string;
  displayName?: string;
  domain?: string;
  expectedStatus?: number;
}

interface ApiListenerOptions {
  endpoints: ApiEndpointConfig[];
  timeoutMs?: number;
  domain?: string;
  requireAllSuccess?: boolean;
}

interface ApiResponseResult {
  [key: string]: any;
  _metadata: {
    capturedCount: number;
    totalExpected: number;
    errors: Record<string, string>;
    successRate: number;
    completedAt: Date;
  };
}

async function startGenericApiListener(
  page: any,
  options: ApiListenerOptions
): Promise<ApiResponseResult> {
  const {
    endpoints,
    timeoutMs = 60000,
    domain = '',
    requireAllSuccess = false
  } = options;

  console.log(`🎯 Starting generic API listener for ${endpoints.length} endpoints...`);

  const result: ApiResponseResult = {
    _metadata: {
      capturedCount: 0,
      totalExpected: endpoints.length,
      errors: {},
      successRate: 0,
      completedAt: new Date()
    }
  };

  if (!endpoints || endpoints.length === 0) {
    throw new Error('At least one API endpoint must be specified');
  }

  const responsePromises = endpoints.map((endpoint) => {
    const {
      key,
      urlPattern,
      displayName = key,
      domain: endpointDomain = domain,
      expectedStatus = 200
    } = endpoint;

    return new Promise<{ key: string; data?: any; error?: string }>((resolve) => {
      console.log(`📡 Listening for ${displayName} (${urlPattern})`);

      const responseHandler = async (response: any) => {
        const url = response.url();

        const domainMatch = !endpointDomain || url.includes(endpointDomain);
        const patternMatch = url.includes(urlPattern);

        if (domainMatch && patternMatch) {
          try {
            const status = response.status();

            if (status === expectedStatus) {
              let responseData;
              const contentType = response.headers()['content-type'] || '';

              if (contentType.includes('application/json')) {
                responseData = await response.json();
              } else {
                responseData = await response.text();
              }

              console.log(`✅ Captured ${displayName} (status: ${status})`);

              page.off('response', responseHandler);

              resolve({ key, data: responseData });
            } else {
              console.log(`⚠️ ${displayName} returned unexpected status ${status} (expected ${expectedStatus})`);
              page.off('response', responseHandler);
              resolve({ key, error: `HTTP ${status} (expected ${expectedStatus})` });
            }
          } catch (error) {
            console.error(`❌ Failed to parse ${displayName} response:`, error.message);
            page.off('response', responseHandler);
            resolve({ key, error: `Parse error: ${error.message}` });
          }
        }
      };

      page.on('response', responseHandler);
    });
  });

  console.log(`⏳ Listeners active on current page. Waiting for API responses...`);

  try {
    const allResponsesPromise = Promise.all(responsePromises);

    let responses;
    if (timeoutMs > 0) {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`API listener timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      responses = await Promise.race([allResponsesPromise, timeoutPromise]);
    } else {
      responses = await allResponsesPromise;
    }

    responses.forEach(({ key, data, error }) => {
      if (data !== undefined) {
        result[key] = data;
        result._metadata.capturedCount++;
      } else if (error) {
        result._metadata.errors[key] = error;
      }
    });

    result._metadata.successRate = (result._metadata.capturedCount / result._metadata.totalExpected) * 100;
    result._metadata.completedAt = new Date();

    console.log(`🎉 API listener completed: ${result._metadata.capturedCount}/${result._metadata.totalExpected} captured (${result._metadata.successRate.toFixed(1)}%)`);

    if (requireAllSuccess && result._metadata.capturedCount < result._metadata.totalExpected) {
      const errorCount = Object.keys(result._metadata.errors).length;
      throw new Error(`Required all APIs to succeed, but ${errorCount} failed: ${Object.keys(result._metadata.errors).join(', ')}`);
    }

    return result;

  } catch (error) {
    console.error('❌ Generic API listener error:', error);
    throw error;
  }
}

// Predefined configurations for common use cases
export const API_CONFIGS: Record<string, any> = {
  DELTA_DENTAL_INSURANCE: {
    endpoints: [
      { key: 'benefitsPackage', urlPattern: '/benefits/benefits-package', displayName: 'Benefits Package' },
      { key: 'maximumsDeductibles', urlPattern: '/benefits/maximums-deductibles', displayName: 'Maximums & Deductibles' },
      { key: 'claimMailingAddresses', urlPattern: '/eligibility/claim-mailing-addresses', displayName: 'Claim Mailing Addresses' },
      { key: 'treatmentHistory', urlPattern: '/treatment-history', displayName: 'Treatment History' },
      { key: 'additionalBenefits', urlPattern: '/benefits/additional-benefits', displayName: 'Additional Benefits' },
      { key: 'patientRoster', urlPattern: '/patient-mgnt/benefits/patient-roster', displayName: 'Patient Roster' }
    ],
    domain: 'deltadentalins.com',
    timeoutMs: 60000
  },

  PATIENT_SEARCH_APIS: {
    endpoints: [
      { key: 'patientInfo', urlPattern: '/patient/info', displayName: 'Patient Information' },
      { key: 'patientHistory', urlPattern: '/patient/history', displayName: 'Patient History' }
    ],
    domain: 'deltadentalins.com',
    timeoutMs: 30000
  },

  AETNA_BENEFITS: {
    endpoints: [
      { key: 'coverage', urlPattern: '/api/coverage', displayName: 'Coverage Details' },
      { key: 'claims', urlPattern: '/api/claims', displayName: 'Claims History' }
    ],
    domain: 'aetna.com',
    timeoutMs: 45000
  }
} as const;

// Tool for starting background API listener (original version for direct Playwright access)
export const apiListenerTool = tool(
  async ({ endpoints, timeoutMs, domain, requireAllSuccess, usePreset }, config: any) => {
    const page = config?.page;
    try {
      // Use preset configuration or custom endpoints
      const listenerConfig = usePreset && API_CONFIGS[usePreset]
        ? { ...API_CONFIGS[usePreset], timeoutMs, domain, requireAllSuccess }
        : { endpoints, timeoutMs, domain, requireAllSuccess };

      if (!listenerConfig.endpoints) {
        throw new Error('No endpoints specified. Either provide endpoints array or use a valid preset.');
      }

      const result = await startGenericApiListener(page, listenerConfig);

      console.log('[API_LISTENER_TOOL] Background API listener completed:', {
        captured: result._metadata.capturedCount,
        total: result._metadata.totalExpected,
        successRate: result._metadata.successRate
      });

      return JSON.stringify(result, null, 2);
    } catch (error) {
      console.error('[API_LISTENER_TOOL] Error:', error);
      return `Error in API listener: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "start_api_listener",
    description: "Start listening for specified API responses in background on current browser page. Returns when all APIs complete or timeout.",
    schema: z.object({
      endpoints: z.array(z.object({
        key: z.string().describe("Unique key for this API response"),
        urlPattern: z.string().describe("URL pattern to match (e.g., '/api/benefits')"),
        displayName: z.string().optional().describe("Human-readable name for logging"),
        domain: z.string().optional().describe("Domain to match (overrides default)"),
        expectedStatus: z.number().optional().describe("Expected HTTP status code (default: 200)")
      })).optional().describe("Array of API endpoints to listen for"),
      timeoutMs: z.number().optional().describe("Timeout in milliseconds (default: 60000)"),
      domain: z.string().optional().describe("Default domain for all endpoints"),
      requireAllSuccess: z.boolean().optional().describe("Fail if any endpoint fails (default: false)"),
      usePreset: z.enum(['DELTA_DENTAL_INSURANCE', 'PATIENT_SEARCH_APIS', 'AETNA_BENEFITS']).optional().describe("Use predefined endpoint configuration")
    })
  }
);

// ===== FILE STORAGE HELPER FUNCTIONS =====

/**
 * Helper function to create patient folder and store API responses as JSON files
 */
function createPatientJsonFiles(patientName: string, apiResults: Record<string, any>): string {
  try {
    // Create safe folder name from patient name and timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safePatientName = patientName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
    const folderName = `${safePatientName}_${timestamp}`;
    
    // Create data directory structure
    const dataDir = path.join(process.cwd(), 'patient_data');
    const patientDir = path.join(dataDir, folderName);
    
    // Ensure directories exist
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(patientDir)) {
      fs.mkdirSync(patientDir, { recursive: true });
    }
    
    console.log(`📁 Created patient directory: ${patientDir}`);
    
    // Store each API response as a separate JSON file
    const filePaths: string[] = [];
    Object.entries(apiResults).forEach(([endpoint, responseData]) => {
      const fileName = `${endpoint}_${safePatientName}_${timestamp}.json`;
      const filePath = path.join(patientDir, fileName);
      
      // Write the JSON file
      fs.writeFileSync(filePath, JSON.stringify(responseData, null, 2), 'utf8');
      filePaths.push(filePath);
      
      console.log(`💾 Saved ${endpoint} data to: ${fileName}`);
    });
    
    console.log(`✅ Successfully stored ${filePaths.length} API response files for ${patientName}`);
    return folderName; // Return folder reference for state storage
    
  } catch (error) {
    console.error('❌ Error creating patient JSON files:', error);
    throw new Error(`Failed to create patient files: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Helper function to retrieve API data from patient folder
 */
export function loadPatientJsonFiles(folderName: string): Record<string, any> {
  try {
    const dataDir = path.join(process.cwd(), 'patient_data');
    const patientDir = path.join(dataDir, folderName);
    
    if (!fs.existsSync(patientDir)) {
      throw new Error(`Patient folder not found: ${folderName}`);
    }
    
    const results: Record<string, any> = {};
    const files = fs.readdirSync(patientDir).filter(file => file.endsWith('.json'));
    
    files.forEach(file => {
      const filePath = path.join(patientDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);
      
      // Extract endpoint name from filename (first part before underscore)
      const endpointName = file.split('_')[0];
      results[endpointName] = data;
    });
    
    console.log(`📂 Loaded ${Object.keys(results).length} API files from folder: ${folderName}`);
    return results;
    
  } catch (error) {
    console.error('❌ Error loading patient JSON files:', error);
    throw new Error(`Failed to load patient files: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ===== END OF FILE =====