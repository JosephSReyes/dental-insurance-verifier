/**
 * Universal API Capture System
 * Provider-agnostic network traffic capture using Chrome DevTools Protocol
 */

import { CDPSession } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import {
  getApiPatterns,
  getDefaultApiPatterns,
  saveApiPattern,
  classifyApiResponse,
  extractResponseKeys,
  ApiCaptureResult
} from './rag-api-patterns.js';

export interface CaptureConfig {
  provider: string;
  officeKey: string;
  providerDomain: string;
  sessionId: string;
  patientIdentifier: string;
  timeoutMs?: number;
}

export interface CaptureListener {
  stop: () => Promise<ApiCaptureResult[]>;
}

/**
 * Start universal API listener
 * Captures all relevant network traffic and classifies responses
 */
export async function startUniversalApiListener(
  cdpSession: CDPSession,
  config: CaptureConfig
): Promise<CaptureListener> {
  console.log(`🎯 Starting universal API listener for ${config.provider}...`);

  const capturedResponses: ApiCaptureResult[] = [];
  const requestMap = new Map<string, any>();

  // Retrieve learned patterns from RAG
  const learnedPatterns = await getApiPatterns(config.provider, config.officeKey);
  const defaultPatterns = getDefaultApiPatterns();

  // Combine learned and default patterns
  const patterns = learnedPatterns.length > 0
    ? learnedPatterns.map(p => p.endpointPattern)
    : defaultPatterns;

  console.log(`📋 Using ${learnedPatterns.length} learned patterns + ${defaultPatterns.length} default patterns`);

  // Enable network tracking
  await cdpSession.send('Network.enable');
  await cdpSession.send('Network.setCacheDisabled', { cacheDisabled: true });

  // Listen for request events
  cdpSession.on('Network.requestWillBeSent', (params: any) => {
    const url = params.request.url;

    // Check if URL matches provider domain and relevant patterns
    if (url.includes(config.providerDomain) && shouldCaptureRequest(url, patterns)) {
      requestMap.set(params.requestId, {
        url: params.request.url,
        method: params.request.method,
        timestamp: params.timestamp,
        postData: params.request.postData
      });

      console.log(`📥 Capturing request: ${params.request.method} ${url}`);
    }
  });

  // Listen for response events
  cdpSession.on('Network.responseReceived', async (params: any) => {
    const request = requestMap.get(params.requestId);
    if (!request) return;

    const response = params.response;

    // Only capture successful responses
    if (response.status >= 200 && response.status < 400) {
      try {
        // Get response body
        const bodyResponse = await cdpSession.send('Network.getResponseBody', {
          requestId: params.requestId
        });

        let responseData;
        try {
          responseData = JSON.parse(bodyResponse.body);
        } catch {
          // Not JSON, skip
          return;
        }

        // Classify response type
        const responseType = classifyApiResponse(request.url, responseData);

        // Store captured response
        const captured: ApiCaptureResult = {
          url: request.url,
          method: request.method,
          status: response.status,
          responseType,
          data: responseData,
          capturedAt: new Date().toISOString()
        };

        capturedResponses.push(captured);

        console.log(`✅ Captured ${responseType} response from: ${request.url}`);

        // Learn pattern for future use
        await learnApiPattern(
          config.provider,
          config.officeKey,
          request.url,
          request.method,
          responseType,
          responseData
        );

      } catch (error) {
        console.warn(`⚠️ Could not capture response body for ${request.url}:`, error);
      }
    }

    // Clean up request map
    requestMap.delete(params.requestId);
  });

  // Return listener control object
  return {
    stop: async () => {
      console.log(`🛑 Stopping API listener. Captured ${capturedResponses.length} responses.`);

      // Disable network tracking
      await cdpSession.send('Network.disable');

      // Save to patient data folder
      if (capturedResponses.length > 0) {
        await saveApiResponses(config.patientIdentifier, capturedResponses);
      }

      return capturedResponses;
    }
  };
}

/**
 * Determine if a URL should be captured based on patterns
 */
function shouldCaptureRequest(url: string, patterns: string[]): boolean {
  const urlLower = url.toLowerCase();

  // Exclude non-API requests
  if (
    urlLower.includes('.css') ||
    urlLower.includes('.js') ||
    urlLower.includes('.png') ||
    urlLower.includes('.jpg') ||
    urlLower.includes('.svg') ||
    urlLower.includes('.woff') ||
    urlLower.includes('.ttf') ||
    urlLower.includes('analytics') ||
    urlLower.includes('tracking') ||
    urlLower.includes('gtm') ||
    urlLower.includes('facebook') ||
    urlLower.includes('google-analytics')
  ) {
    return false;
  }

  // Check if URL matches any pattern
  return patterns.some(pattern => urlLower.includes(pattern.toLowerCase()));
}

/**
 * Learn API pattern from captured response
 */
async function learnApiPattern(
  provider: string,
  officeKey: string,
  url: string,
  method: string,
  responseType: string,
  responseData: any
): Promise<void> {
  try {
    // Extract endpoint pattern (remove query params and dynamic IDs)
    const endpointPattern = extractEndpointPattern(url);

    // Extract sample keys from response
    const sampleKeys = extractResponseKeys(responseData, 2);

    // Save pattern to RAG
    await saveApiPattern({
      provider,
      officeKey,
      endpointPattern,
      httpMethod: method,
      responseType,
      sampleResponse: responseData,
      sampleKeys,
      timesSeen: 1,
      lastSeen: new Date(),
      confidenceScore: 1.0
    });

    console.log(`📚 Learned pattern: ${endpointPattern} → ${responseType}`);
  } catch (error) {
    console.warn('Could not learn API pattern:', error);
  }
}

/**
 * Extract endpoint pattern from full URL
 * Removes query params and normalizes dynamic segments
 */
function extractEndpointPattern(url: string): string {
  try {
    const urlObj = new URL(url);
    let pathname = urlObj.pathname;

    // Remove trailing slash
    if (pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }

    // Replace numeric IDs and GUIDs with placeholders
    pathname = pathname.replace(/\/\d+/g, '/{id}');
    pathname = pathname.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/{guid}');

    return pathname;
  } catch {
    return url;
  }
}

/**
 * Save captured API responses to patient data folder
 */
async function saveApiResponses(
  patientIdentifier: string,
  responses: ApiCaptureResult[]
): Promise<string> {
  const timestamp = Date.now();
  const folderName = `${patientIdentifier}_${timestamp}`;
  const folderPath = path.join(process.cwd(), 'patient_data', folderName);

  // Create folder
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }

  // Save each response as a separate file
  for (const response of responses) {
    const filename = `${response.responseType}_${timestamp}.json`;
    const filepath = path.join(folderPath, filename);

    const fileData = {
      url: response.url,
      method: response.method,
      status: response.status,
      responseType: response.responseType,
      data: response.data,
      capturedAt: response.capturedAt
    };

    fs.writeFileSync(filepath, JSON.stringify(fileData, null, 2));
    console.log(`💾 Saved ${response.responseType} to: ${filepath}`);
  }

  // Create summary file
  const summaryPath = path.join(folderPath, 'capture_summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify({
    patientIdentifier,
    timestamp,
    totalResponses: responses.length,
    responseTypes: [...new Set(responses.map(r => r.responseType))],
    urls: responses.map(r => r.url),
    capturedAt: new Date().toISOString()
  }, null, 2));

  console.log(`✅ Saved ${responses.length} API responses to: ${folderPath}`);

  return folderPath;
}
