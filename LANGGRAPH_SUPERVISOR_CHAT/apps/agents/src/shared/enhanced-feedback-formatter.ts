/**
 * Enhanced Feedback Formatter
 *
 * Formats enhanced annotation feedback for inclusion in mapper system prompts
 * This helps LLMs learn from past mistakes including path errors and search strategies
 */

import type { EnhancedFeedbackResponse } from './enhanced-annotation-types.js';

/**
 * Format enhanced feedback for mapper system prompts
 */
export function formatEnhancedFeedbackForPrompt(
  feedback: EnhancedFeedbackResponse,
  options: {
    includePathFeedback?: boolean;
    includeSearchStrategies?: boolean;
    includeEdgeCases?: boolean;
    includePortalQuirks?: boolean;
  } = {}
): string {
  const {
    includePathFeedback = true,
    includeSearchStrategies = true,
    includeEdgeCases = true,
    includePortalQuirks = true,
  } = options;

  const sections: string[] = [];

  // Section 1: Path-specific corrections
  if (includePathFeedback && feedback.corrections.length > 0) {
    const pathSection = formatPathCorrections(feedback.corrections);
    if (pathSection) sections.push(pathSection);
  }

  // Section 2: Effective search strategies
  if (includeSearchStrategies && feedback.searchStrategies.length > 0) {
    const searchSection = formatSearchStrategies(feedback.searchStrategies);
    if (searchSection) sections.push(searchSection);
  }

  // Section 3: Edge cases
  if (includeEdgeCases && feedback.edgeCases.length > 0) {
    const edgeSection = formatEdgeCases(feedback.edgeCases);
    if (edgeSection) sections.push(edgeSection);
  }

  // Section 4: Portal quirks
  if (includePortalQuirks && feedback.portalQuirks.length > 0) {
    const quirkSection = formatPortalQuirks(feedback.portalQuirks);
    if (quirkSection) sections.push(quirkSection);
  }

  if (sections.length === 0) {
    return '';
  }

  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📚 ENHANCED LEARNING FROM PAST ANNOTATIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${sections.join('\n\n')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}

/**
 * Format path corrections with JSON path information
 */
function formatPathCorrections(corrections: any[]): string {
  const correctPaths = corrections.filter(c => c.path_quality === 'correct');
  const incorrectPaths = corrections.filter(c => c.path_quality === 'incorrect');

  const lines: string[] = ['🎯 JSON PATH CORRECTIONS:'];

  // Show correct paths first (these are good examples)
  if (correctPaths.length > 0) {
    lines.push('\n✅ CORRECT PATH EXAMPLES (use these patterns):');
    correctPaths.slice(0, 3).forEach((c, i) => {
      lines.push(
        `   ${i + 1}. Field: ${c.field}`,
        `      Path: ${c.correct_path || c.source_path}`,
        `      Value: "${c.human_value}"`,
        c.path_reasoning ? `      Why: ${c.path_reasoning}` : ''
      );
    });
  }

  // Show incorrect paths (what to avoid)
  if (incorrectPaths.length > 0) {
    lines.push('\n❌ COMMON PATH MISTAKES (avoid these):');
    incorrectPaths.slice(0, 3).forEach((c, i) => {
      lines.push(
        `   ${i + 1}. Field: ${c.field}`,
        `      Wrong Path: ${c.source_path} ❌`,
        `      Correct Path: ${c.correct_path} ✅`,
        c.path_reasoning ? `      Reason: ${c.path_reasoning}` : ''
      );
    });
  }

  return lines.filter(Boolean).join('\n');
}

/**
 * Format effective search strategies
 */
function formatSearchStrategies(strategies: any[]): string {
  const lines: string[] = ['🔍 EFFECTIVE SEARCH STRATEGIES:'];

  const effectiveStrategies = strategies.filter(s => s.effectiveness === 'effective');

  if (effectiveStrategies.length > 0) {
    lines.push('\n✅ These search terms work well:');

    // Group by field
    const byField = new Map<string, string[][]>();
    effectiveStrategies.forEach(s => {
      if (!byField.has(s.field)) {
        byField.set(s.field, []);
      }
      byField.get(s.field)!.push(s.searchTerms);
    });

    byField.forEach((termsList, field) => {
      const uniqueTerms = [...new Set(termsList.flat())];
      lines.push(`   • ${field}: ${uniqueTerms.slice(0, 5).join(', ')}`);
    });
  }

  const suboptimalStrategies = strategies.filter(s => s.effectiveness === 'suboptimal');
  if (suboptimalStrategies.length > 0) {
    lines.push('\n⚠️  Better alternatives for these fields:');
    suboptimalStrategies.slice(0, 3).forEach(s => {
      lines.push(`   • ${s.field}: Try ${s.searchTerms.join(', ')} instead`);
    });
  }

  return lines.join('\n');
}

/**
 * Format edge cases
 */
function formatEdgeCases(edgeCases: any[]): string {
  const lines: string[] = ['⚠️  DOCUMENTED EDGE CASES:'];

  lines.push('\nWatch out for these unusual patterns:\n');

  edgeCases.slice(0, 5).forEach((edge, i) => {
    lines.push(
      `${i + 1}. ${edge.field}:`,
      `   ${edge.edge_case_description}`,
      edge.correct_path ? `   Use path: ${edge.correct_path}` : '',
      ''
    );
  });

  return lines.filter(Boolean).join('\n');
}

/**
 * Format portal quirks
 */
function formatPortalQuirks(quirks: string[]): string {
  const lines: string[] = ['🏥 PORTAL-SPECIFIC QUIRKS:'];

  lines.push('\nThis portal has the following data structure issues:\n');

  const quirkDescriptions: Record<string, string> = {
    unusual_nesting: 'Unusual/deep nesting - data may be nested deeper than expected',
    missing_fields: 'Missing expected fields - some standard fields may not exist',
    version_change: 'API version change - structure differs from other portals',
    inconsistent_format: 'Inconsistent formatting - field formats vary within response',
  };

  quirks.forEach(quirk => {
    const description = quirkDescriptions[quirk] || quirk;
    lines.push(`   • ${description}`);
  });

  lines.push('\n   💡 Be flexible in your search strategy and validate thoroughly!');

  return lines.join('\n');
}

/**
 * Format simple path feedback (for backwards compatibility)
 * This is a lighter version that just shows path corrections
 */
export function formatSimplePathFeedback(corrections: any[]): string {
  if (corrections.length === 0) return '';

  const lines: string[] = ['\n🎓 LEARN FROM PAST PATH CORRECTIONS:'];

  corrections.slice(0, 5).forEach((c, i) => {
    lines.push(
      `\n${i + 1}. Field: ${c.field}`,
      `   AI used path: ${c.source_path || 'unknown'}`,
      c.correct_path && c.correct_path !== c.source_path
        ? `   Correct path: ${c.correct_path} ✅`
        : `   Path was correct ✅`,
      c.path_reasoning ? `   Why: ${c.path_reasoning}` : ''
    );
  });

  return lines.join('\n');
}

/**
 * Create a concise summary of feedback statistics
 */
export function formatFeedbackSummary(feedback: EnhancedFeedbackResponse): string {
  const lines: string[] = [];

  const totalCorrections = feedback.corrections.length;
  const correctPaths = feedback.corrections.filter(c => c.path_quality === 'correct').length;
  const pathAccuracy = totalCorrections > 0
    ? Math.round((correctPaths / totalCorrections) * 100)
    : 0;

  lines.push(`📊 Feedback Summary:`);
  lines.push(`   • ${totalCorrections} past annotations available`);
  lines.push(`   • ${pathAccuracy}% path accuracy in similar cases`);

  if (feedback.edgeCases.length > 0) {
    lines.push(`   • ${feedback.edgeCases.length} edge cases documented`);
  }

  if (feedback.portalQuirks.length > 0) {
    lines.push(`   • ${feedback.portalQuirks.length} portal quirks identified`);
  }

  return lines.join('\n');
}

/**
 * Format confidence calibration advice
 */
export function formatConfidenceAdvice(corrections: any[]): string {
  const withConfidence = corrections.filter(c =>
    c.ai_confidence !== null &&
    c.ai_confidence !== undefined &&
    c.human_confidence !== null &&
    c.human_confidence !== undefined
  );

  if (withConfidence.length === 0) return '';

  // Calculate average confidence gap
  const avgGap = withConfidence.reduce((sum, c) => sum + (c.confidence_gap || 0), 0) / withConfidence.length;

  if (avgGap > 0.2) {
    return `
⚠️  CONFIDENCE CALIBRATION WARNING:
   Past extractions for this context showed overconfidence (avg gap: ${(avgGap * 100).toFixed(1)}%).
   Be more conservative with confidence scores, especially for ambiguous cases.
`;
  } else if (avgGap < 0.1) {
    return `
✅ CONFIDENCE CALIBRATION NOTE:
   Past extractions for this context showed well-calibrated confidence.
   Continue being accurate with your confidence assessments.
`;
  }

  return '';
}
