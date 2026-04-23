/**
 * PortalAutomation Client
 * Interfaces with the sibling PortalAutomation project for scraping insurance portals
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as fs from 'fs';

// ES module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Base path for PortalAutomation project (sibling to agent-chat-demo)
 */
const PORTAL_AUTOMATION_BASE = path.resolve(__dirname, '../../../../../../PortalAutomation');

export interface ScraperRequest {
  credentials: {
    username: string;
    password: string;
  };
  patient?: {
    firstName?: string;    // Optional - extracted from portal after lookup
    lastName?: string;     // Optional - extracted from portal after lookup
    dob?: string;          // Optional - but required by most portals (YYYY-MM-DD format)
  };
  subscriberId?: string;   // Optional - Primary member/subscriber ID
  policyNumber?: string;   // Optional - Policy number (some portals use this)
  ssn?: string;            // Optional - Alternative identifier
  dentalCodes?: string[];  // Optional - Array of dental codes to lookup
  additionalFields?: Record<string, any>;  // Optional - For future portal-specific fields
}

export interface ScraperResult {
  success: boolean;
  portal: string;
  data?: {
    eligibilityData: {
      memberInfo?: Record<string, any>;
      insuranceInfo?: Record<string, any>;
      planInfo?: Record<string, any>;
      benefits?: Record<string, any>;
    };
    pdfPath: string;
    pdfFilename: string;
    timestamp: string;
  };
  error?: string;
}

/**
 * Map insurance provider names to portal identifiers
 */
export function mapProviderToPortalId(provider: string): string {
  const providerLower = provider.toLowerCase();

  if (providerLower.includes('blue cross') || providerLower.includes('bcbs')) {
    return 'bluecross-blueshield';
  }

  if (providerLower.includes('delta dental')) {
    return 'delta-dental';
  }

  // Add more mappings as new portals are implemented
  throw new Error(`No portal mapping found for provider: ${provider}`);
}

/**
 * Check if recent patient data already exists in PortalAutomation downloads
 * Returns the most recent patient folder if it exists and is less than 24 hours old
 *
 * @param firstName - Patient first name
 * @param lastName - Patient last name
 * @param portalId - Portal identifier (e.g., 'bluecross-blueshield')
 * @param maxAgeHours - Maximum age in hours (default: 24)
 * @returns Patient folder name if recent data exists, undefined otherwise
 */
