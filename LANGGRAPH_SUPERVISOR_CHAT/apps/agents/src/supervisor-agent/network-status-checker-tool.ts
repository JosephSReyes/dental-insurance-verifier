import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getOfficeContext } from "../shared/officeContext.js";

export const checkNetworkStatusTool = tool(
  async ({ officeKey, insuranceProvider, patientPlanType }) => {
    console.log('[NETWORK_STATUS_CHECKER] Checking network status:', { officeKey, insuranceProvider, patientPlanType });
    
    let office;
    try {
      office = getOfficeContext(officeKey, insuranceProvider);
    } catch (error: any) {
      return JSON.stringify({
        networkStatus: `${patientPlanType} (Unknown Network Status)`,
        isInNetwork: false,
        reason: `Office key "${officeKey}" not found in system: ${error?.message || 'Unknown error'}`
      });
    }

    const providerLower = insuranceProvider.toLowerCase();
    let contractedPlans: string | undefined;
    let providerKey: string;

    if (providerLower.includes('delta dental')) {
      contractedPlans = office.deltaDental?.contractedPlans;
      providerKey = 'Delta Dental';
    } else if (providerLower.includes('blue cross') || providerLower.includes('bcbs')) {
      contractedPlans = office.blueCrossBlueShield?.contractedPlans;
      providerKey = 'Blue Cross Blue Shield';
    } else {
      return JSON.stringify({
        networkStatus: `${patientPlanType} (Unknown Network Status)`,
        isInNetwork: false,
        reason: `Insurance provider "${insuranceProvider}" not recognized`
      });
    }

    if (!contractedPlans) {
      return JSON.stringify({
        networkStatus: `${patientPlanType} (Out-of-Network)`,
        isInNetwork: false,
        reason: `${office.name} has no contracted plans configured for ${providerKey}`
      });
    }

    const contractedPlansList = contractedPlans.split(',').map(p => p.trim().toUpperCase());
    const planTypeUpper = patientPlanType.toUpperCase();

    const isInNetwork = contractedPlansList.includes(planTypeUpper);

    if (isInNetwork) {
      return JSON.stringify({
        networkStatus: `${patientPlanType} (In-Network)`,
        isInNetwork: true,
        reason: `${office.name} is contracted with ${providerKey} for ${patientPlanType} plans`,
        contractedPlans: contractedPlansList
      });
    } else {
      return JSON.stringify({
        networkStatus: `${patientPlanType} (Out-of-Network)`,
        isInNetwork: false,
        reason: `${office.name} is NOT contracted with ${providerKey} for ${patientPlanType} plans. Office contracted plans: ${contractedPlansList.join(', ')}`,
        contractedPlans: contractedPlansList
      });
    }
  },
  {
    name: "check_network_status",
    description: "Check if the dental office is in-network or out-of-network for the patient's insurance plan. This determines whether to use in-network or out-of-network coverage percentages. Call this after extracting the patient's plan type (PPO, HMO, Premier, etc.).",
    schema: z.object({
      officeKey: z.string().describe("Office key identifier (e.g., 'OFFICE_A', 'OFFICE_B')"),
      insuranceProvider: z.string().describe("Insurance provider name (e.g., 'Delta Dental', 'Blue Cross Blue Shield')"),
      patientPlanType: z.string().describe("Patient's plan type extracted from JSON (e.g., 'PPO', 'HMO', 'Premier')")
    })
  }
);
