import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

interface QueueItem {
  id: string;
  patientName: string;
  insuranceProvider: string;
  verificationDate: string;
  qaScore: number | null;
  qaPassed: boolean | null;
  criticalIssues: number;
  warnings: number;
  officeKey: string;
  portalType: string;
  verificationFilePath: string;
  qaReportFilePath: string | null;
  status: 'pending_review' | 'reviewed';
  reviewedBy?: string;
  reviewedAt?: string;
  priorityScore?: number;
}

export async function GET(request: NextRequest) {
  try {
    const formsDir = path.join(process.cwd(), '../../apps/agents/forms');
    const feedbackDir = path.join(process.cwd(), '../../apps/agents/feedback');
    
    const formsExist = await fs.access(formsDir).then(() => true).catch(() => false);
    if (!formsExist) {
      return NextResponse.json({ 
        error: 'Forms directory not found',
        path: formsDir 
      }, { status: 404 });
    }

    const files = await fs.readdir(formsDir);
    const verificationFiles = files.filter(f => f.startsWith('verification_') && f.endsWith('.json') && !f.includes('_qa_report'));

    const queueItems: QueueItem[] = [];

    for (const verificationFile of verificationFiles) {
      const verificationPath = path.join(formsDir, verificationFile);
      const qaReportFile = verificationFile.replace('.json', '_qa_report.json');
      const qaReportPath = path.join(formsDir, qaReportFile);

      const qaReportExists = await fs.access(qaReportPath).then(() => true).catch(() => false);

      const verificationContent = await fs.readFile(verificationPath, 'utf-8');
      const verificationData = JSON.parse(verificationContent);

      let qaData: any = null;
      if (qaReportExists) {
        const qaContent = await fs.readFile(qaReportPath, 'utf-8');
        qaData = JSON.parse(qaContent);
      }

      const baseFileName = verificationFile.replace('verification_', '').replace('.json', '');
      const verificationId = verificationData.reference_number || baseFileName;

      // Check all feedback subdirectories
      let hasBeenReviewed = false;
      let reviewData: any = null;
      
      const feedbackSubdirs = ['human_feedback', 'extraction_reviews', 'qa_reviews', 'general_reviews'];
      for (const subdir of feedbackSubdirs) {
        const subdirPath = path.join(feedbackDir, subdir);
        const subdirExists = await fs.access(subdirPath).then(() => true).catch(() => false);
        
        if (subdirExists) {
          const feedbackFiles = await fs.readdir(subdirPath).catch(() => []);
          
          // Try to find feedback file by verificationId first
          let feedbackFile = null;
          for (const file of feedbackFiles) {
            try {
              const feedbackContent = await fs.readFile(path.join(subdirPath, file), 'utf-8');
              const feedback = JSON.parse(feedbackContent);
              
              // Match by verificationId (most reliable)
              if (feedback.verificationId === verificationId || 
                  feedback.metadata?.verificationId === verificationId) {
                feedbackFile = file;
                reviewData = feedback;
                hasBeenReviewed = true;
                break;
              }
            } catch (err) {
              // Skip invalid JSON files
              continue;
            }
          }
          
          if (hasBeenReviewed) break;
        }
      }

      // Calculate priority score (lower = higher priority)
      let priorityScore = 100; // Default

      // Factor 1: QA score (lower QA score = higher priority)
      if (qaData?.overallScore !== null && qaData?.overallScore !== undefined) {
        priorityScore = qaData.overallScore;
      }

      // Factor 2: Critical issues (more issues = higher priority)
      const criticalCount = qaData?.summary?.criticalIssues ?? 0;
      if (criticalCount > 0) {
        priorityScore -= 20 * criticalCount; // Boost priority significantly for critical issues
      }

      // Factor 3: Warnings (more warnings = slightly higher priority)
      const warningCount = qaData?.summary?.warnings ?? 0;
      if (warningCount > 0) {
        priorityScore -= 5 * warningCount;
      }

      // Ensure priority score doesn't go negative
      priorityScore = Math.max(0, priorityScore);

      queueItems.push({
        id: baseFileName,
        patientName: verificationData.patient_full_name || 'Unknown',
        insuranceProvider: verificationData.insurance_company || 'Unknown',
        verificationDate: verificationData.verification_date || '',
        qaScore: qaData?.overallScore ?? null,
        qaPassed: qaData?.passed ?? null,
        criticalIssues: qaData?.summary?.criticalIssues ?? 0,
        warnings: qaData?.summary?.warnings ?? 0,
        officeKey: verificationData.office_key || 'Unknown',
        portalType: verificationData.portal_type || 'unknown',
        verificationFilePath: verificationPath,
        qaReportFilePath: qaReportExists ? qaReportPath : null,
        status: hasBeenReviewed ? 'reviewed' : 'pending_review',
        reviewedBy: reviewData?.reviewerInfo?.reviewerId || reviewData?.reviewerId,
        reviewedAt: reviewData?.reviewerInfo?.reviewedAt || reviewData?.reviewedAt,
        priorityScore
      });
    }

    queueItems.sort((a, b) => {
      // Status priority first (pending > reviewed)
      if (a.status === 'pending_review' && b.status === 'reviewed') return -1;
      if (a.status === 'reviewed' && b.status === 'pending_review') return 1;

      // Then by priority score (lower score = higher priority)
      const aPriority = a.priorityScore ?? 100;
      const bPriority = b.priorityScore ?? 100;
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }

      // Finally by date (newer first)
      return new Date(b.verificationDate).getTime() - new Date(a.verificationDate).getTime();
    });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    
    // Calculate counts from all items
    const totalPending = queueItems.filter(item => item.status === 'pending_review').length;
    const totalReviewed = queueItems.filter(item => item.status === 'reviewed').length;
    const totalAll = queueItems.length;
    
    // Filter items based on status parameter
    let filteredItems = queueItems;
    if (status === 'pending') {
      filteredItems = queueItems.filter(item => item.status === 'pending_review');
    } else if (status === 'reviewed') {
      filteredItems = queueItems.filter(item => item.status === 'reviewed');
    }

    return NextResponse.json({
      total: totalAll,
      pending: totalPending,
      reviewed: totalReviewed,
      items: filteredItems
    });

  } catch (error) {
    console.error('Error loading queue:', error);
    return NextResponse.json({ 
      error: 'Failed to load verification queue',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
