/**
 * Enhanced RAG Feedback System
 *
 * Provides advanced feedback retrieval using Label Studio annotations
 * This extends the basic feedback-rag.ts with detailed path, search, and edge case queries
 */

import { OpenAIEmbeddings } from '@langchain/openai';
import { getPool } from './db-setup.js';
import type {
  EnhancedAnnotationRecord,
  EnhancedFeedbackParams,
  EnhancedFeedbackResponse,
  AnnotationStatistics,
  PathQuality,
  SearchEffectiveness,
} from './enhanced-annotation-types.js';

const embeddings = new OpenAIEmbeddings({
  modelName: 'text-embedding-3-small',
  dimensions: 1536,
});

/**
 * Get relevant path feedback for a specific field
 * Returns annotations showing the correct JSON paths to use
 */
export async function getPathFeedback(params: EnhancedFeedbackParams): Promise<EnhancedAnnotationRecord[]> {
  const pool = getPool();
  const {
    mapper,
    field,
    provider,
    portalType,
    officeId,
    limit = 5,
    minSimilarity = 0.7,
  } = params;

  // Build query to find relevant path corrections
  let query = `
    SELECT
      id, verification_id, mapper, field, provider, office_id, portal_type,
      ai_value, human_value, source_path, correct_path,
      path_quality, path_reasoning, alternative_paths,
      value_quality, search_effectiveness, better_search_terms,
      portal_quirks, portal_notes,
      is_edge_case, edge_case_description,
      ai_confidence, human_confidence, confidence_gap,
      tool_calls_count, extraction_time_ms,
      created_at, updated_at, annotator_id
    FROM enhanced_annotations
    WHERE mapper = $1
      AND path_quality IN ('correct', 'partial')
  `;

  const values: any[] = [mapper];
  let paramCount = 1;

  // Add field filter
  if (field) {
    paramCount++;
    query += ` AND field = $${paramCount}`;
    values.push(field);
  }

  // Add provider filter
  if (provider) {
    paramCount++;
    query += ` AND provider = $${paramCount}`;
    values.push(provider);
  }

  // Add portal filter
  if (portalType) {
    paramCount++;
    query += ` AND portal_type = $${paramCount}`;
    values.push(portalType);
  }

  // Add office filter
  if (officeId) {
    paramCount++;
    query += ` AND office_id = $${paramCount}`;
    values.push(officeId);
  }

  // Order by relevance (correct paths first, then by confidence)
  query += `
    ORDER BY
      CASE WHEN path_quality = 'correct' THEN 0 ELSE 1 END,
      human_confidence DESC,
      created_at DESC
    LIMIT $${paramCount + 1}
  `;
  values.push(limit);

  const result = await pool.query(query, values);
  return result.rows.map(mapToEnhancedRecord);
}

/**
 * Get edge cases for a specific context
 * Returns documented unusual patterns that need special handling
 */
export async function getEdgeCases(params: {
  mapper?: string;
  field?: string;
  portalType?: string;
  officeId?: string;
  limit?: number;
}): Promise<EnhancedAnnotationRecord[]> {
  const pool = getPool();
  const { mapper, field, portalType, officeId, limit = 10 } = params;

  let query = `
    SELECT
      id, verification_id, mapper, field, provider, office_id, portal_type,
      ai_value, human_value, source_path, correct_path,
      path_quality, path_reasoning,
      value_quality,
      is_edge_case, edge_case_description,
      portal_quirks, portal_notes,
      human_confidence,
      created_at, updated_at, annotator_id
    FROM enhanced_annotations
    WHERE is_edge_case = TRUE
  `;

  const values: any[] = [];
  let paramCount = 0;

  if (mapper) {
    paramCount++;
    query += ` AND mapper = $${paramCount}`;
    values.push(mapper);
  }

  if (field) {
    paramCount++;
    query += ` AND field = $${paramCount}`;
    values.push(field);
  }

  if (portalType) {
    paramCount++;
    query += ` AND portal_type = $${paramCount}`;
    values.push(portalType);
  }

  if (officeId) {
    paramCount++;
    query += ` AND office_id = $${paramCount}`;
    values.push(officeId);
  }

  query += ` ORDER BY created_at DESC LIMIT $${paramCount + 1}`;
  values.push(limit);

  const result = await pool.query(query, values);
  return result.rows.map(mapToEnhancedRecord);
}

/**
 * Get portal-specific quirks and issues
 * Returns common data structure problems for a specific portal
 */
