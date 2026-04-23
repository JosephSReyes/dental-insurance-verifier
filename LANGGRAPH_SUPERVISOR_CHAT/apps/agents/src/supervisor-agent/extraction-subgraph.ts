/**
 * Universal Extraction Subgraph
 * Delegates login and extraction to PortalAutomation project
 *
 * IMPORTANT: Uses shared WorkflowState following LangGraph best practices
 * State updates from this subgraph automatically propagate to parent graph
 *
 * Extraction Implementation:
 * - Calls PortalAutomation sibling project via runPortalScraper()
 * - PortalAutomation handles login, navigation, and data extraction
 * - Returns structured data + PDF path
 * - No longer uses browser-use or MCP services
 */

import { StateGraph, END } from "@langchain/langgraph";
import { WorkflowState } from "../shared/workflow-state.js";
import { AIMessage } from "@langchain/core/messages";
import {
  runPortalScraper,
  mapProviderToPortalId,
  formatDateForScraper,
  parsePatientName,
  checkExistingPatientData,
  createResultFromExistingFolder,
  type ScraperRequest,
  type ScraperResult
} from "../shared/portal-automation-client.js";

/**
 * Type alias for extraction subgraph state
 * Uses the shared WorkflowState to ensure state updates propagate correctly
 */
type ExtractionState = typeof WorkflowState.State;

/**
 * Default dental codes to check for all patients
 * These cover common procedures across preventive, restorative, and orthodontic care
 */
const DEFAULT_DENTAL_CODES = [
  'D8090', 'D1110', 'D0120', 'D0150', 'D0180', 'D0140', 'D1206', 'D0431',
  'D0274', 'D0220', 'D0230', 'D0210', 'D0330', 'D1351', 'D4341', 'D4346',
  'D4355', 'D4910', 'D2391', 'D9110', 'D7140', 'D7210', 'D3330', 'D2740',
  'D2950', 'D2920', 'D2954', 'D6010', 'D6058', 'D6057', 'D6104', 'D7953',
  'D4266', 'D9945', 'D4381'
];

/**
 * Node: Portal Scraper
 * Calls PortalAutomation project to handle login and extraction
 *
 * This replaces the old multi-node flow (login → navigation → capture strategies)
 * with a single call to the PortalAutomation framework
 */
