/**
 * Content-Aware Domain Classification System
 * 
 * This module provides intelligent domain detection based on file content
 * rather than relying solely on filename conventions.
 * 
 * Supports multi-portal insurance data aggregation without portal-specific code.
 */

export interface DomainScore {
  domain: 'patient' | 'subscriber' | 'coverage' | 'plan' | 'procedures' | 'limits';
  confidence: number;
  matchedPhrases: string[];
}

export interface PortalConfig {
  portalId: string;
  patientTerms?: string[];
  subscriberTerms?: string[];
  planTerms?: string[];
  coverageTerms?: string[];
  procedureTerms?: string[];
  limitTerms?: string[];
}

/**
 * Universal domain phrase dictionary
 * These are semantic anchors that indicate which domain data belongs to
 */
const DOMAIN_PHRASES = {
  patient: [
    'patient', 'member', 'insured', 'enrollee',
    'first name', 'last name', 'firstname', 'lastname',
    'date of birth', 'dob', 'birth date', 'birthdate',
    'patient id', 'member id', 'reference id',
    'patient name', 'member name', 'referenceid'
  ],
  
  subscriber: [
    'subscriber', 'policy holder', 'policyholder', 
    'contract holder', 'contractholder',
    'subscriber name', 'subscriber first', 'subscriber last',
    'subscriber id', 'subscriber dob',
    'primary insured', 'guarantor',
    'subscriberfirstname', 'subscriberlastname', 'subscribername'
  ],
  
  plan: [
    'plan name', 'plan type', 'plan period',
    'group number', 'group name', 'group id',
    'effective date', 'termination date',
    'enrollment date', 'eligibility date',
    'plan period begin', 'plan period end',
    'ppo', 'hmo', 'dental plan', 'planname', 'groupnumber'
  ],
  
  coverage: [
    'coverage', 'benefit', 'coinsurance', 'copay',
    'preventive', 'basic', 'major', 'diagnostic',
    'in network', 'out of network', 'out network',
    'coverage percent', 'benefit percent',
    'waiting period', 'coverage level', 'benefitcoverage'
  ],
  
  procedures: [
    'procedure', 'treatment', 'service',
    'procedure code', 'dental code', 'cdt code',
    'treatment history', 'claim history',
    'procedure benefit', 'procedure limitation',
    'frequency', 'tooth', 'surface', 'procedurecode'
  ],
  
  limits: [
    'maximum', 'deductible', 'limit', 'accumulator',
    'yearly maximum', 'annual maximum',
    'yearly deductible', 'annual deductible',
    'remaining', 'used', 'available', 'balance',
    'individual maximum', 'family maximum',
    'maximumsdeductibles', 'yearlymaximum'
  ]
} as const;

/**
 * Portal-specific terminology overrides
 * Add new portals here as you onboard them
 */
const PORTAL_CONFIGS: Record<string, PortalConfig> = {
  'BCBS': {
    portalId: 'BCBS',
    subscriberTerms: ['subscriber', 'subscriberfirstname', 'subscriberlastname'],
    patientTerms: ['patient', 'member', 'firstname', 'lastname']
  },
  'Blue Cross Blue Shield': {
    portalId: 'Blue Cross Blue Shield',
    subscriberTerms: ['subscriber', 'subscriberfirstname', 'subscriberlastname'],
    patientTerms: ['patient', 'member', 'firstname', 'lastname']
  },
  'MetLife': {
    portalId: 'MetLife',
    subscriberTerms: ['policy holder', 'primary insured'],
    patientTerms: ['member', 'insured', 'covered person']
  },
  'Cigna': {
    portalId: 'Cigna',
    subscriberTerms: ['subscriber', 'primary member'],
    patientTerms: ['patient', 'member', 'dependent']
  },
  'Aetna': {
    portalId: 'Aetna',
    subscriberTerms: ['subscriber', 'contract holder'],
    patientTerms: ['member', 'patient']
  }
};

/**
 * Detect provider from data content
 */
export function detectProvider(files: Array<{ fileName: string; data: any }>): string {
  for (const file of files) {
    const dataStr = JSON.stringify(file.data).toLowerCase();

    if (dataStr.includes('bcbs') || dataStr.includes('blue cross') || dataStr.includes('bluecross')) {
      return 'Blue Cross Blue Shield';
    }
    if (dataStr.includes('aetna')) {
      return 'Aetna';
    }
    if (dataStr.includes('cigna')) {
      return 'Cigna';
    }
    if (dataStr.includes('metlife')) {
      return 'MetLife';
    }
  }
  
  return 'Unknown';
}

/**
 * Content-based domain detection
 * Analyzes file content to determine which domains it contains
 */