export async function getPortalQuirks(params: {
  portalType: string;
  officeId?: string;
}): Promise<{
  quirks: string[];
  examples: EnhancedAnnotationRecord[];
}> {
  const pool = getPool();
  const { portalType, officeId } = params;

  let query = `
    SELECT
      id, portal_quirks, portal_notes, field, mapper,
      edge_case_description, path_reasoning,
      created_at, annotator_id
    FROM enhanced_annotations
    WHERE portal_type = $1
      AND (portal_quirks IS NOT NULL OR portal_notes IS NOT NULL)
  `;

  const values: any[] = [portalType];

  if (officeId) {
    query += ` AND office_id = $2`;
    values.push(officeId);
  }

  query += ` ORDER BY created_at DESC LIMIT 50`;

  const result = await pool.query(query, values);

  // Aggregate all quirks
  const quirksSet = new Set<string>();
  const examples: EnhancedAnnotationRecord[] = [];

  for (const row of result.rows) {
    if (row.portal_quirks) {
      row.portal_quirks.forEach((quirk: string) => quirksSet.add(quirk));
    }
    examples.push(mapToEnhancedRecord(row));
  }

  return {
    quirks: Array.from(quirksSet),
    examples: examples.slice(0, 10), // Top 10 examples
  };
}

/**
 * Get effective search strategies
 * Returns search terms and patterns that have worked well
 */
export async function getSearchStrategies(params: {
  mapper: string;
  field?: string;
  portalType?: string;
  officeId?: string;
  limit?: number;
}): Promise<Array<{
  terms: string[];
  effectiveness: SearchEffectiveness;
  successRate: number;
}>> {
  const pool = getPool();
  const { mapper, field, portalType, officeId, limit = 10 } = params;

  let query = `
    SELECT
      field,
      search_effectiveness,
      better_search_terms,
      search_terms_used,
      COUNT(*) as usage_count
    FROM enhanced_annotations
    WHERE mapper = $1
      AND search_effectiveness IN ('effective', 'suboptimal')
      AND (better_search_terms IS NOT NULL OR search_terms_used IS NOT NULL)
  `;

  const values: any[] = [mapper];
  let paramCount = 1;

  if (field) {
    paramCount++;
    query += ` AND field = $${paramCount}`;
    values.push(field);
  }

  if (portalType) {
    paramCount++;
    query += ` AND portal_type = $${paramCount}`;
    values.push(portalType);
  }

  if (officeId) {
    paramCount++;
    query += ` AND office_id = $${paramCount}`;
    values.push(officeId);
  }

  query += `
    GROUP BY field, search_effectiveness, better_search_terms, search_terms_used
    ORDER BY
      CASE WHEN search_effectiveness = 'effective' THEN 0 ELSE 1 END,
      usage_count DESC
    LIMIT $${paramCount + 1}
  `;
  values.push(limit);

  const result = await pool.query(query, values);

  return result.rows.map(row => ({
    terms: row.better_search_terms || row.search_terms_used || [],
    effectiveness: row.search_effectiveness,
    successRate: parseInt(row.usage_count, 10),
  }));
}

/**
 * Get comprehensive enhanced feedback for a mapper
 * Combines path feedback, edge cases, portal quirks, and search strategies
 */
export async function getEnhancedFeedback(
  params: EnhancedFeedbackParams
): Promise<EnhancedFeedbackResponse> {
  const {
    mapper,
    field,
    provider,
    portalType,
    officeId,
    includeEdgeCases = true,
    includePortalQuirks = true,
  } = params;

  // Run queries in parallel
  const [corrections, edgeCases, portalQuirksData, searchStrategies] = await Promise.all([
    getPathFeedback(params),
    includeEdgeCases
      ? getEdgeCases({ mapper, field, portalType, officeId })
      : Promise.resolve([]),
    includePortalQuirks && portalType
      ? getPortalQuirks({ portalType, officeId })
      : Promise.resolve({ quirks: [], examples: [] }),
    getSearchStrategies({ mapper, field, portalType, officeId }),
  ]);

  return {
    corrections,
    edgeCases,
    portalQuirks: portalQuirksData.quirks,
    searchStrategies,
  };
}

/**
 * Semantic search across annotations using embeddings
 * Useful for finding similar issues across different contexts
 */
