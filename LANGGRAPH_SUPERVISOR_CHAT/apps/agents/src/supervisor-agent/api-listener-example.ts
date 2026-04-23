// Example usage of the reusable API listener tool
// This demonstrates how to use the tool in different scenarios

import { apiListenerTool, API_CONFIGS } from './tools.js';

// Example 1: Using preset configuration for Delta Dental
export async function exampleDeltaDentalListener(page: any) {
  console.log('🔧 Example 1: Using Delta Dental preset configuration');

  const result = await apiListenerTool.invoke({
    usePreset: 'DELTA_DENTAL_INSURANCE'
  }, { page } as any);

  console.log('Delta Dental API listener result:', result);
  return result;
}

// Example 2: Custom endpoints for specific APIs
export async function exampleCustomEndpoints(page: any) {
  console.log('🔧 Example 2: Using custom endpoint configuration');

  const result = await apiListenerTool.invoke({
    endpoints: [
      {
        key: 'patientData',
        urlPattern: '/patient/search',
        displayName: 'Patient Search Results'
      },
      {
        key: 'eligibilityCheck',
        urlPattern: '/eligibility/verify',
        displayName: 'Eligibility Verification'
      }
    ],
    domain: 'deltadentalins.com',
    timeoutMs: 45000,
    requireAllSuccess: false
  }, { page } as any);

  console.log('Custom endpoints listener result:', result);
  return result;
}

// Example 3: Multiple domain endpoints
export async function exampleMultipleDomains(page: any) {
  console.log('🔧 Example 3: Using endpoints from multiple domains');

  const result = await apiListenerTool.invoke({
    endpoints: [
      {
        key: 'deltaDentalBenefits',
        urlPattern: '/benefits/package',
        domain: 'deltadentalins.com',
        displayName: 'Delta Dental Benefits'
      },
      {
        key: 'aetnaCoverage',
        urlPattern: '/api/coverage',
        domain: 'aetna.com',
        displayName: 'Aetna Coverage Details'
      },
      {
        key: 'localApiData',
        urlPattern: '/api/verification',
        domain: 'localhost:3000',
        displayName: 'Local Verification API'
      }
    ],
    timeoutMs: 60000,
    requireAllSuccess: false
  }, { page } as any);

  console.log('Multiple domains listener result:', result);
  return result;
}

// Example 4: Integration in workflow sequence
export async function exampleWorkflowIntegration(page: any) {
  console.log('🔧 Example 4: Workflow integration sequence');

  // Step 1: Start API listener in background
  console.log('Starting background API listener...');
  const listenerPromise = apiListenerTool.invoke({
    usePreset: 'DELTA_DENTAL_INSURANCE',
    timeoutMs: 90000
  }, { page } as any);

  // Step 2: Perform navigation that triggers APIs (simulated)
  console.log('Performing navigation that triggers API calls...');
  // This would be your navigation/UI interaction tool
  // await navigationTool.invoke({ action: 'search_patient', patientName: 'John Doe' }, { page });

  // Step 3: Wait for API listener to complete
  console.log('Waiting for API responses to complete...');
  const apiData = await listenerPromise;

  console.log('Workflow integration complete. API data captured:', apiData);
  return apiData;
}

// Usage in LangGraph workflow nodes
export const apiListenerExamples = {
  deltaDental: exampleDeltaDentalListener,
  custom: exampleCustomEndpoints,
  multiDomain: exampleMultipleDomains,
  workflow: exampleWorkflowIntegration
};