export function detectDomainsByContent(
  fileContent: any,
  fileName?: string,
  provider?: string
): DomainScore[] {
  const results: DomainScore[] = [];
  
  const contentText = typeof fileContent === 'string' 
    ? fileContent 
    : JSON.stringify(fileContent);
  const lowerContent = contentText.toLowerCase();
  
  const portalConfig = provider ? PORTAL_CONFIGS[provider] : undefined;
  
  for (const [domain, basePhrases] of Object.entries(DOMAIN_PHRASES)) {
    const domainKey = domain as keyof typeof DOMAIN_PHRASES;
    
    let phrases: string[] = [...basePhrases];
    if (portalConfig) {
      const overrideKey = `${domainKey}Terms` as keyof PortalConfig;
      const overrides = portalConfig[overrideKey];
      if (overrides && Array.isArray(overrides)) {
        phrases = [...new Set<string>([...phrases, ...overrides])];
      }
    }
    
    const matchedPhrases: string[] = [];
    let matchCount = 0;
    
    for (const phrase of phrases) {
      if (lowerContent.includes(phrase)) {
        matchedPhrases.push(phrase);
        matchCount++;
      }
    }
    
    if (matchCount > 0) {
      const confidence = Math.min(matchCount / phrases.length * 2, 1.0);
      
      results.push({
        domain: domainKey as DomainScore['domain'],
        confidence,
        matchedPhrases: matchedPhrases.slice(0, 5)
      });
    }
  }
  
  if (fileName) {
    const lowerFileName = fileName.toLowerCase();
    
    if (lowerFileName.includes('plan') || lowerFileName.includes('summary')) {
      addOrBoostDomain(results, 'plan', 0.3, ['filename:plan/summary']);
      addOrBoostDomain(results, 'subscriber', 0.2, ['filename:plan/summary']);
      addOrBoostDomain(results, 'patient', 0.2, ['filename:plan/summary']);
    }
    
    if (lowerFileName.includes('benefit')) {
      addOrBoostDomain(results, 'coverage', 0.3, ['filename:benefit']);
      addOrBoostDomain(results, 'procedures', 0.2, ['filename:benefit']);
    }
    
    if (lowerFileName.includes('member') || lowerFileName.includes('patient')) {
      addOrBoostDomain(results, 'patient', 0.3, ['filename:member/patient']);
      addOrBoostDomain(results, 'subscriber', 0.2, ['filename:member/patient']);
    }
    
    if (lowerFileName.includes('accumulator') || lowerFileName.includes('maximum')) {
      addOrBoostDomain(results, 'limits', 0.3, ['filename:accumulator/maximum']);
    }
    
    if (lowerFileName.includes('procedure') || lowerFileName.includes('history')) {
      addOrBoostDomain(results, 'procedures', 0.3, ['filename:procedure/history']);
    }
  }
  
  results.sort((a, b) => b.confidence - a.confidence);
  
  return results;
}

function addOrBoostDomain(
  results: DomainScore[], 
  domain: DomainScore['domain'], 
  boost: number,
  phrases: string[]
) {
  const existing = results.find(r => r.domain === domain);
  if (existing) {
    existing.confidence = Math.min(existing.confidence + boost, 1.0);
    existing.matchedPhrases.push(...phrases);
  } else {
    results.push({
      domain,
      confidence: boost,
      matchedPhrases: phrases
    });
  }
}

/**
 * Get domains above confidence threshold
 */
export function getConfidentDomains(
  scores: DomainScore[], 
  threshold: number = 0.3
): string[] {
  return scores
    .filter(s => s.confidence >= threshold)
    .map(s => s.domain);
}

/**
 * Enhanced file domain detection using content analysis
 */
export function detectFileDomainEnhanced(
  fileName: string, 
  fileData: any,
  provider?: string
): { domains: string[]; scores: DomainScore[] } {
  const scores = detectDomainsByContent(fileData, fileName, provider);
  const domains = getConfidentDomains(scores, 0.3);
  
  if (domains.length === 0) {
    const lowerFileName = fileName.toLowerCase();
    if (lowerFileName.includes('plan') || lowerFileName.includes('summary')) {
      domains.push('plan', 'subscriber', 'patient');
    } else if (lowerFileName.includes('benefit')) {
      domains.push('coverage', 'procedures');
    } else if (lowerFileName.includes('member') || lowerFileName.includes('associated')) {
      domains.push('patient', 'subscriber');
    } else {
      domains.push('plan');
    }
  }
  
  return { domains, scores };
}

/**
 * Validate aggregated data quality
 */
export function validateAggregatedData(aggregation: any): {
  isValid: boolean;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];
  
  const hasPatientName = Object.keys(aggregation.patient || {}).some(k => 
    k.includes('firstName') || k.includes('lastName') || k.includes('name')
  );
  const hasSubscriberInfo = Object.keys(aggregation.subscriber || {}).some(k =>
    k.includes('subscriberId') || k.includes('subscriberName') || k.includes('subscriberFirst')
  );
  const hasPlanInfo = Object.keys(aggregation.plan || {}).some(k =>
    k.includes('groupNumber') || k.includes('planName')
  );
  
  if (!hasPatientName) {
    errors.push('Missing patient name fields - aggregation may have failed');
  }
  
  if (!hasSubscriberInfo) {
    warnings.push('Missing subscriber info - may need manual verification');
  }
  
  if (!hasPlanInfo) {
    warnings.push('Missing plan info - coverage analysis may be incomplete');
  }
  
  const patientFieldCount = Object.keys(aggregation.patient || {}).length;
  const subscriberFieldCount = Object.keys(aggregation.subscriber || {}).length;
  const planFieldCount = Object.keys(aggregation.plan || {}).length;
  
  console.log(`[VALIDATION] Patient fields: ${patientFieldCount}`);
  console.log(`[VALIDATION] Subscriber fields: ${subscriberFieldCount}`);
  console.log(`[VALIDATION] Plan fields: ${planFieldCount}`);
  
  return {
    isValid: errors.length === 0,
    warnings,
    errors
  };
}