export async function semanticSearchAnnotations(params: {
  query: string;
  mapper?: string;
  field?: string;
  portalType?: string;
  officeId?: string;
  limit?: number;
  minSimilarity?: number;
}): Promise<EnhancedAnnotationRecord[]> {
  const pool = getPool();
  const {
    query: searchQuery,
    mapper,
    field,
    portalType,
    officeId,
    limit = 5,
    minSimilarity = 0.7,
  } = params;

  // Check if pgvector is available
  const hasVector = await checkPgVectorSupport();
  if (!hasVector) {
    console.warn('pgvector not available, falling back to keyword search');
    return keywordSearchAnnotations(params);
  }

  // Generate embedding for search query
  const queryEmbedding = await embeddings.embedQuery(searchQuery);

  let sql = `
    SELECT
      id, verification_id, mapper, field, provider, office_id, portal_type,
      ai_value, human_value, source_path, correct_path,
      path_quality, path_reasoning, alternative_paths,
      value_quality, search_effectiveness, better_search_terms,
      portal_quirks, portal_notes,
      is_edge_case, edge_case_description,
      ai_confidence, human_confidence, confidence_gap,
      created_at, updated_at, annotator_id,
      1 - (embedding <=> $1::vector) as similarity
    FROM enhanced_annotations
    WHERE 1 = 1
  `;

  const values: any[] = [JSON.stringify(queryEmbedding)];
  let paramCount = 1;

  if (mapper) {
    paramCount++;
    sql += ` AND mapper = $${paramCount}`;
    values.push(mapper);
  }

  if (field) {
    paramCount++;
    sql += ` AND field = $${paramCount}`;
    values.push(field);
  }

  if (portalType) {
    paramCount++;
    sql += ` AND portal_type = $${paramCount}`;
    values.push(portalType);
  }

  if (officeId) {
    paramCount++;
    sql += ` AND office_id = $${paramCount}`;
    values.push(officeId);
  }

  sql += `
    ORDER BY similarity DESC
    LIMIT $${paramCount + 1}
  `;
  values.push(limit);

  const result = await pool.query(sql, values);

  return result.rows
    .filter(row => row.similarity >= minSimilarity)
    .map(row => ({
      ...mapToEnhancedRecord(row),
      similarity_score: row.similarity,
    }));
}

/**
 * Fallback keyword search when pgvector is not available
 */
async function keywordSearchAnnotations(params: {
  query: string;
  mapper?: string;
  field?: string;
  portalType?: string;
  officeId?: string;
  limit?: number;
}): Promise<EnhancedAnnotationRecord[]> {
  const pool = getPool();
  const { query: searchQuery, mapper, field, portalType, officeId, limit = 5 } = params;

  let sql = `
    SELECT
      id, verification_id, mapper, field, provider, office_id, portal_type,
      ai_value, human_value, source_path, correct_path,
      path_quality, path_reasoning,
      value_quality,
      is_edge_case, edge_case_description,
      portal_notes,
      created_at, updated_at, annotator_id
    FROM enhanced_annotations
    WHERE (
      path_reasoning ILIKE $1
      OR edge_case_description ILIKE $1
      OR portal_notes ILIKE $1
      OR correct_path ILIKE $1
    )
  `;

  const values: any[] = [`%${searchQuery}%`];
  let paramCount = 1;

  if (mapper) {
    paramCount++;
    sql += ` AND mapper = $${paramCount}`;
    values.push(mapper);
  }

  if (field) {
    paramCount++;
    sql += ` AND field = $${paramCount}`;
    values.push(field);
  }

  if (portalType) {
    paramCount++;
    sql += ` AND portal_type = $${paramCount}`;
    values.push(portalType);
  }

  if (officeId) {
    paramCount++;
    sql += ` AND office_id = $${paramCount}`;
    values.push(officeId);
  }

  sql += ` ORDER BY created_at DESC LIMIT $${paramCount + 1}`;
  values.push(limit);

  const result = await pool.query(sql, values);
  return result.rows.map(mapToEnhancedRecord);
}

/**
 * Get statistics for a specific mapper
 */