export function checkExistingPatientData(
  firstName: string,
  lastName: string,
  portalId: string,
  maxAgeHours: number = 24
): string | undefined {
  console.log(`[CHECK_EXISTING_DATA] Checking for existing data: ${firstName} ${lastName}`);

  const downloadsDir = path.join(PORTAL_AUTOMATION_BASE, 'downloads');

  if (!fs.existsSync(downloadsDir)) {
    console.log(`[CHECK_EXISTING_DATA] Downloads directory does not exist: ${downloadsDir}`);
    return undefined;
  }

  // Build folder pattern based on portal
  // Pattern: {FIRSTNAME}_{LASTNAME}_{PORTAL_PREFIX}_{TYPE}_{TIMESTAMP}
  let folderPattern: RegExp;

  if (portalId === 'bluecross-blueshield') {
    // Pattern: LASTNAME_FIRSTNAME_BCBSTX_FB_2025-12-25_11-19-44
    folderPattern = new RegExp(
      `^${firstName.toUpperCase()}_${lastName.toUpperCase()}_BCBSTX_FB_\\d{4}-\\d{2}-\\d{2}_\\d{2}-\\d{2}-\\d{2}$`,
      'i'
    );
  } else {
    console.log(`[CHECK_EXISTING_DATA] No folder pattern defined for portal: ${portalId}`);
    return undefined;
  }

  console.log(`[CHECK_EXISTING_DATA] Searching with pattern: ${folderPattern}`);

  // Read all folders in downloads directory
  const folders = fs.readdirSync(downloadsDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  console.log(`[CHECK_EXISTING_DATA] Found ${folders.length} total folders in downloads`);

  // Filter folders matching the pattern
  const matchingFolders = folders.filter(folder => folderPattern.test(folder));

  console.log(`[CHECK_EXISTING_DATA] Found ${matchingFolders.length} folders matching pattern`);

  if (matchingFolders.length === 0) {
    console.log(`[CHECK_EXISTING_DATA] No matching folders found`);
    return undefined;
  }

  // Find the most recent folder within the age limit
  const now = Date.now();
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

  let mostRecentFolder: string | undefined;
  let mostRecentTime = 0;

  for (const folder of matchingFolders) {
    const folderPath = path.join(downloadsDir, folder);
    const stats = fs.statSync(folderPath);
    const folderAge = now - stats.mtimeMs;

    console.log(`[CHECK_EXISTING_DATA] Folder: ${folder}, Age: ${(folderAge / 1000 / 60).toFixed(2)} minutes`);

    if (folderAge <= maxAgeMs && stats.mtimeMs > mostRecentTime) {
      mostRecentFolder = folder;
      mostRecentTime = stats.mtimeMs;
    }
  }

  if (mostRecentFolder) {
    const ageMinutes = (now - mostRecentTime) / 1000 / 60;
    console.log(`[CHECK_EXISTING_DATA] ✓ Found recent data: ${mostRecentFolder} (${ageMinutes.toFixed(2)} minutes old)`);
    return mostRecentFolder;
  }

  console.log(`[CHECK_EXISTING_DATA] No folders found within ${maxAgeHours} hour age limit`);
  return undefined;
}

/**
 * Create a ScraperResult from an existing patient folder
 * This allows us to reuse cached data without re-scraping
 *
 * @param patientFolder - Patient folder name (e.g., LASTNAME_FIRSTNAME_BCBSTX_FB_2025-12-25_11-19-44)
 * @param portalId - Portal identifier
 * @returns ScraperResult with data from existing folder
 */
export function createResultFromExistingFolder(
  patientFolder: string,
  portalId: string
): ScraperResult {
  console.log(`[EXISTING_DATA] Creating result from folder: ${patientFolder}`);

  const folderPath = path.join(PORTAL_AUTOMATION_BASE, 'downloads', patientFolder);

  // Find the FB (Full Benefit) PDF in the folder
  const files = fs.readdirSync(folderPath);
  const fbPdf = files.find(f => f.includes('_FB_') && f.endsWith('.pdf'));

  if (!fbPdf) {
    throw new Error(`No FB PDF found in folder: ${folderPath}`);
  }

  const pdfPath = path.join(folderPath, fbPdf);
  const stats = fs.statSync(folderPath);
  const timestamp = new Date(stats.mtime).toISOString();

  console.log(`[EXISTING_DATA] Found PDF: ${fbPdf}`);
  console.log(`[EXISTING_DATA] Timestamp: ${timestamp}`);

  // Load JSON data files if they exist
  const eligibilityData: Record<string, any> = {};

  // Common API response files in BCBS scraper
  const apiFiles = [
    'eligibility.json',
    'memberInfo.json',
    'planInfo.json',
    'benefits.json'
  ];

  for (const apiFile of apiFiles) {
    const apiFilePath = path.join(folderPath, apiFile);
    if (fs.existsSync(apiFilePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(apiFilePath, 'utf-8'));
        const key = apiFile.replace('.json', '');
        eligibilityData[key] = data;
        console.log(`[EXISTING_DATA] Loaded ${apiFile}`);
      } catch (error) {
        console.warn(`[EXISTING_DATA] Failed to parse ${apiFile}:`, error);
      }
    }
  }

  return {
    success: true,
    portal: portalId,
    data: {
      eligibilityData,
      pdfPath,
      pdfFilename: fbPdf,
      timestamp
    }
  };
}

/**
 * Call the PortalAutomation scraper
 *
 * @param portalId - Portal identifier (e.g., 'bluecross-blueshield')
 * @param request - Scraper request payload
 * @returns ScraperResult with success/failure and extracted data
 */
