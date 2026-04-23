/**
 * PostgreSQL Semantic Search Tool
 * Queries PostgreSQL vector database for semantic search using Ollama embeddings
 */

import { getPool } from './db-setup.js';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import axios from 'axios';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'embeddinggemma';
const TABLE_NAME = process.env.POSTGRES_EMBEDDINGS_TABLE || 'chunk_embeddings';

/**
 * Generate embedding for query text using Ollama
 */
async function generateQueryEmbedding(queryText: string): Promise<number[]> {
  try {
    console.log(`[POSTGRES_SEARCH] Generating embedding for query: "${queryText.substring(0, 100)}..."`);

    const response = await axios.post(
      `${OLLAMA_URL}/api/embeddings`,
      {
        model: EMBEDDING_MODEL,
        prompt: queryText,
      },
      {
        timeout: 30000,
      }
    );

    if (!response.data || !response.data.embedding) {
      throw new Error('Failed to generate embedding: Invalid response from Ollama');
    }

    console.log(`[POSTGRES_SEARCH] Generated embedding (dimension: ${response.data.embedding.length})`);
    return response.data.embedding;
  } catch (error: any) {
    console.error('[POSTGRES_SEARCH] Failed to generate embedding:', error.message);
    throw new Error(`Embedding generation failed: ${error.message}`);
  }
}

/**
 * Query PostgreSQL for semantically similar chunks
 * Exported for use by other tools
 */
export async function semanticSearch(params: {
  query: string;
  patientName?: string;
  contentType?: string;
  limit?: number;
  minSimilarity?: number;
}): Promise<Array<{
  chunk_text: string;
  patient_name: string;
  content_type: string;
  section_title: string;
  page_number: number;
  metadata: any;
  similarity: number;
}>> {
  const {
    query,
    patientName,
    contentType,
    limit = 10,
    minSimilarity = 0.4,
  } = params;

  console.log(`[POSTGRES_SEARCH] Searching for: "${query}"`);
  console.log(`[POSTGRES_SEARCH] Filters: patient="${patientName || 'any'}", contentType="${contentType || 'any'}", limit=${limit}`);

  // Generate embedding for the query
  const queryEmbedding = await generateQueryEmbedding(query);

  // Build SQL query with filters
  let sql = `
    SELECT
      chunk_text,
      patient_name,
      content_type,
      section_title,
      page_number,
      metadata,
      1 - (embedding <=> $1::vector) AS similarity
    FROM ${TABLE_NAME}
    WHERE 1=1
  `;

  const params_array: any[] = [JSON.stringify(queryEmbedding)];
  let paramIndex = 2;

  if (patientName) {
    sql += ` AND patient_name = $${paramIndex}`;
    params_array.push(patientName);
    paramIndex++;
  }

  if (contentType) {
    sql += ` AND content_type = $${paramIndex}`;
    params_array.push(contentType);
    paramIndex++;
  }

  sql += `
    AND (1 - (embedding <=> $1::vector)) >= $${paramIndex}
    ORDER BY similarity DESC
    LIMIT $${paramIndex + 1}
  `;
  params_array.push(minSimilarity, limit);

  try {
    const pool = getPool();
    const result = await pool.query(sql, params_array);

    console.log(`[POSTGRES_SEARCH] Found ${result.rows.length} results`);

    // Log top results
    if (result.rows.length > 0) {
      console.log(`[POSTGRES_SEARCH] Top result (similarity: ${result.rows[0].similarity.toFixed(3)}):`);
      console.log(`[POSTGRES_SEARCH]   Text: ${result.rows[0].chunk_text.substring(0, 100)}...`);
      console.log(`[POSTGRES_SEARCH]   Section: ${result.rows[0].section_title || 'N/A'}`);
      console.log(`[POSTGRES_SEARCH]   Page: ${result.rows[0].page_number || 'N/A'}`);
    }

    return result.rows;
  } catch (error: any) {
    console.error('[POSTGRES_SEARCH] Query failed:', error.message);
    throw new Error(`Semantic search failed: ${error.message}`);
  }
}

/**
 * LangChain tool for semantic search in PostgreSQL
 */
export const postgresSemanticSearchTool = tool(
  async (input) => {
    try {
      const results = await semanticSearch({
        query: input.query,
        patientName: input.patientName,
        contentType: input.contentType,
        limit: input.limit || 10,
        minSimilarity: input.minSimilarity || 0.4,
      });

      // Format results for LLM
      const formattedResults = results.map((r, idx) => ({
        rank: idx + 1,
        text: r.chunk_text,
        section: r.section_title || 'Unknown',
        page: r.page_number || 'N/A',
        contentType: r.content_type || 'Unknown',
        similarity: r.similarity.toFixed(3),
        metadata: r.metadata,
      }));

      return JSON.stringify({
        query: input.query,
        totalResults: results.length,
        results: formattedResults,
      }, null, 2);
    } catch (error: any) {
      return JSON.stringify({
        error: error.message,
        query: input.query,
        totalResults: 0,
        results: [],
      });
    }
  },
  {
    name: 'postgres_semantic_search',
    description: 'Search for semantically similar content in PostgreSQL vector database. Use natural language queries to find relevant patient information, insurance data, benefits, etc. Returns ranked results with similarity scores.',
    schema: z.object({
      query: z.string().describe('Natural language query describing what you\'re looking for (e.g., "patient name and date of birth", "coverage limits for orthodontics", "member ID")'),
      patientName: z.string().optional().describe('Filter results to specific patient folder (e.g., "LASTNAME_FIRSTNAME_CARRIER_FB_2025-12-16_07-17-03")'),
      contentType: z.string().optional().describe('Filter by content type (e.g., "patient_info", "benefits", "coverage")'),
      limit: z.number().optional().default(10).describe('Maximum number of results to return (default: 10)'),
      minSimilarity: z.number().optional().default(0.4).describe('Minimum similarity score (0.0-1.0, default: 0.4)'),
    }),
  }
);