export async function getMapperStatistics(params: {
  mapper: string;
  portalType?: string;
  officeId?: string;
}): Promise<AnnotationStatistics[]> {
  const pool = getPool();
  const { mapper, portalType, officeId } = params;

  let query = `
    SELECT * FROM enhanced_annotations_stats
    WHERE mapper = $1
  `;

  const values: any[] = [mapper];
  let paramCount = 1;

  if (portalType) {
    paramCount++;
    query += ` AND portal_type = $${paramCount}`;
    values.push(portalType);
  }

  if (officeId) {
    paramCount++;
    query += ` AND office_id = $${paramCount}`;
    values.push(officeId);
  }

  query += ` ORDER BY total_annotations DESC`;

  const result = await pool.query(query, values);
  return result.rows.map(row => ({
    mapper: row.mapper,
    field: row.field,
    provider: row.provider,
    portalType: row.portal_type,
    officeId: row.office_id,
    totalAnnotations: parseInt(row.total_annotations, 10),
    correctPaths: parseInt(row.correct_paths, 10),
    incorrectPaths: parseInt(row.incorrect_paths, 10),
    partialPaths: parseInt(row.partial_paths, 10),
    ambiguousPaths: parseInt(row.ambiguous_paths, 10),
    exactValues: parseInt(row.exact_values, 10),
    formatIssues: parseInt(row.format_issues, 10),
    typeIssues: parseInt(row.type_issues, 10),
    incorrectValues: parseInt(row.incorrect_values, 10),
    effectiveSearches: parseInt(row.effective_searches, 10),
    suboptimalSearches: parseInt(row.suboptimal_searches, 10),
    ineffectiveSearches: parseInt(row.ineffective_searches, 10),
    avgToolCalls: parseFloat(row.avg_tool_calls) || 0,
    avgExtractionTimeMs: parseFloat(row.avg_extraction_time_ms) || 0,
    avgTokenCost: parseFloat(row.avg_token_cost) || 0,
    avgAiConfidence: parseFloat(row.avg_ai_confidence) || 0,
    avgHumanConfidence: parseFloat(row.avg_human_confidence) || 0,
    avgConfidenceGap: parseFloat(row.avg_confidence_gap) || 0,
    edgeCaseCount: parseInt(row.edge_case_count, 10),
    lastAnnotationDate: new Date(row.last_annotation_date),
  }));
}

/**
 * Helper: Check if pgvector extension is available
 */
async function checkPgVectorSupport(): Promise<boolean> {
  const pool = getPool();
  try {
    const result = await pool.query(
      "SELECT 1 FROM pg_extension WHERE extname = 'vector'"
    );
    return result.rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * Helper: Map database row to EnhancedAnnotationRecord
 */
function mapToEnhancedRecord(row: any): EnhancedAnnotationRecord {
  return {
    id: row.id,
    verification_id: row.verification_id,
    mapper: row.mapper,
    field: row.field,
    provider: row.provider,
    office_id: row.office_id,
    portal_type: row.portal_type,
    ai_value: row.ai_value,
    human_value: row.human_value,
    source_path: row.source_path,
    correct_path: row.correct_path,
    human_reasoning: row.human_reasoning,
    path_quality: row.path_quality,
    path_reasoning: row.path_reasoning,
    alternative_paths: row.alternative_paths,
    value_quality: row.value_quality,
    format_correction: row.format_correction,
    search_terms_used: row.search_terms_used,
    search_effectiveness: row.search_effectiveness,
    better_search_terms: row.better_search_terms,
    tool_usage_pattern: row.tool_usage_pattern,
    ai_confidence: row.ai_confidence ? parseFloat(row.ai_confidence) : undefined,
    human_confidence: row.human_confidence,
    confidence_gap: row.confidence_gap ? parseFloat(row.confidence_gap) : undefined,
    portal_quirks: row.portal_quirks,
    portal_notes: row.portal_notes,
    reasoning_quality: row.reasoning_quality,
    reasoning_feedback: row.reasoning_feedback,
    is_edge_case: row.is_edge_case,
    edge_case_description: row.edge_case_description,
    tool_calls_count: row.tool_calls_count,
    extraction_time_ms: row.extraction_time_ms,
    token_cost: row.token_cost ? parseFloat(row.token_cost) : undefined,
    label_studio_task_id: row.label_studio_task_id,
    label_studio_annotation_id: row.label_studio_annotation_id,
    annotator_id: row.annotator_id,
    annotation_time_seconds: row.annotation_time_seconds,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
    similarity_score: row.similarity_score,
  };
}

/**
 * Refresh materialized view statistics
 * Call this periodically (e.g., hourly) to keep stats up to date
 */
export async function refreshStatistics(): Promise<void> {
  const pool = getPool();
  await pool.query('REFRESH MATERIALIZED VIEW enhanced_annotations_stats');
  console.log('✅ Refreshed enhanced_annotations_stats materialized view');
}
