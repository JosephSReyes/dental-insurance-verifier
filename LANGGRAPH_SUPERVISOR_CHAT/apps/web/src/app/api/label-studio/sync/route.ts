/**
 * API Route: /api/label-studio/sync
 *
 * Syncs verification tasks to Label Studio for annotation
 * This creates Label Studio tasks from completed verifications
 */

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getLabelStudioClient } from '../../../../../../agents/src/shared/label-studio-client';
import type { LabelStudioTask } from '../../../../../../agents/src/shared/enhanced-annotation-types';

const FORMS_DIR = path.join(process.cwd(), '../../agents/forms');
const LABEL_STUDIO_PROJECT_ID = parseInt(process.env.LABEL_STUDIO_PROJECT_ID || '1');

interface SyncRequest {
  verificationIds?: string[]; // Specific IDs to sync, or all if not provided
  overwrite?: boolean; // Overwrite existing tasks
}

/**
 * POST /api/label-studio/sync
 * Sync verification tasks to Label Studio
 */
export async function POST(request: NextRequest) {
  try {
    const body: SyncRequest = await request.json();
    const { verificationIds, overwrite = false } = body;

    // Get Label Studio client
    let labelStudioClient;
    try {
      labelStudioClient = getLabelStudioClient();
      const connected = await labelStudioClient.testConnection();
      if (!connected) {
        return NextResponse.json(
          { error: 'Cannot connect to Label Studio. Check LABEL_STUDIO_API_KEY and LABEL_STUDIO_URL.' },
          { status: 503 }
        );
      }
    } catch (error: any) {
      return NextResponse.json(
        { error: `Label Studio configuration error: ${error.message}` },
        { status: 500 }
      );
    }

    // Read verification files
    const files = await fs.readdir(FORMS_DIR);
    const verificationFiles = files.filter(f =>
      f.startsWith('verification_') &&
      f.endsWith('.json') &&
      !f.includes('_qa_report') &&
      !f.includes('_metadata')
    );

    // Filter by requested IDs if provided
    const filesToSync = verificationIds
      ? verificationFiles.filter(f => {
          const id = f.replace('verification_', '').replace('.json', '');
          return verificationIds.includes(id);
        })
      : verificationFiles;

    if (filesToSync.length === 0) {
      return NextResponse.json(
        { error: 'No verification files found to sync' },
        { status: 404 }
      );
    }

    // Create Label Studio tasks
    const tasks: LabelStudioTask[] = [];
    const errors: Array<{ file: string; error: string }> = [];

    for (const file of filesToSync) {
      try {
        const verificationId = file.replace('verification_', '').replace('.json', '');

        // Read verification data
        const verificationPath = path.join(FORMS_DIR, file);
        const verificationData = JSON.parse(await fs.readFile(verificationPath, 'utf-8'));

        // Read QA report
        const qaReportPath = path.join(FORMS_DIR, `verification_${verificationId}_qa_report.json`);
        let qaReport: any = null;
        try {
          qaReport = JSON.parse(await fs.readFile(qaReportPath, 'utf-8'));
        } catch {
          console.warn(`QA report not found for ${verificationId}`);
        }

        // Read metadata
        const metadataPath = path.join(FORMS_DIR, `verification_${verificationId}_metadata.json`);
        let metadata: any = null;
        try {
          metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
        } catch {
          console.warn(`Metadata not found for ${verificationId}`);
        }

        // Read flattened JSON paths (if available)
        const patientApiDataFolder = path.join(
          process.cwd(),
          '../../agents/patient_api_data',
          verificationData.patient_full_name?.replace(/\s+/g, '_') || 'unknown'
        );

        let flattenedPaths: Array<{ path: string; value: any; type: string }> = [];
        try {
          const flattenedFiles = await fs.readdir(patientApiDataFolder);
          const flattenedFile = flattenedFiles.find(f => f.includes('_flattened.json'));
          if (flattenedFile) {
            const flattenedData = JSON.parse(
              await fs.readFile(path.join(patientApiDataFolder, flattenedFile), 'utf-8')
            );
            flattenedPaths = flattenedData.paths || [];
          }
        } catch {
          console.warn(`Flattened JSON not found for ${verificationId}`);
        }

        // Create tasks for each field with metadata
        const fieldTasks = createTasksForVerification(
          verificationId,
          verificationData,
          qaReport,
          metadata,
          flattenedPaths
        );

        tasks.push(...fieldTasks);
      } catch (error: any) {
        console.error(`Error processing ${file}:`, error);
        errors.push({ file, error: error.message });
      }
    }

    if (tasks.length === 0) {
      return NextResponse.json(
        {
          error: 'No tasks created',
          details: errors.length > 0 ? errors : 'No extractable fields found'
        },
        { status: 400 }
      );
    }

    // Import tasks into Label Studio
    try {
      const result = await labelStudioClient.importTasks(LABEL_STUDIO_PROJECT_ID, tasks);
      return NextResponse.json({
        success: true,
        tasksCreated: tasks.length,
        labelStudioResult: result,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error: any) {
      return NextResponse.json(
        {
          error: 'Failed to import tasks to Label Studio',
          details: error.message,
          tasksAttempted: tasks.length,
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Sync error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * Create Label Studio tasks for each field in a verification
 */
function createTasksForVerification(
  verificationId: string,
  verificationData: any,
  qaReport: any,
  metadata: any,
  flattenedPaths: Array<{ path: string; value: any; type: string }>
): LabelStudioTask[] {
  const tasks: LabelStudioTask[] = [];

  // Fields to create tasks for
  const fieldsToAnnotate = [
    'patient_full_name',
    'patient_dob',
    'subscriber_name',
    'subscriber_id',
    'group_number',
    'insurance_company',
    'plan_name',
    'preventive_coverage',
    'basic_coverage',
    'major_coverage',
    'yearly_maximum',
    'yearly_deductible',
    'effective_date',
    'termination_date',
  ];

  for (const field of fieldsToAnnotate) {
    const fieldValue = verificationData[field];
    if (!fieldValue) continue; // Skip empty fields

    // Find metadata for this field
    const fieldMetadata = metadata
      ? Object.values(metadata as any).find((m: any) =>
          m.fields && m.fields[field]
        )
      : null;

    const fieldInfo = fieldMetadata?.fields?.[field];

    // Format flattened paths for display (limit to first 100 for UI performance)
    const formattedPaths = flattenedPaths.slice(0, 100).map(p =>
      `${p.path}: ${JSON.stringify(p.value)} (${p.type})`
    ).join('\n');

    // Create task
    const task: LabelStudioTask = {
      id: `${verificationId}_${field}`,
      data: {
        flattenedPaths: formattedPaths,
        field,
        mapper: fieldMetadata?.mapperName || 'unknown',
        aiExtractedValue: String(fieldValue),
        aiSourcePath: fieldInfo?.sourcePath || 'unknown',
        aiReasoning: fieldInfo?.reasoning || 'No reasoning provided',
        aiConfidence: fieldMetadata?.confidence,
        patientName: verificationData.patient_full_name || 'Unknown',
        insuranceProvider: verificationData.insurance_company || 'Unknown',
        portalType: verificationData._metadata?.portalType || 'unknown',
        officeKey: verificationData._metadata?.officeKey || 'unknown',
        qaIssues: qaReport?.issues
          ?.filter((issue: any) => issue.field === field)
          .map((issue: any) => `${issue.severity}: ${issue.issue}`)
          .join('; '),
        qaScore: qaReport?.overallScore,
        toolCallsCount: fieldMetadata?.toolCallsCount,
        extractionTimeMs: fieldMetadata?.extractionTimeMs,
      },
    };

    tasks.push(task);
  }

  return tasks;
}

/**
 * GET /api/label-studio/sync
 * Get sync status and statistics
 */
export async function GET(request: NextRequest) {
  try {
    const labelStudioClient = getLabelStudioClient();

    // Get project info
    const project = await labelStudioClient.getProject(LABEL_STUDIO_PROJECT_ID);

    // Get task statistics
    const { tasks, total } = await labelStudioClient.listTasks(LABEL_STUDIO_PROJECT_ID, {
      page_size: 1, // Just get count
    });

    // Count local verification files
    const files = await fs.readdir(FORMS_DIR);
    const localVerificationCount = files.filter(f =>
      f.startsWith('verification_') &&
      f.endsWith('.json') &&
      !f.includes('_qa_report') &&
      !f.includes('_metadata')
    ).length;

    return NextResponse.json({
      project: {
        id: project.id,
        title: project.title,
        created_at: project.created_at,
      },
      statistics: {
        localVerifications: localVerificationCount,
        labelStudioTasks: total,
        syncedPercentage: localVerificationCount > 0
          ? Math.round((total / localVerificationCount) * 100)
          : 0,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
