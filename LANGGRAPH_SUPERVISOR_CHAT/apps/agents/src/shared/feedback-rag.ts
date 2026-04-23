import { OpenAIEmbeddings } from '@langchain/openai';
import { PGVectorStore } from '@langchain/community/vectorstores/pgvector';
import { PoolConfig } from 'pg';
import { getPool, getPostgresConfig } from './db-setup.js';
import {
  CorrectionData,
  CorrectionRecord,
  FeedbackQueryParams,
  SemanticSearchParams,
  RelevantFeedbackParams,
  FeedbackStats,
} from './feedback-types.js';

const embeddings = new OpenAIEmbeddings({
  modelName: 'text-embedding-3-small',
  dimensions: 1536,
});

let vectorStore: PGVectorStore | null = null;

function getVectorStoreConfig(): PoolConfig & { tableName: string } {
  return {
    ...getPostgresConfig(),
    tableName: 'feedback_corrections',
  };
}

async function getVectorStore(): Promise<PGVectorStore> {
  if (!vectorStore) {
    vectorStore = await PGVectorStore.initialize(embeddings, getVectorStoreConfig());
  }
  return vectorStore;
}

function createEmbeddingDocument(correction: CorrectionData): string {
  const officeId = correction.office_id || correction.metadata?.office_id || 'unknown';
  const portalType = correction.portal_type || correction.metadata?.portal_type || 'unknown';
  const portalVersion = correction.metadata?.portal_version || portalType;  // Use version if available, fall back to type

  const parts = [
    `Field: ${correction.field}`,
    `Mapper: ${correction.mapper}`,
    `Provider: ${correction.provider}`,
    `Office: ${officeId}`,  // Include office in embedding
    `Portal: ${portalVersion}`,  // Use specific version for embedding (e.g., 'bcbs_ca' vs just 'bcbs')
    `AI extracted: "${correction.ai_value || 'null'}"${correction.source_path ? ` from ${correction.source_path}` : ''}`,
    `Correct value: "${correction.human_value || 'null'}"`,
  ];

  if (correction.human_reasoning) {
    parts.push(`Human reasoning: ${correction.human_reasoning}`);
  }

  if (correction.metadata?.patient_name) {
    parts.push(`Context: Verification for ${correction.metadata.patient_name}${correction.metadata.verification_date ? ` on ${correction.metadata.verification_date}` : ''}`);
  }

  return parts.join('\n');
}

export async function saveCorrectionToRAG(correction: CorrectionData): Promise<void> {
  try {
    const pool = getPool();
    const embeddingText = createEmbeddingDocument(correction);
    const embeddingVector = await embeddings.embedQuery(embeddingText);

    const query = `
      INSERT INTO feedback_corrections (
        verification_id, mapper, provider, field, ai_value, human_value,
        source_path, correct_path, human_reasoning, reviewer_id, reviewed_at,
        office_id, portal_type, embedding, metadata,
        error_types, error_explanations, violated_business_rules, feedback_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING id
    `;

    // Use portal_version if available, otherwise fall back to portal_type
    const portalValue = correction.metadata?.portal_version || correction.portal_type || correction.metadata?.portal_type || null;

    const values = [
      correction.verification_id,
      correction.mapper,
      correction.provider,
      correction.field,
      correction.ai_value,
      correction.human_value,
      correction.source_path || null,
      correction.correct_path || null,
      correction.human_reasoning || null,
      correction.reviewer_id || null,
      correction.reviewed_at || new Date(),
      correction.office_id || correction.metadata?.office_id || null,
      portalValue,  // Store portal version in portal_type column (Option A approach)
      JSON.stringify(embeddingVector),
      JSON.stringify(correction.metadata || {}),
      // Multiple error types support (Migration 007)
      correction.error_types || [],
      JSON.stringify(correction.error_explanations || {}),
      correction.violated_business_rules || [],
      correction.feedback_date || new Date(),
    ];

    const result = await pool.query(query, values);
    console.log(`✅ Saved correction to RAG (ID: ${result.rows[0].id}) - ${correction.mapper}:${correction.field} for ${correction.provider} [Office: ${correction.office_id || 'N/A'}, Portal: ${portalValue || 'N/A'}]`);
  } catch (error) {
    console.error('❌ Failed to save correction to RAG:', error);
    throw error;
  }
}

export async function getFeedbackForField(params: FeedbackQueryParams): Promise<CorrectionRecord[]> {
  try {
    const pool = getPool();
    const { mapper, provider, field, limit = 10, officeId, portalType } = params;

    let query = `
      SELECT
        id, verification_id, mapper, provider, field, ai_value, human_value,
        source_path, correct_path, human_reasoning, reviewer_id, reviewed_at,
        office_id, portal_type, metadata, created_at, updated_at
      FROM feedback_corrections
      WHERE mapper = $1 AND provider = $2
    `;
    const values: any[] = [mapper, provider];
    let paramCount = 2;

    // Add office filter if provided
    if (officeId) {
      paramCount++;
      query += ` AND office_id = $${paramCount}`;
      values.push(officeId);
    }

    // Add portal filter if provided
    if (portalType) {
      paramCount++;
      query += ` AND portal_type = $${paramCount}`;
      values.push(portalType);
    }

    if (field && field !== 'all') {
      paramCount++;
      query += ` AND field = $${paramCount}`;
      values.push(field);
    }

    paramCount++;
    query += ` ORDER BY reviewed_at DESC LIMIT $${paramCount}`;
    values.push(limit);

    const result = await pool.query(query, values);
    return result.rows.map(row => ({
      ...row,
      reviewed_at: new Date(row.reviewed_at),
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    }));
  } catch (error) {
    console.error('❌ Failed to get feedback for field:', error);
    return [];
  }
}

