import { tool } from "@langchain/core/tools";
import { z } from "zod";

// Tool for launching insurance portals based on provider
export const insurancePortalLauncherTool = tool(
  async ({ extractedInfo }) => {
    try {
      console.log('[PORTAL_LAUNCHER] Validating extracted info:', extractedInfo);

      // Validate shared state before proceeding
      if (!extractedInfo) {
        return JSON.stringify({
          success: false,
          error: "No extracted information available in shared state",
          next_step: "extract_patient_info"
        });
      }

      const { insurance_provider, patient_name, appointment_date } = extractedInfo;

      // Confirm required data is present
      if (!insurance_provider || !patient_name || !appointment_date) {
        return JSON.stringify({
          success: false,
          error: "Missing required information",
          missing_fields: {
            insurance_provider: !insurance_provider,
            patient_name: !patient_name,
            appointment_date: !appointment_date
          },
          next_step: "validate_extraction"
        });
      }

      console.log('[PORTAL_LAUNCHER] State validation passed');

      // Enhanced portal type and version detection
      const providerLower = insurance_provider.toLowerCase();
      let portalType: 'bcbs' | 'delta_dental' | 'unknown';
      let portalVersion: string | undefined;

      if (providerLower.includes('blue cross') || providerLower.includes('bcbs')) {
        portalType = 'bcbs';

        // Detect BCBS regional variations
        if (providerLower.includes('california')) {
          portalVersion = 'bcbs_ca';
        } else if (providerLower.includes('texas')) {
          portalVersion = 'bcbs_tx';
        } else if (providerLower.includes('florida')) {
          portalVersion = 'bcbs_fl';
        } else if (providerLower.includes('anthem')) {
          portalVersion = 'bcbs_anthem';
        } else {
          portalVersion = 'bcbs_standard';
        }

      } else if (providerLower.includes('delta dental')) {
        portalType = 'delta_dental';

        // Detect Delta Dental regional variations
        if (providerLower.includes('california')) {
          portalVersion = 'delta_ca';
        } else if (providerLower.includes('washington')) {
          portalVersion = 'delta_wa';
        } else if (providerLower.includes('michigan')) {
          portalVersion = 'delta_mi';
        } else if (providerLower.includes('ppo')) {
          portalVersion = 'delta_ppo';
        } else if (providerLower.includes('premier')) {
          portalVersion = 'delta_premier';
        } else {
          portalVersion = 'delta_standard';
        }

      } else {
        portalType = 'unknown';
        portalVersion = undefined;
      }

      console.log(`[PORTAL_LAUNCHER] Detected portal: ${portalType} (version: ${portalVersion || 'N/A'})`);

      // Check insurance provider and route accordingly
      if (portalType === 'delta_dental') {
        console.log('[PORTAL_LAUNCHER] Launching Delta Dental portal...');

        // Connect to Playwright MCP server on port 3002
        const mcpResult = await launchDeltaDentalPortal();

        return JSON.stringify({
          success: mcpResult.success,
          provider: insurance_provider,
          portal_type: portalType,
          portal_version: portalVersion,
          portal_status: mcpResult.success ? "launched" : "failed",
          browser_url: mcpResult.url || null,
          error: mcpResult.error || null,
          next_step: mcpResult.success ? "insurance_portal_auth" : "retry_launch"
        });

      } else if (portalType === 'bcbs') {
        console.log('[PORTAL_LAUNCHER] BCBS portal detected but not yet implemented');

        return JSON.stringify({
          success: false,
          provider: insurance_provider,
          portal_type: portalType,
          portal_version: portalVersion,
          error: `BCBS portal (${portalVersion}) not yet implemented for automated verification`,
          supported_providers: ["Delta Dental"],
          next_step: "manual_verification"
        });

      } else {
        console.log('[PORTAL_LAUNCHER] Unsupported insurance provider:', insurance_provider);

        return JSON.stringify({
          success: false,
          provider: insurance_provider,
          portal_type: portalType,
          portal_version: portalVersion,
          error: `Insurance provider "${insurance_provider}" not supported for automated verification`,
          supported_providers: ["Delta Dental"],
          next_step: "manual_verification"
        });
      }

    } catch (error) {
      console.error('[PORTAL_LAUNCHER] Error:', error);
      return JSON.stringify({
        success: false,
        error: `Portal launcher failed: ${error instanceof Error ? error.message : String(error)}`,
        next_step: "retry_launch"
      });
    }
  },
  {
    name: "insurance_portal_launcher",
    description: "Launch insurance provider portal based on extracted information. Validates state and opens appropriate portal using Playwright MCP.",
    schema: z.object({
      extractedInfo: z.object({
        insurance_provider: z.string(),
        patient_name: z.string(),
        appointment_date: z.string(),
        dental_codes: z.array(z.string()).optional(),
        request_type: z.string().optional(),
        additional_notes: z.string().nullable().optional()
      }).describe("Extracted patient and insurance information from shared state")
    })
  }
);

