/**
 * API Route: /api/label-studio/tasks/[verificationId]
 *
 * Prepares and retrieves Label Studio tasks for a specific verification
 * Returns task data formatted for Label Studio embedding
 */

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';

const FORMS_DIR = path.join(process.cwd(), '../../agents/forms');

/**
 * GET /api/label-studio/tasks/[verificationId]
 * Get task data for annotation
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { verificationId: string } }
) {
  try {
    const { verificationId } = params;

    // Read verification data
    const verificationPath = path.join(FORMS_DIR, `verification_${verificationId}.json`);
    let verificationData: any;

    try {
      verificationData = JSON.parse(await fs.readFile(verificationPath, 'utf-8'));
    } catch (error) {
      return NextResponse.json(
        { error: 'Verification not found', verificationId },
        { status: 404 }
      );
    }

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

    // Read flattened JSON paths
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

    // Get all annotatable fields with their metadata
    const fields = getAnnotatableFields(verificationData, metadata);

    // Return task data
    return NextResponse.json({
      verificationId,
      verificationData,
      qaReport,
      metadata,
      flattenedPaths: flattenedPaths.slice(0, 100), // Limit for UI performance
      fields,
      context: {
        patientName: verificationData.patient_full_name || 'Unknown',
        insuranceProvider: verificationData.insurance_company || 'Unknown',
        portalType: verificationData._metadata?.portalType || 'unknown',
        officeKey: verificationData._metadata?.officeKey || 'unknown',
        verificationDate: verificationData._metadata?.verificationDate || new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error fetching task data:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * Get all fields that can be annotated with their metadata
 */
function getAnnotatableFields(verificationData: any, metadata: any) {
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

  return fieldsToAnnotate
    .filter(field => verificationData[field]) // Only include non-empty fields
    .map(field => {
      // Find metadata for this field
      const fieldMetadata = metadata
        ? Object.values(metadata as any).find((m: any) =>
            m.fields && m.fields[field]
          )
        : null;

      const fieldInfo = fieldMetadata?.fields?.[field];

      return {
        field,
        value: verificationData[field],
        mapper: fieldMetadata?.mapperName || 'unknown',
        sourcePath: fieldInfo?.sourcePath || 'unknown',
        reasoning: fieldInfo?.reasoning || 'No reasoning provided',
        confidence: fieldMetadata?.confidence,
      };
    });
}