export async function runPortalScraper(
  portalId: string,
  request: ScraperRequest
): Promise<ScraperResult> {
  console.log(`[PORTAL_AUTOMATION] Calling scraper for portal: ${portalId}`);
  if (request.patient?.firstName || request.patient?.lastName) {
    console.log(`[PORTAL_AUTOMATION] Patient: ${request.patient.firstName || ''} ${request.patient.lastName || ''}`.trim());
  }
  if (request.patient?.dob) {
    console.log(`[PORTAL_AUTOMATION] DOB: ${request.patient.dob}`);
  }
  console.log(`[PORTAL_AUTOMATION] Subscriber ID: ${request.subscriberId || 'N/A'}`);
  console.log(`[PORTAL_AUTOMATION] Policy Number: ${request.policyNumber || 'N/A'}`);
  console.log(`[PORTAL_AUTOMATION] SSN: ${request.ssn ? '***-**-' + request.ssn.slice(-4) : 'N/A'}`);
  console.log(`[PORTAL_AUTOMATION] Dental codes: ${request.dentalCodes?.length || 0} codes`);

  // Path to the PortalAutomation project (sibling to agent-chat-demo project)
  // From: agent-chat-demo/LANGGRAPH_SUPERVISOR_CHAT/apps/agents/dist/shared
  // To: PortalAutomation (sibling to agent-chat-demo)
  const portalAutomationPath = path.resolve(__dirname, '../../../../../../PortalAutomation');

  console.log(`[PORTAL_AUTOMATION] Project path: ${portalAutomationPath}`);

  return new Promise((resolve, reject) => {
    try {
      // Create the JavaScript code to execute
      const code = `
        const { runScraper } = require('./dist/runner/runScraper.js');

        const payload = ${JSON.stringify(request)};

        runScraper('${portalId}', payload)
          .then(result => {
            console.log(JSON.stringify(result));
            process.exit(0);
          })
          .catch(error => {
            console.error(JSON.stringify({
              success: false,
              portal: '${portalId}',
              error: error.message || String(error)
            }));
            process.exit(1);
          });
      `;

      // Spawn Node.js process to run the scraper
      const nodeProcess = spawn('node', ['-e', code], {
        cwd: portalAutomationPath,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      nodeProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      nodeProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      nodeProcess.on('close', (code) => {
        if (code !== 0) {
          console.error(`[PORTAL_AUTOMATION] Process exited with code ${code}`);
          console.error(`[PORTAL_AUTOMATION] stderr: ${stderr}`);

          // Try to parse error from stdout
          try {
            const errorResult = JSON.parse(stdout.trim().split('\n').pop() || '{}');
            if (errorResult.error) {
              resolve(errorResult);
              return;
            }
          } catch (e) {
            // Ignore parse error
          }

          reject(new Error(`Scraper process failed: ${stderr || 'Unknown error'}`));
          return;
        }

        try {
          // Parse the last line of stdout (the JSON result)
          const lines = stdout.trim().split('\n');
          const resultLine = lines[lines.length - 1];
          const result: ScraperResult = JSON.parse(resultLine);

          console.log(`[PORTAL_AUTOMATION] Scraper ${result.success ? 'succeeded' : 'failed'}`);
          if (result.success && result.data) {
            console.log(`[PORTAL_AUTOMATION] PDF saved to: ${result.data.pdfPath}`);
          } else if (result.error) {
            console.error(`[PORTAL_AUTOMATION] Error: ${result.error}`);
          }

          resolve(result);
        } catch (error) {
          console.error(`[PORTAL_AUTOMATION] Failed to parse result:`, error);
          console.error(`[PORTAL_AUTOMATION] stdout: ${stdout}`);
          reject(new Error(`Failed to parse scraper result: ${error instanceof Error ? error.message : String(error)}`));
        }
      });

      nodeProcess.on('error', (error) => {
        console.error(`[PORTAL_AUTOMATION] Failed to start process:`, error);
        reject(error);
      });

    } catch (error) {
      console.error(`[PORTAL_AUTOMATION] Exception:`, error);
      reject(error);
    }
  });
}

/**
 * Helper to format date from MM/DD/YYYY to YYYY-MM-DD
 */
export function formatDateForScraper(mmddyyyy: string): string {
  const parts = mmddyyyy.split('/');
  if (parts.length !== 3) {
    throw new Error(`Invalid date format: ${mmddyyyy}. Expected MM/DD/YYYY`);
  }

  const [month, day, year] = parts;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/**
 * Parse patient name into firstName and lastName
 */
export function parsePatientName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);

  if (parts.length === 0) {
    throw new Error('Patient name is empty');
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }

  // First part is firstName, rest is lastName
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');

  return { firstName, lastName };
}
