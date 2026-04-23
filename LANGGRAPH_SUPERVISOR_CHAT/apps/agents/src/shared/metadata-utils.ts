import fs from 'fs/promises';
import path from 'path';

/**
 * Enhanced field metadata with per-field confidence, validation, and search terms
 */
export interface FieldMetadata {
  value: any;
  sourcePath: string;
  reasoning: string;

  // NEW: Per-field confidence (0.0-1.0)
  confidence?: number;

  // NEW: Validation results from validateFieldTool
  validationWarnings?: string[];
  isValid?: boolean;

  // NEW: Search strategy tracking
  searchTermsUsed?: string[];
  alternativePathsFound?: string[];

  // NEW: Tool usage tracking
  toolCallsCount?: number;
  extractionTimeMs?: number;
}

/**
 * Enhanced mapper metadata with per-field tracking
 */
export interface MapperMetadata {
  mapperName: string;
  timestamp: string;

  // Overall mapper confidence (aggregate)
  confidence?: number;

  // Per-field detailed metadata
  fields: Record<string, FieldMetadata>;

  // NEW: Aggregated statistics
  stats?: {
    totalFields: number;
    fieldsExtracted: number;
    fieldsWithWarnings?: number;
    fieldsEmpty?: number;  // Added for new confidence tracking implementation
    avgFieldConfidence?: number;
    avgConfidence?: number;  // Added for new confidence tracking implementation
    totalToolCalls?: number;
    totalExtractionTimeMs?: number;
  };
}

export async function saveExtractionMetadata(
  metadata: MapperMetadata,
  patientFolder: string
): Promise<void> {
  const metadataPath = path.join(
    patientFolder,
    `${metadata.mapperName}_metadata.json`
  );
  
  await fs.writeFile(
    metadataPath,
    JSON.stringify(metadata, null, 2),
    'utf-8'
  );
  
  console.log(`[METADATA] Saved ${metadata.mapperName} metadata to ${metadataPath}`);
}

export async function loadAllMetadata(
  patientFolder: string
): Promise<Record<string, MapperMetadata>> {
  try {
    const files = await fs.readdir(patientFolder);
    const metadataFiles = files.filter(f => f.endsWith('_metadata.json'));
    
    const allMetadata: Record<string, MapperMetadata> = {};
    
    for (const file of metadataFiles) {
      const content = await fs.readFile(
        path.join(patientFolder, file),
        'utf-8'
      );
      const metadata = JSON.parse(content);
      allMetadata[metadata.mapperName] = metadata;
    }
    
    console.log(`[METADATA] Loaded ${Object.keys(allMetadata).length} metadata files from ${patientFolder}`);
    
    return allMetadata;
  } catch (error) {
    console.error(`[METADATA] Error loading metadata from ${patientFolder}:`, error);
    return {};
  }
}

export async function loadMapperMetadata(
  patientFolder: string,
  mapperName: string
): Promise<MapperMetadata | null> {
  try {
    const metadataPath = path.join(
      patientFolder,
      `${mapperName}_metadata.json`
    );

    const content = await fs.readFile(metadataPath, 'utf-8');
    const metadata = JSON.parse(content);

    console.log(`[METADATA] Loaded ${mapperName} metadata from ${metadataPath}`);

    return metadata;
  } catch (error) {
    console.warn(`[METADATA] Could not load ${mapperName} metadata from ${patientFolder}:`, error);
    return null;
  }
}

/**
 * Compute aggregate statistics from field metadata
 */
export function computeMetadataStats(fields: Record<string, FieldMetadata>): MapperMetadata['stats'] {
  const fieldValues = Object.values(fields);
  const extractedFields = fieldValues.filter(f => f.value !== null && f.value !== undefined);
  const fieldsWithWarnings = fieldValues.filter(f => f.validationWarnings && f.validationWarnings.length > 0);

  const confidences = fieldValues
    .map(f => f.confidence)
    .filter((c): c is number => typeof c === 'number');

  const avgConfidence = confidences.length > 0
    ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
    : 0;

  const totalToolCalls = fieldValues
    .map(f => f.toolCallsCount || 0)
    .reduce((sum, count) => sum + count, 0);

  const totalTimeMs = fieldValues
    .map(f => f.extractionTimeMs || 0)
    .reduce((sum, time) => sum + time, 0);

  return {
    totalFields: fieldValues.length,
    fieldsExtracted: extractedFields.length,
    fieldsWithWarnings: fieldsWithWarnings.length,
    avgFieldConfidence: avgConfidence,
    totalToolCalls,
    totalExtractionTimeMs: totalTimeMs
  };
}

/**
 * Enhanced save that auto-computes statistics
 */
export async function saveEnhancedMetadata(
  mapperName: string,
  fields: Record<string, FieldMetadata>,
  patientFolder: string,
  overallConfidence?: number
): Promise<void> {
  const stats = computeMetadataStats(fields);

  const metadata: MapperMetadata = {
    mapperName,
    timestamp: new Date().toISOString(),
    confidence: overallConfidence ?? stats.avgFieldConfidence,
    fields,
    stats
  };

  await saveExtractionMetadata(metadata, patientFolder);
}
