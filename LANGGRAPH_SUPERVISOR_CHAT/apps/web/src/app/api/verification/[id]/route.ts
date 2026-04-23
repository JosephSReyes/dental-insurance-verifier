import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const formsDir = path.join(process.cwd(), '../../apps/agents/forms');
    
    const files = await fs.readdir(formsDir);
    
    const verificationFile = files.find(f => {
      if (!f.startsWith('verification_') || !f.endsWith('.json') || f.includes('_qa_report')) {
        return false;
      }
      
      const baseFileName = f.replace('verification_', '').replace('.json', '');
      return baseFileName === id;
    });

    if (!verificationFile) {
      console.error(`Verification not found. Looking for ID: ${id}`);
      console.error(`Available files: ${files.filter(f => f.startsWith('verification_')).join(', ')}`);
      return NextResponse.json({ 
        error: 'Verification not found',
        id,
        availableFiles: files.filter(f => f.startsWith('verification_') && !f.includes('_qa_report')).map(f => f.replace('verification_', '').replace('.json', ''))
      }, { status: 404 });
    }

    const verificationPath = path.join(formsDir, verificationFile);
    const qaReportPath = verificationPath.replace('.json', '_qa_report.json');
    const metadataPath = verificationPath.replace('.json', '_metadata.json');

    const verificationContent = await fs.readFile(verificationPath, 'utf-8');
    const verificationData = JSON.parse(verificationContent);

    const qaReportExists = await fs.access(qaReportPath).then(() => true).catch(() => false);
    let qaReport = null;
    if (qaReportExists) {
      const qaContent = await fs.readFile(qaReportPath, 'utf-8');
      qaReport = JSON.parse(qaContent);
    }

    const metadataExists = await fs.access(metadataPath).then(() => true).catch(() => false);
    let metadata = null;
    if (metadataExists) {
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      metadata = JSON.parse(metadataContent);
    }

    // Load mapper metadata files
    let mapperMetadata: Record<string, any> = {};
    try {
      // Try to find patient_data directory matching this verification
      const patientDataDir = path.join(process.cwd(), '../../apps/agents/patient_data');
      const patientDirs = await fs.readdir(patientDataDir).catch(() => []);

      // Look for directory containing this verification ID or timestamp
      const verificationTimestamp = verificationFile.replace('verification_', '').replace('.json', '').split('_').pop();
      const matchingDir = patientDirs.find(dir => dir.includes(verificationTimestamp || ''));

      if (matchingDir) {
        const matchingDirPath = path.join(patientDataDir, matchingDir);
        const mapperFiles = await fs.readdir(matchingDirPath);

        // Load all *_mapper_metadata.json files
        for (const file of mapperFiles) {
          if (file.endsWith('_mapper_metadata.json')) {
            const mapperName = file.replace('_metadata.json', '');
            const mapperPath = path.join(matchingDirPath, file);
            const mapperContent = await fs.readFile(mapperPath, 'utf-8');
            mapperMetadata[mapperName] = JSON.parse(mapperContent);
          }
        }
      }
    } catch (error) {
      console.warn('Could not load mapper metadata:', error);
    }

    // Check for existing feedback/review
    const feedbackDir = path.join(process.cwd(), '../../apps/agents/feedback');
    const verificationId = verificationData.reference_number || id;
    let existingFeedback = null;
    
    const feedbackSubdirs = ['human_feedback', 'extraction_reviews', 'qa_reviews', 'general_reviews'];
    for (const subdir of feedbackSubdirs) {
      const subdirPath = path.join(feedbackDir, subdir);
      const subdirExists = await fs.access(subdirPath).then(() => true).catch(() => false);
      
      if (subdirExists) {
        const feedbackFiles = await fs.readdir(subdirPath).catch(() => []);
        
        for (const file of feedbackFiles) {
          try {
            const feedbackContent = await fs.readFile(path.join(subdirPath, file), 'utf-8');
            const feedback = JSON.parse(feedbackContent);
            
            if (feedback.verificationId === verificationId || 
                feedback.metadata?.verificationId === verificationId) {
              existingFeedback = feedback;
              break;
            }
          } catch (err) {
            continue;
          }
        }
        
        if (existingFeedback) break;
      }
    }

    return NextResponse.json({
      verificationData,
      qaReport,
      metadata,
      mapperMetadata,
      existingFeedback,
      files: {
        verification: verificationFile,
        qaReport: qaReportExists ? qaReportPath.split('/').pop() : null,
        metadata: metadataExists ? metadataPath.split('/').pop() : null
      }
    });

  } catch (error) {
    console.error('Error loading verification:', error);
    return NextResponse.json({ 
      error: 'Failed to load verification',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