// Helper function to launch Delta Dental portal
async function launchDeltaDentalPortal() {
  try {
    console.log('[DELTA_LAUNCHER] Connecting to Playwright MCP server on port 3002...');

    // MCP client connection to Playwright server
    const mcpClient = await connectToPlaywrightMCP();

    // Launch browser with viewable chrome (blue browser)
    const browserResult = await mcpClient.launchBrowser({
      headless: false,  // Viewable browser
      browserType: 'chromium'
    });

    if (!browserResult.success) {
      throw new Error(`Failed to launch browser: Browser launch failed`);
    }

    console.log('[DELTA_LAUNCHER] Browser launched successfully');

    // Navigate to Delta Dental portal
    const deltaUrl = 'https://www.deltadentalins.com/oral_health_professionals/login.html';
    const navigationResult = await mcpClient.navigateTo({
      url: deltaUrl,
      waitFor: 'networkidle'
    });

    if (!navigationResult.success) {
      throw new Error(`Failed to navigate to Delta Dental: Navigation failed`);
    }

    // Confirm we're on the correct page
    const pageTitle = await mcpClient.getPageTitle();
    const currentUrl = await mcpClient.getCurrentUrl();

    const isCorrectPage = pageTitle.includes('Delta Dental') ||
                         currentUrl.includes('deltadentalins.com');

    if (!isCorrectPage) {
      throw new Error(`Navigation confirmation failed. Current page: ${pageTitle} at ${currentUrl}`);
    }

    console.log('[DELTA_LAUNCHER] Successfully navigated to Delta Dental portal');

    return {
      success: true,
      url: currentUrl,
      page_title: pageTitle,
      browser_id: browserResult.browser_id
    };

  } catch (error) {
    console.error('[DELTA_LAUNCHER] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// MCP client connection helper
async function connectToPlaywrightMCP() {
  // This is a placeholder for the actual MCP client connection
  // You'll need to implement the actual MCP client connection to port 3002

  console.log('[MCP_CLIENT] Connecting to Playwright MCP server...');

  // Simulated MCP client interface
  return {
    launchBrowser: async (options: any) => {
      console.log('[MCP_CLIENT] Launching browser with options:', options);
      // TODO: Implement actual MCP call to launch browser
      return { success: true, browser_id: 'browser_123' };
    },

    navigateTo: async (options: any) => {
      console.log('[MCP_CLIENT] Navigating to:', options.url);
      // TODO: Implement actual MCP call to navigate
      return { success: true };
    },

    getPageTitle: async () => {
      console.log('[MCP_CLIENT] Getting page title');
      // TODO: Implement actual MCP call to get title
      return 'Delta Dental Professional Login';
    },

    getCurrentUrl: async () => {
      console.log('[MCP_CLIENT] Getting current URL');
      // TODO: Implement actual MCP call to get URL
      return 'https://www.deltadentalins.com/oral_health_professionals/login.html';
    }
  };
}