export async function searchSimilarCorrections(params: SemanticSearchParams): Promise<CorrectionRecord[]> {
  try {
    const pool = getPool();
    const { query, mapper, provider, field, limit = 5, minSimilarity = 0.7, officeId, portalType } = params;

    const queryEmbedding = await embeddings.embedQuery(query);

    let sql = `
      SELECT
        id, verification_id, mapper, provider, field, ai_value, human_value,
        source_path, correct_path, human_reasoning, reviewer_id, reviewed_at,
        office_id, portal_type, metadata, created_at, updated_at,
        1 - (embedding <=> $1::vector) as similarity_score
      FROM feedback_corrections
      WHERE 1 - (embedding <=> $1::vector) >= $2
    `;
    const values: any[] = [JSON.stringify(queryEmbedding), minSimilarity];
    let paramCount = 2;

    if (mapper) {
      paramCount++;
      sql += ` AND mapper = $${paramCount}`;
      values.push(mapper);
    }

    if (provider) {
      paramCount++;
      sql += ` AND provider = $${paramCount}`;
      values.push(provider);
    }

    if (field && field !== 'all') {
      paramCount++;
      sql += ` AND field = $${paramCount}`;
      values.push(field);
    }

    // NEW: Add office filter
    if (officeId) {
      paramCount++;
      sql += ` AND office_id = $${paramCount}`;
      values.push(officeId);
    }

    // NEW: Add portal filter
    if (portalType) {
      paramCount++;
      sql += ` AND portal_type = $${paramCount}`;
      values.push(portalType);
    }

    sql += ` ORDER BY similarity_score DESC LIMIT $${paramCount + 1}`;
    values.push(limit);

    const result = await pool.query(sql, values);
    return result.rows.map(row => ({
      ...row,
      reviewed_at: new Date(row.reviewed_at),
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      similarity_score: parseFloat(row.similarity_score),
    }));
  } catch (error) {
    console.error('❌ Failed to search similar corrections:', error);
    return [];
  }
}

export async function getRelevantFeedback(params: RelevantFeedbackParams): Promise<CorrectionRecord[]> {
  const { mapper, provider, field = 'all', currentContext, limit = 5, officeId, portalType } = params;

  try {
    // Get exact matches with office/portal filtering
    const exactMatches = await getFeedbackForField({
      mapper,
      provider,
      field,
      limit: Math.ceil(limit / 2),
      officeId,  // NEW: Pass office filter
      portalType,  // NEW: Pass portal filter
    });

    if (currentContext && exactMatches.length < limit) {
      const semanticQuery = currentContext || `${mapper} ${provider} ${field}`;
      const semanticMatches = await searchSimilarCorrections({
        query: semanticQuery,
        mapper,
        provider,
        field: field !== 'all' ? field : undefined,
        limit: limit - exactMatches.length,
        minSimilarity: 0.7,
        officeId,  // NEW: Pass office filter
        portalType,  // NEW: Pass portal filter
      });

      const exactIds = new Set(exactMatches.map(m => m.id));
      const uniqueSemanticMatches = semanticMatches.filter(m => !exactIds.has(m.id));

      return [...exactMatches, ...uniqueSemanticMatches].slice(0, limit);
    }

    return exactMatches;
  } catch (error) {
    console.error('❌ Failed to get relevant feedback:', error);
    return [];
  }
}

export async function getFeedbackStats(): Promise<FeedbackStats> {
  try {
    const pool = getPool();

    const totalResult = await pool.query('SELECT COUNT(*) as count FROM feedback_corrections');
    const total_corrections = parseInt(totalResult.rows[0].count);

    const mapperResult = await pool.query(`
      SELECT mapper, COUNT(*) as count
      FROM feedback_corrections
      GROUP BY mapper
    `);
    const by_mapper: Record<string, number> = {};
    mapperResult.rows.forEach(row => {
      by_mapper[row.mapper] = parseInt(row.count);
    });

    const providerResult = await pool.query(`
      SELECT provider, COUNT(*) as count
      FROM feedback_corrections
      GROUP BY provider
    `);
    const by_provider: Record<string, number> = {};
    providerResult.rows.forEach(row => {
      by_provider[row.provider] = parseInt(row.count);
    });

    const fieldResult = await pool.query(`
      SELECT field, COUNT(*) as count
      FROM feedback_corrections
      GROUP BY field
    `);
    const by_field: Record<string, number> = {};
    fieldResult.rows.forEach(row => {
      by_field[row.field] = parseInt(row.count);
    });

    const mostCorrectedResult = await pool.query(`
      SELECT field, mapper, provider, COUNT(*) as count
      FROM feedback_corrections
      GROUP BY field, mapper, provider
      ORDER BY count DESC
      LIMIT 20
    `);
    const most_corrected_fields = mostCorrectedResult.rows.map(row => ({
      field: row.field,
      mapper: row.mapper,
      provider: row.provider,
      count: parseInt(row.count),
    }));

    return {
      total_corrections,
      by_mapper,
      by_provider,
      by_field,
      most_corrected_fields,
    };
  } catch (error) {
    console.error('❌ Failed to get feedback stats:', error);
    throw error;
  }
}

export async function bulkImportCorrections(corrections: CorrectionData[]): Promise<number> {
  let successCount = 0;
  
  for (const correction of corrections) {
    try {
      await saveCorrectionToRAG(correction);
      successCount++;
    } catch (error) {
      console.error(`Failed to import correction for ${correction.field}:`, error);
    }
  }

  console.log(`✅ Bulk import complete: ${successCount}/${corrections.length} corrections imported`);
  return successCount;
}
