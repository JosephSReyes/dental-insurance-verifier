/**
 * API Route: /api/label-studio/webhook
 *
 * Receives webhook callbacks from Label Studio when annotations are created/updated
 * Processes the annotations and saves them to the enhanced_annotations table
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '../../../../../../agents/src/shared/db-setup';
import type {
  EnhancedCorrectionData,
  LabelStudioAnnotationResult,
  PathQuality,
  ValueQuality,
  SearchEffectiveness,
  ReasoningQuality,
  PortalQuirk,
} from '../../../../../../agents/src/shared/enhanced-annotation-types';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface LabelStudioWebhookPayload {
  action: string; // 'ANNOTATION_CREATED' | 'ANNOTATION_UPDATED' | 'ANNOTATION_DELETED'
  project: {
    id: number;
  };
  task: {
    id: number;
    data: any;
    annotations?: Array<{
      id: number;
      completed_by: number;
      result: any[];
      was_cancelled: boolean;
      ground_truth: boolean;
      created_at: string;
      updated_at: string;
      lead_time: number;
    }>;
  };
  annotation?: {
    id: number;
    completed_by: number;
    result: any[];
    was_cancelled: boolean;
    ground_truth: boolean;
    created_at: string;
    updated_at: string;
    lead_time: number;
  };
}

/**
 * POST /api/label-studio/webhook
 * Receive and process Label Studio webhook callbacks
 */