async function portalScraperNode(state: ExtractionState): Promise<Partial<ExtractionState>> {
  console.log('[PORTAL_SCRAPER] Starting PortalAutomation scraper...');

  try {
    const provider = state.extractedInfo?.insurance_provider;
    const office = state.office;

    if (!provider) {
      throw new Error('Insurance provider not found in extracted info');
    }

    if (!office) {
      throw new Error('Office configuration not found in state');
    }

    console.log(`[PORTAL_SCRAPER] Provider: ${provider}`);
    console.log(`[PORTAL_SCRAPER] Office: ${office.name}`);

    // Map provider to portal ID
    const portalId = mapProviderToPortalId(provider);
    console.log(`[PORTAL_SCRAPER] Portal ID: ${portalId}`);

    // Parse patient name (optional)
    const patientName = state.extractedInfo?.patient_name;
    let firstName: string | undefined;
    let lastName: string | undefined;

    if (patientName) {
      const parsedName = parsePatientName(patientName);
      firstName = parsedName.firstName;
      lastName = parsedName.lastName;
      console.log(`[PORTAL_SCRAPER] Patient: ${firstName} ${lastName}`);
    } else {
      console.log('[PORTAL_SCRAPER] Patient name not provided');
    }

    // Check for existing recent data (within 24 hours) before scraping
    let result: ScraperResult;
    let usedCachedData = false;

    if (firstName && lastName) {
      console.log('[PORTAL_SCRAPER] Checking for existing patient data...');
      const existingFolder = checkExistingPatientData(firstName, lastName, portalId, 24);

      if (existingFolder) {
        console.log(`[PORTAL_SCRAPER] ✓ Using cached data from: ${existingFolder}`);
        result = createResultFromExistingFolder(existingFolder, portalId);
        usedCachedData = true;
      }
    }

    // Only run scraper if we don't have cached data
    if (!usedCachedData) {
      console.log('[PORTAL_SCRAPER] No recent cached data found, running scraper...');

      // Format DOB to YYYY-MM-DD (optional)
      const dobMMDDYYYY = state.extractedInfo?.patient_dob;
      let dobYYYYMMDD: string | undefined;

      if (dobMMDDYYYY) {
        dobYYYYMMDD = formatDateForScraper(dobMMDDYYYY);
        console.log(`[PORTAL_SCRAPER] DOB: ${dobYYYYMMDD}`);
      } else {
        console.log('[PORTAL_SCRAPER] DOB not provided');
      }

      // Get subscriber ID and SSN (all optional)
      const subscriberId = state.extractedInfo?.patient_id;
      const ssn = state.extractedInfo?.patient_ssn;
      const policyNumber = state.extractedInfo?.policy_number;

      console.log(`[PORTAL_SCRAPER] Subscriber ID: ${subscriberId || 'N/A'}`);
      console.log(`[PORTAL_SCRAPER] Policy Number: ${policyNumber || 'N/A'}`);
      console.log(`[PORTAL_SCRAPER] SSN: ${ssn ? '***-**-' + ssn.slice(-4) : 'N/A'}`);

      // Always use default dental codes
      const dentalCodes = DEFAULT_DENTAL_CODES;
      console.log(`[PORTAL_SCRAPER] Dental codes: ${dentalCodes.length} codes (using defaults)`);

      // Build scraper request - only include fields that have values
      const scraperRequest: ScraperRequest = {
        credentials: {
          username: office.username,
          password: office.password
        }
      };

      // Only include patient object if we have at least one patient field
      if (firstName || lastName || dobYYYYMMDD) {
        scraperRequest.patient = {};
        if (firstName) scraperRequest.patient.firstName = firstName;
        if (lastName) scraperRequest.patient.lastName = lastName;
        if (dobYYYYMMDD) scraperRequest.patient.dob = dobYYYYMMDD;
      }

      // Include optional identifier fields only if they exist
      if (subscriberId) scraperRequest.subscriberId = subscriberId;
      if (policyNumber) scraperRequest.policyNumber = policyNumber;
      if (ssn) scraperRequest.ssn = ssn;

      // Always include default dental codes
      scraperRequest.dentalCodes = dentalCodes;

      console.log('[PORTAL_SCRAPER] ===== CALLING PORTAL AUTOMATION =====');
      console.log('[PORTAL_SCRAPER] Request:', {
        ...scraperRequest,
        credentials: {
          username: scraperRequest.credentials.username,
          password: '***REDACTED***'
        }
      });

      // Call the PortalAutomation scraper
      result = await runPortalScraper(portalId, scraperRequest);

    } // End of !usedCachedData check

    console.log('[PORTAL_SCRAPER] ===== PROCESSING RESULT =====');
    console.log(`[PORTAL_SCRAPER] Success: ${result.success}`);
    console.log(`[PORTAL_SCRAPER] Used cached data: ${usedCachedData}`);

    if (!result.success) {
      console.error(`[PORTAL_SCRAPER] Error: ${result.error}`);
      throw new Error(result.error || 'Scraper failed with unknown error');
    }

    console.log(`[PORTAL_SCRAPER] PDF: ${result.data?.pdfPath}`);
    console.log(`[PORTAL_SCRAPER] Eligibility data keys:`, Object.keys(result.data?.eligibilityData || {}));

    // Extract patient folder name from PDF path
    // Path format: C:\Users\josep\PycharmProjects\PortalAutomation\downloads\{PATIENT_FOLDER}\file.pdf
    let patientFolder: string | undefined;
    if (result.data?.pdfPath) {
      const pathParts = result.data.pdfPath.split(/[\\/]/);
      // Find the "downloads" folder and get the next part
      const downloadsIndex = pathParts.findIndex(part => part.toLowerCase() === 'downloads');
      if (downloadsIndex !== -1 && downloadsIndex + 1 < pathParts.length) {
        patientFolder = pathParts[downloadsIndex + 1];
        console.log(`[PORTAL_SCRAPER] Patient folder extracted: ${patientFolder}`);
      } else {
        console.warn('[PORTAL_SCRAPER] Could not extract patient folder from PDF path');
      }
    }

    // Store result in state
    return {
      scrapingComplete: true,
      patientApiDataFolder: patientFolder,
      coverageData: {
        portalAutomation: {
          eligibilityData: result.data?.eligibilityData,
          pdfPath: result.data?.pdfPath,
          pdfFilename: result.data?.pdfFilename,
          timestamp: result.data?.timestamp,
          portal: result.portal
        }
      },
      messages: [
        new AIMessage(
          `✅ Portal ${usedCachedData ? 'data retrieved from cache' : 'scraping complete'}!\n` +
          `- Portal: ${result.portal}\n` +
          `- PDF: ${result.data?.pdfFilename}\n` +
          `- Patient folder: ${patientFolder || 'N/A'}\n` +
          `- Data source: ${usedCachedData ? 'Cached (< 24 hours old)' : 'Fresh scrape'}\n` +
          `- Data sections: ${Object.keys(result.data?.eligibilityData || {}).length}`
        )
      ]
    };

  } catch (error) {
    console.error('[PORTAL_SCRAPER] Failed:', error);

    return {
      scrapingComplete: true,  // Still mark as complete to prevent loop
      messages: [
        new AIMessage(
          `❌ Portal scraping failed: ${error instanceof Error ? error.message : String(error)}`
        )
      ]
    };
  }
}

/**
 * Build the extraction subgraph
 * Uses WorkflowState following LangGraph best practices for subgraphs
 *
 * Simplified flow with PortalAutomation:
 * __start__ → portal_scraper → __end__
 */
export function buildExtractionSubgraph() {
  console.log('[EXTRACTION_SUBGRAPH] Using PortalAutomation for scraping');

  const workflow = new StateGraph(WorkflowState)
    // Single node that handles everything via PortalAutomation
    .addNode("portal_scraper", portalScraperNode)

    // Simple flow: start → scraper → end
    .addEdge("__start__", "portal_scraper")
    .addEdge("portal_scraper", END);

  return workflow.compile();
}

/**
 * Main extraction subgraph (compiled)
 */
export const extractionSubgraph = buildExtractionSubgraph();
