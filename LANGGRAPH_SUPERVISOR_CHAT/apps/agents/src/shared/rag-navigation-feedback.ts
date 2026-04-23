/**
 * RAG Navigation Feedback System
 * Stores and retrieves successful navigation examples for login/search/navigation tasks
 */

import { Pool } from 'pg';
import { OpenAIEmbeddings } from '@langchain/openai';

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

// OpenAI embeddings client
let embeddings: OpenAIEmbeddings | null = null;

function getEmbeddings(): OpenAIEmbeddings {
  if (!embeddings) {
    embeddings = new OpenAIEmbeddings({
      model: "text-embedding-3-small",
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  return embeddings;
}

export interface NavigationFeedback {
  id?: number;
  provider: string;
  officeKey: string;
  task: string; // 'login', 'patient_search', 'navigate_to_benefits', etc.
  success: boolean;
  steps: any[]; // Array of action descriptions
  selectors?: any; // DOM selectors used
  timingMs?: number;
  portalUrl?: string;
  portalVersion?: string;
  content?: string; // For embedding
  embedding?: number[];
  timestamp?: Date;
  sessionId?: string;
}

/**
 * Save navigation feedback to RAG
 */
export async function saveNavigationFeedback(feedback: NavigationFeedback): Promise<void> {
  try {
    const client = getPool();

    // Create content for embedding
    const content = createNavigationContent(feedback);

    // Generate embedding
    let embedding: number[] | null = null;
    if (process.env.OPENAI_API_KEY) {
      try {
        const embedder = getEmbeddings();
        const embeddingResult = await embedder.embedQuery(content);
        embedding = embeddingResult;
      } catch (error) {
        console.warn('[RAG_NAV] Could not generate embedding:', error);
      }
    }

    // Insert into database
    await client.query(
      `INSERT INTO navigation_feedback
       (provider, office_key, task, success, steps, selectors, timing_ms,
        portal_url, portal_version, content, embedding, timestamp, session_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        feedback.provider,
        feedback.officeKey,
        feedback.task,
        feedback.success,
        JSON.stringify(feedback.steps),
        feedback.selectors ? JSON.stringify(feedback.selectors) : null,
        feedback.timingMs,
        feedback.portalUrl,
        feedback.portalVersion,
        content,
        embedding ? `[${embedding.join(',')}]` : null,
        feedback.timestamp || new Date(),
        feedback.sessionId
      ]
    );

    console.log(`[RAG_NAV] ✅ Saved ${feedback.task} feedback for ${feedback.provider}`);
  } catch (error) {
    // Don't throw - gracefully handle database errors
    // The workflow should continue even if RAG storage fails
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('relation "navigation_feedback" does not exist')) {
      console.warn('[RAG_NAV] ⚠️ Navigation feedback table does not exist. Run database migrations to enable RAG features.');
    } else {
      console.error('[RAG_NAV] Failed to save navigation feedback:', error);
    }
    // Don't throw - allow workflow to continue
  }
}

/**
 * Retrieve relevant navigation examples for a task
 */
export async function getNavigationExamples(
  provider: string,
  officeKey: string,
  task: string,
  limit: number = 5
): Promise<NavigationFeedback[]> {
  try {
    const client = getPool();

    // Query for exact matches (provider + office + task + success)
    const result = await client.query(
      `SELECT id, provider, office_key, task, success, steps, selectors,
              timing_ms, portal_url, portal_version, content, timestamp, session_id
       FROM navigation_feedback
       WHERE provider = $1
         AND (office_key = $2 OR office_key IS NULL)
         AND task = $3
         AND success = true
       ORDER BY timestamp DESC
       LIMIT $4`,
      [provider, officeKey, task, limit]
    );

    return result.rows.map(row => ({
      id: row.id,
      provider: row.provider,
      officeKey: row.office_key,
      task: row.task,
      success: row.success,
      steps: row.steps,
      selectors: row.selectors,
      timingMs: row.timing_ms,
      portalUrl: row.portal_url,
      portalVersion: row.portal_version,
      content: row.content,
      timestamp: row.timestamp,
      sessionId: row.session_id
    }));
  } catch (error) {
    // Return empty array on error - workflow should continue without RAG examples
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('relation "navigation_feedback" does not exist')) {
      console.warn('[RAG_NAV] ⚠️ Navigation feedback table does not exist. Continuing without RAG examples.');
    } else {
      console.error('[RAG_NAV] Failed to retrieve navigation examples:', error);
    }
    return [];
  }
}

/**
 * Create content string for embedding
 */
function createNavigationContent(feedback: NavigationFeedback): string {
  const parts = [
    `Task: ${feedback.task}`,
    `Provider: ${feedback.provider}`,
    `Office: ${feedback.officeKey}`,
    `Success: ${feedback.success}`,
    `Steps:`,
    ...feedback.steps.map((step, i) => `  ${i + 1}. ${typeof step === 'string' ? step : JSON.stringify(step)}`),
  ];

  if (feedback.portalUrl) {
    parts.push(`Portal URL: ${feedback.portalUrl}`);
  }

  if (feedback.selectors) {
    parts.push(`Selectors used: ${JSON.stringify(feedback.selectors)}`);
  }

  return parts.join('\n');
}

/**
 * Format navigation examples for LLM prompt injection
 */
export function formatNavigationExamplesForPrompt(examples: NavigationFeedback[]): string {
  if (examples.length === 0) {
    return "No previous examples available for this task.";
  }

  const formatted = examples.map((ex, index) => {
    const stepsFormatted = ex.steps.map((step, i) =>
      `   ${i + 1}. ${typeof step === 'string' ? step : JSON.stringify(step)}`
    ).join('\n');

    return `
Example ${index + 1} (from ${new Date(ex.timestamp!).toLocaleDateString()}):
Task: ${ex.task}
Provider: ${ex.provider}
Office: ${ex.officeKey}
Steps taken:
${stepsFormatted}
Result: ${ex.success ? '✅ Success' : '❌ Failed'}
${ex.timingMs ? `Duration: ${ex.timingMs}ms` : ''}
`;
  });

  return formatted.join('\n---\n');
}