export async function POST(request: NextRequest) {
  try {
    const payload: LabelStudioWebhookPayload = await request.json();

    console.log('[Label Studio Webhook] Received:', payload.action);

    // Only process completed annotations
    if (payload.action !== 'ANNOTATION_CREATED' && payload.action !== 'ANNOTATION_UPDATED') {
      return NextResponse.json({ success: true, message: 'Event ignored' });
    }

    // Skip cancelled annotations
    if (payload.annotation?.was_cancelled) {
      return NextResponse.json({ success: true, message: 'Cancelled annotation ignored' });
    }

    // Extract data
    const taskId = payload.task.id;
    const taskData = payload.task.data;
    const annotation = payload.annotation;

    if (!annotation) {
      return NextResponse.json(
        { error: 'No annotation data in payload' },
        { status: 400 }
      );
    }

    // Parse verification ID and field from task ID
    const taskIdStr = String(taskData.id || taskId);
    const [verificationId, field] = taskIdStr.split('_');

    if (!verificationId || !field) {
      return NextResponse.json(
        { error: 'Invalid task ID format. Expected: verificationId_field' },
        { status: 400 }
      );
    }

    // Parse annotation results
    const annotationResults = parseAnnotationResults(annotation.result);

    // Create enhanced correction data
    const enhancedData = createEnhancedCorrectionData(
      verificationId,
      field,
      taskData,
      annotationResults,
      annotation
    );

    // Save to database
    await saveEnhancedAnnotation(enhancedData);

    return NextResponse.json({
      success: true,
      message: 'Annotation processed and saved',
      verificationId,
      field,
      annotationId: annotation.id,
    });
  } catch (error: any) {
    console.error('[Label Studio Webhook] Error:', error);
    return NextResponse.json(
      { error: 'Failed to process annotation', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * Parse Label Studio annotation results into structured data
 */
function parseAnnotationResults(result: any[]): Partial<LabelStudioAnnotationResult> {
  const parsed: any = {};

  for (const item of result) {
    const { from_name, value } = item;

    switch (from_name) {
      case 'pathQuality':
        parsed.pathQuality = value.choices?.[0];
        break;
      case 'correctPath':
        parsed.correctPath = value.text?.[0];
        break;
      case 'pathReasoning':
        parsed.pathReasoning = value.text?.[0];
        break;
      case 'valueQuality':
        parsed.valueQuality = value.choices?.[0];
        break;
      case 'correctValue':
        parsed.correctValue = value.text?.[0];
        break;
      case 'searchTermsUsed':
        parsed.searchTermsUsed = value.text?.[0];
        break;
      case 'searchEffectiveness':
        parsed.searchEffectiveness = value.choices?.[0];
        break;
      case 'betterSearchTerms':
        parsed.betterSearchTerms = value.text?.[0];
        break;
      case 'humanConfidence':
        parsed.humanConfidence = value.rating;
        break;
      case 'portalQuirks':
        parsed.portalQuirks = value.choices || [];
        break;
      case 'portalNotes':
        parsed.portalNotes = value.text?.[0];
        break;
      case 'reasoningQuality':
        parsed.reasoningQuality = value.choices?.[0];
        break;
      case 'edgeCase':
        parsed.edgeCase = value.choices?.[0];
        break;
      case 'edgeCaseDescription':
        parsed.edgeCaseDescription = value.text?.[0];
        break;
    }
  }

  return parsed;
}

/**
 * Create enhanced correction data from annotation
 */
function createEnhancedCorrectionData(
  verificationId: string,
  field: string,
  taskData: any,
  annotationResults: Partial<LabelStudioAnnotationResult>,
  annotation: any
): EnhancedCorrectionData {
  // Parse search terms from comma-separated strings
  const searchTermsUsed = annotationResults.searchTermsUsed
    ? annotationResults.searchTermsUsed.split(',').map(s => s.trim())
    : undefined;

  const betterSearchTerms = annotationResults.betterSearchTerms
    ? annotationResults.betterSearchTerms.split(',').map(s => s.trim())
    : undefined;

  // Calculate confidence gap
  const aiConfidence = taskData.aiConfidence;
  const humanConfidence = annotationResults.humanConfidence || 3;
  const normalizedHumanConfidence = humanConfidence / 5; // Convert 1-5 to 0-1 scale
  const confidenceGap = aiConfidence && humanConfidence
    ? Math.abs(aiConfidence - normalizedHumanConfidence)
    : undefined;

  return {
    verification_id: verificationId,
    mapper: taskData.mapper,
    field,
    provider: taskData.insuranceProvider,
    office_id: taskData.officeKey,
    portal_type: taskData.portalType,

    // Basic extraction data
    ai_value: taskData.aiExtractedValue,
    human_value: annotationResults.correctValue || taskData.aiExtractedValue,
    source_path: taskData.aiSourcePath,
    correct_path: annotationResults.correctPath || taskData.aiSourcePath,
    human_reasoning: annotationResults.pathReasoning,

    // Path quality
    path_quality: (annotationResults.pathQuality || 'correct') as PathQuality,
    path_reasoning: annotationResults.pathReasoning,
    alternative_paths: undefined, // Could be extracted from portal notes

    // Value quality
    value_quality: (annotationResults.valueQuality || 'exact') as ValueQuality,
    format_correction: annotationResults.valueQuality === 'format_issue'
      ? annotationResults.correctValue
      : undefined,

    // Search strategy
    search_terms_used: searchTermsUsed,
    search_effectiveness: annotationResults.searchEffectiveness as SearchEffectiveness | undefined,
    better_search_terms: betterSearchTerms,
    tool_usage_pattern: taskData.toolUsagePattern,

    // Confidence
    ai_confidence: aiConfidence,
    human_confidence: humanConfidence,
    confidence_gap: confidenceGap,

    // Portal context
    portal_quirks: annotationResults.portalQuirks as PortalQuirk[] | undefined,
    portal_notes: annotationResults.portalNotes,

    // Reasoning
    reasoning_quality: annotationResults.reasoningQuality as ReasoningQuality | undefined,
    reasoning_feedback: undefined, // Could be added to UI

    // Edge case
    is_edge_case: annotationResults.edgeCase === 'yes',
    edge_case_description: annotationResults.edgeCaseDescription,

    // Performance
    tool_calls_count: taskData.toolCallsCount,
    extraction_time_ms: taskData.extractionTimeMs,
    token_cost: undefined, // Could be calculated

    // Label Studio metadata
    label_studio_task_id: String(taskData.id),
    label_studio_annotation_id: String(annotation.id),
    annotator_id: String(annotation.completed_by),
    annotation_time_seconds: annotation.lead_time,
  };
}

/**
 * Save enhanced annotation to database
 */
async function saveEnhancedAnnotation(data: EnhancedCorrectionData): Promise<void> {
  const pool = getPool();

  // Generate embedding for RAG
  const embeddingText = createEmbeddingText(data);
  let embedding: number[] | null = null;

  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: embeddingText,
    });
    embedding = response.data[0].embedding;
  } catch (error) {
    console.error('Failed to generate embedding:', error);
  }

  // Check if table uses vector or text for embeddings
  const useVector = await checkPgVectorSupport(pool);

  const query = `
    INSERT INTO enhanced_annotations (
      verification_id, mapper, field, provider, office_id, portal_type,
      ai_value, human_value, source_path, correct_path, human_reasoning,
      path_quality, path_reasoning, alternative_paths,
      value_quality, format_correction,
      search_terms_used, search_effectiveness, better_search_terms, tool_usage_pattern,
      ai_confidence, human_confidence, confidence_gap,
      portal_quirks, portal_notes,
      reasoning_quality, reasoning_feedback,
      is_edge_case, edge_case_description,
      tool_calls_count, extraction_time_ms, token_cost,
      label_studio_task_id, label_studio_annotation_id,
      annotator_id, annotation_time_seconds,
      ${useVector ? 'embedding' : 'embedding_text'}
    )
    VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10, $11,
      $12, $13, $14,
      $15, $16,
      $17, $18, $19, $20,
      $21, $22, $23,
      $24, $25,
      $26, $27,
      $28, $29,
      $30, $31, $32,
      $33, $34,
      $35, $36,
      $37
    )
    ON CONFLICT (verification_id, mapper, field, label_studio_annotation_id)
    DO UPDATE SET
      ai_value = EXCLUDED.ai_value,
      human_value = EXCLUDED.human_value,
      path_quality = EXCLUDED.path_quality,
      value_quality = EXCLUDED.value_quality,
      search_effectiveness = EXCLUDED.search_effectiveness,
      human_confidence = EXCLUDED.human_confidence,
      updated_at = NOW()
  `;

  const values = [
    data.verification_id,
    data.mapper,
    data.field,
    data.provider,
    data.office_id,
    data.portal_type,
    data.ai_value,
    data.human_value,
    data.source_path,
    data.correct_path,
    data.human_reasoning,
    data.path_quality,
    data.path_reasoning,
    data.alternative_paths,
    data.value_quality,
    data.format_correction,
    data.search_terms_used,
    data.search_effectiveness,
    data.better_search_terms,
    data.tool_usage_pattern,
    data.ai_confidence,
    data.human_confidence,
    data.confidence_gap,
    data.portal_quirks,
    data.portal_notes,
    data.reasoning_quality,
    data.reasoning_feedback,
    data.is_edge_case,
    data.edge_case_description,
    data.tool_calls_count,
    data.extraction_time_ms,
    data.token_cost,
    data.label_studio_task_id,
    data.label_studio_annotation_id,
    data.annotator_id,
    data.annotation_time_seconds,
    useVector ? embedding : (embedding ? JSON.stringify(embedding) : null),
  ];

  await pool.query(query, values);

  console.log(`[Enhanced Annotation] Saved: ${data.verification_id}/${data.field}`);
}

/**
 * Create text for embedding generation
 */
function createEmbeddingText(data: EnhancedCorrectionData): string {
  return [
    `Mapper: ${data.mapper}`,
    `Field: ${data.field}`,
    `Provider: ${data.provider}`,
    `Portal: ${data.portal_type}`,
    `Office: ${data.office_id}`,
    `Path Quality: ${data.path_quality}`,
    data.correct_path ? `Correct Path: ${data.correct_path}` : '',
    data.path_reasoning ? `Path Reasoning: ${data.path_reasoning}` : '',
    data.search_effectiveness ? `Search Effectiveness: ${data.search_effectiveness}` : '',
    data.better_search_terms ? `Better Search Terms: ${data.better_search_terms.join(', ')}` : '',
    data.portal_notes ? `Portal Notes: ${data.portal_notes}` : '',
    data.edge_case_description ? `Edge Case: ${data.edge_case_description}` : '',
  ].filter(Boolean).join('\n');
}

/**
 * Check if database supports pgvector
 */
async function checkPgVectorSupport(pool: any): Promise<boolean> {
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
 * GET /api/label-studio/webhook
 * Health check endpoint
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: 'ready',
    endpoint: '/api/label-studio/webhook',
    accepts: ['ANNOTATION_CREATED', 'ANNOTATION_UPDATED'],
  });
}
