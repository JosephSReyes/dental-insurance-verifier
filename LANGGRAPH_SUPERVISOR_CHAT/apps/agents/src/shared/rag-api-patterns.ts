/**
 * RAG utilities for API pattern learning and retrieval
 * Stores and retrieves learned API endpoint patterns for provider-agnostic extraction
 */

import { Pool } from 'pg';

// Database connection pool
let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'insurance_verification',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'your-db-password',
    });
  }
  return pool;
}

export interface ApiPattern {
  id?: number;
  provider: string;
  officeKey?: string;
  endpointPattern: string;
  httpMethod: string;
  responseType: string; // 'benefits', 'eligibility', 'history', 'accumulators', etc.
  sampleRequest?: any;
  sampleResponse?: any;
  sampleKeys?: string[];
  timesSeen: number;
  lastSeen: Date;
  confidenceScore: number;
}

export interface ApiCaptureResult {
  url: string;
  method: string;
  status: number;
  responseType: string;
  data: any;
  capturedAt: string;
}

/**
 * Save a learned API pattern to the database
 */
export async function saveApiPattern(pattern: Omit<ApiPattern, 'id'>): Promise<void> {
  const client = getPool();

  await client.query(
    `INSERT INTO api_patterns
     (provider, office_key, endpoint_pattern, http_method, response_type,
      sample_request, sample_response, sample_keys, times_seen, last_seen, confidence_score)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (provider, endpoint_pattern)
     DO UPDATE SET
       times_seen = api_patterns.times_seen + 1,
       last_seen = EXCLUDED.last_seen,
       confidence_score = GREATEST(api_patterns.confidence_score, EXCLUDED.confidence_score)`,
    [
      pattern.provider,
      pattern.officeKey,
      pattern.endpointPattern,
      pattern.httpMethod,
      pattern.responseType,
      pattern.sampleRequest ? JSON.stringify(pattern.sampleRequest) : null,
      pattern.sampleResponse ? JSON.stringify(pattern.sampleResponse) : null,
      pattern.sampleKeys,
      pattern.timesSeen,
      pattern.lastSeen,
      pattern.confidenceScore
    ]
  );
}

/**
 * Retrieve known API patterns for a provider
 */
export async function getApiPatterns(
  provider: string,
  officeKey?: string
): Promise<ApiPattern[]> {
  const client = getPool();

  let query = `
    SELECT id, provider, office_key, endpoint_pattern, http_method, response_type,
           sample_request, sample_response, sample_keys, times_seen, last_seen, confidence_score
    FROM api_patterns
    WHERE provider = $1
  `;

  const params: any[] = [provider];

  if (officeKey) {
    query += ` AND (office_key = $2 OR office_key IS NULL)`;
    params.push(officeKey);
  }

  query += ` ORDER BY confidence_score DESC, times_seen DESC`;

  const result = await client.query(query, params);

  return result.rows.map(row => ({
    id: row.id,
    provider: row.provider,
    officeKey: row.office_key,
    endpointPattern: row.endpoint_pattern,
    httpMethod: row.http_method,
    responseType: row.response_type,
    sampleRequest: row.sample_request,
    sampleResponse: row.sample_response,
    sampleKeys: row.sample_keys,
    timesSeen: row.times_seen,
    lastSeen: row.last_seen,
    confidenceScore: row.confidence_score
  }));
}

/**
 * Get default patterns for initial capture (used when no patterns are learned yet)
 */
export function getDefaultApiPatterns(): string[] {
  return [
    '/benefits',
    '/eligibility',
    '/member',
    '/patient',
    '/subscriber',
    '/coverage',
    '/claims',
    '/history',
    '/accumulators',
    '/deductible',
    '/maximum',
    '/plan',
    '/verification',
    '/treatment',
    '/procedure',
    '/orthodontic'
  ];
}

/**
 * Classify API response type based on URL and content
 * Uses deterministic heuristics initially, can be enhanced with LLM later
 */
export function classifyApiResponse(url: string, data: any): string {
  const urlLower = url.toLowerCase();

  // Check URL patterns first
  if (urlLower.includes('benefit')) return 'benefits';
  if (urlLower.includes('eligibility')) return 'eligibility';
  if (urlLower.includes('accumulator')) return 'accumulators';
  if (urlLower.includes('deductible')) return 'deductibles';
  if (urlLower.includes('maximum')) return 'maximums';
  if (urlLower.includes('history') || urlLower.includes('treatment')) return 'history';
  if (urlLower.includes('procedure')) return 'procedures';
  if (urlLower.includes('plan')) return 'plan_summary';
  if (urlLower.includes('member') || urlLower.includes('subscriber')) return 'member_info';
  if (urlLower.includes('orthodontic') || urlLower.includes('ortho')) return 'orthodontic';
  if (urlLower.includes('claim')) return 'claims';

  // Check response content if URL doesn't match
  if (data && typeof data === 'object') {
    const jsonStr = JSON.stringify(data).toLowerCase();

    if (jsonStr.includes('coinsurance') || jsonStr.includes('coverage')) return 'benefits';
    if (jsonStr.includes('eligible') || jsonStr.includes('active')) return 'eligibility';
    if (jsonStr.includes('accumulator') || jsonStr.includes('ytd')) return 'accumulators';
    if (jsonStr.includes('deductible')) return 'deductibles';
    if (jsonStr.includes('maximum') || jsonStr.includes('limit')) return 'maximums';
    if (jsonStr.includes('procedure') && jsonStr.includes('date')) return 'history';
  }

  return 'unknown';
}

/**
 * Extract common keys from API response for pattern recognition
 */
export function extractResponseKeys(data: any, maxDepth: number = 2): string[] {
  const keys: Set<string> = new Set();

  function traverse(obj: any, depth: number, prefix: string = '') {
    if (depth > maxDepth || !obj || typeof obj !== 'object') return;

    for (const key in obj) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      keys.add(fullKey);

      if (Array.isArray(obj[key]) && obj[key].length > 0) {
        traverse(obj[key][0], depth + 1, fullKey);
      } else if (typeof obj[key] === 'object') {
        traverse(obj[key], depth + 1, fullKey);
      }
    }
  }

  traverse(data, 0);
  return Array.from(keys);
}
