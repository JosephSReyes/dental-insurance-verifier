import { detectFileDomainEnhanced } from './domain-classifier.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface DomainAggregation {
  patient: Record<string, any>;
  subscriber: Record<string, any>;
  coverage: Record<string, any>;
  plan: Record<string, any>;
  procedures: Record<string, any>;
  limits: Record<string, any>;
  metadata: {
    sourceFiles: string[];
    aggregatedAt: string;
    provider: string;
    domainScores?: Record<string, any>;
  };
}

interface FieldMapping {
  domain: 'patient' | 'subscriber' | 'coverage' | 'plan' | 'procedures' | 'limits';
  patterns: string[];
  description?: string;
}

interface FieldMappingConfig {
  version: string;
  description?: string;
  mappings: FieldMapping[];
  normalizationMap?: Record<string, string>;
}

let FIELD_MAPPINGS: FieldMapping[] = [];
let NORMALIZATION_MAP: Record<string, string> = {};

function loadFieldMappings(): void {
  if (FIELD_MAPPINGS.length > 0) return;
  
  try {
    const configPath = join(__dirname, '../../config/field-mappings.json');
    const configContent = readFileSync(configPath, 'utf-8');
    const config: FieldMappingConfig = JSON.parse(configContent);
    
    FIELD_MAPPINGS = config.mappings;
    NORMALIZATION_MAP = config.normalizationMap || {};
    
    console.log(`[AGGREGATOR] Loaded field mappings v${config.version} from config file`);
    console.log(`[AGGREGATOR] Domains configured: ${FIELD_MAPPINGS.map(m => m.domain).join(', ')}`);
  } catch (error) {
    console.warn('[AGGREGATOR] Failed to load field-mappings.json, using fallback defaults:', error);
    FIELD_MAPPINGS = [
      {
        domain: 'patient',
        patterns: [
          'patient', 'member', 'insured', 'enrollee', 
          'firstname', 'lastname', 'birthdate', 'dob', 'dateofbirth',
          'personid', 'memberid', 'membername'
        ]
      },
      {
        domain: 'subscriber',
        patterns: [
          'subscriber', 'policyholder', 'contractholder',
          'subscribername', 'subscriberfirstname', 'subscriberlastname',
          'subscriberdob', 'subscriberdateofbirth', 'contractid', 'groupnumber'
        ]
      },
      {
        domain: 'coverage',
        patterns: [
          'coverage', 'benefit', 'coinsurance', 'copay',
          'preventive', 'basic', 'major', 'diagnostic',
          'network', 'ppo', 'hmo', 'premier',
          'benefitcoverage', 'benefitpackage'
        ]
      },
      {
        domain: 'plan',
        patterns: [
          'plan', 'product', 'division', 'group',
          'effectivedate', 'terminationdate', 'planname',
          'grouptype', 'plantype', 'packageid'
        ]
      },
      {
        domain: 'procedures',
        patterns: [
          'procedure', 'treatment', 'code', 'procedurecode',
          'treatmentcode', 'limitation', 'frequency',
          'procedureclass', 'classification', 'history',
          'servicedate', 'description', 'tooth', 'surface'
        ]
      },
      {
        domain: 'limits',
        patterns: [
          'maximum', 'deductible', 'accumulator', 'limit',
          'maximumsdeductibles', 'yearlymaximum', 'yearlydeductible',
          'used', 'remaining', 'available', 'balance'
        ]
      }
    ];
    NORMALIZATION_MAP = {
      'firstname': 'firstName',
      'first_name': 'firstName',
      'lastname': 'lastName',
      'last_name': 'lastName',
      'birthdate': 'dateOfBirth',
      'birth_date': 'dateOfBirth',
      'dateofbirth': 'dateOfBirth',
      'memberid': 'subscriberId',
      'subscriber_id': 'subscriberId',
      'groupnumber': 'groupNumber',
      'group_number': 'groupNumber',
      'subscribername': 'subscriberName',
      'subscriber_name': 'subscriberName',
      'effectivedate': 'effectiveDate',
      'effective_date': 'effectiveDate',
      'terminationdate': 'terminationDate',
      'termination_date': 'terminationDate',
      'planname': 'planName',
      'plan_name': 'planName',
      'procedurecode': 'procedureCode',
      'procedure_code': 'procedureCode',
      'treatmentcode': 'treatmentCode',
      'treatment_code': 'treatmentCode'
    };
  }
}

export function detectFileDomain(fileName: string, data: any): string[] {
  loadFieldMappings();
  
  const lowerFileName = fileName.toLowerCase();
  const domains = new Set<string>();

  if (lowerFileName.includes('patient') || lowerFileName.includes('roster') || lowerFileName.includes('member')) {
    domains.add('patient');
    domains.add('subscriber');
  }
  
  if (lowerFileName.includes('benefit') || lowerFileName.includes('package') || lowerFileName.includes('coverage')) {
    domains.add('coverage');
    domains.add('procedures');
  }
  
  if (lowerFileName.includes('maximum') || lowerFileName.includes('deductible') || lowerFileName.includes('accumulator')) {
    domains.add('limits');
  }
  
  if (lowerFileName.includes('plan') || lowerFileName.includes('summary')) {
    domains.add('plan');
  }
  
  if (lowerFileName.includes('treatment') || lowerFileName.includes('history')) {
    domains.add('procedures');
  }
  
  if (lowerFileName.includes('claim') || lowerFileName.includes('address') || lowerFileName.includes('payor')) {
    domains.add('plan');
  }

  if (domains.size === 0) {
    const dataKeys = extractTopLevelKeys(data);
    for (const key of dataKeys) {
      const domain = classifyKeyByDomain(key);
      if (domain) domains.add(domain);
    }
  }

  return Array.from(domains);
}

function extractTopLevelKeys(obj: any, maxDepth: number = 2): string[] {
  const keys = new Set<string>();
  
  function traverse(current: any, depth: number) {
    if (depth > maxDepth || !current || typeof current !== 'object') return;
    
    for (const key of Object.keys(current)) {
      keys.add(key.toLowerCase());
      if (depth < maxDepth) {
        traverse(current[key], depth + 1);
      }
    }
  }
  
  traverse(obj, 0);
  return Array.from(keys);
}

function classifyKeyByDomain(key: string): string | null {
  const lowerKey = key.toLowerCase();
  
  for (const mapping of FIELD_MAPPINGS) {
    for (const pattern of mapping.patterns) {
      if (lowerKey.includes(pattern)) {
        return mapping.domain;
      }
    }
  }
  
  return null;
}

export function extractDomainData(
  data: any,
  domain: 'patient' | 'subscriber' | 'coverage' | 'plan' | 'procedures' | 'limits',
  sourcePath: string = ''
): Record<string, any> {
  loadFieldMappings();
  
  const result: Record<string, any> = {};
  const patterns = FIELD_MAPPINGS.find(m => m.domain === domain)?.patterns || [];
  
  function traverse(obj: any, path: string, insideDomainMatch: boolean = false) {
    if (!obj || typeof obj !== 'object') return;
    
    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        traverse(item, `${path}[${index}]`, insideDomainMatch);
      });
      return;
    }
    
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      const fullPath = path ? `${path}.${key}` : key;
      
      const matchesDomain = patterns.some(pattern => lowerKey.includes(pattern));
      
      // If we're already inside a domain match, include ALL fields
      if (insideDomainMatch) {
        result[fullPath] = value;
        if (typeof value === 'object' && value !== null) {
          traverse(value, fullPath, true);
        }
      }
      // Otherwise, only include if it matches the domain patterns
      else if (matchesDomain) {
        result[fullPath] = value;
        if (typeof value === 'object' && value !== null) {
          traverse(value, fullPath, true);  // Mark children as inside domain match
        }
      }
      // Continue traversing even if no match (to find nested matches)
      else if (typeof value === 'object' && value !== null) {
        traverse(value, fullPath, false);
      }
    }
  }
  
  traverse(data, sourcePath);
  return result;
}

export function normalizeFieldNames(data: Record<string, any>): Record<string, any> {
  loadFieldMappings();
  
  const normalized: Record<string, any> = {};
  
  for (const [path, value] of Object.entries(data)) {
    const parts = path.split('.');
    const normalizedParts = parts.map(part => {
      const lowerPart = part.toLowerCase().replace(/[_\s-]/g, '');
      return NORMALIZATION_MAP[lowerPart] || part;
    });
    
    normalized[normalizedParts.join('.')] = value;
  }
  
  return normalized;
}

export function aggregateByDomain(files: Array<{ fileName: string; data: any }>): DomainAggregation {
  loadFieldMappings();
  
  const provider = detectProvider(files);
  
  const aggregation: DomainAggregation = {
    patient: {},
    subscriber: {},
    coverage: {},
    plan: {},
    procedures: {},
    limits: {},
    metadata: {
      sourceFiles: [],
      aggregatedAt: new Date().toISOString(),
      provider,
      domainScores: {}
    }
  };

  for (const file of files) {
    aggregation.metadata.sourceFiles.push(file.fileName);
    
    const { domains, scores } = detectFileDomainEnhanced(file.fileName, file.data, provider);
    
    aggregation.metadata.domainScores[file.fileName] = scores;
    
    console.log(`[AGGREGATOR] ${file.fileName}:`);
    console.log(`[AGGREGATOR]   Detected domains: ${domains.join(', ')}`);
    scores.forEach(score => {
      const phrases = score.matchedPhrases.slice(0, 3).join(', ');
      console.log(`[AGGREGATOR]     ${score.domain}: ${(score.confidence * 100).toFixed(0)}% confidence (${phrases})`);
    });
    
    for (const domain of domains) {
      const extracted = extractDomainData(
        file.data, 
        domain as any, 
        file.fileName.replace('.json', '')
      );
      
      const normalized = normalizeFieldNames(extracted);
      
      console.log(`[AGGREGATOR]     → Extracted ${Object.keys(normalized).length} fields for ${domain} domain`);
      
      Object.assign(aggregation[domain as keyof DomainAggregation], normalized);
    }
  }

  return aggregation;
}

function detectProvider(files: Array<{ fileName: string; data: any }>): string {
  for (const file of files) {
    const dataStr = JSON.stringify(file.data).toLowerCase();
    
    if (dataStr.includes('delta') || dataStr.includes('deltadentalins')) {
      return 'Delta Dental';
    }
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

export function mergeDeep(target: any, source: any): any {
  if (!source || typeof source !== 'object') return target;
  if (!target || typeof target !== 'object') return source;

  const output = { ...target };
  
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (key in target && typeof target[key] === 'object' && !Array.isArray(target[key])) {
        output[key] = mergeDeep(target[key], source[key]);
      } else {
        output[key] = source[key];
      }
    } else {
      output[key] = source[key];
    }
  }
  
  return output;
}

export function getAggregationStats(aggregation: DomainAggregation): {
  totalFields: number;
  fieldsByDomain: Record<string, number>;
  sourceFileCount: number;
  provider: string;
} {
  const fieldsByDomain: Record<string, number> = {
    patient: Object.keys(aggregation.patient).length,
    subscriber: Object.keys(aggregation.subscriber).length,
    coverage: Object.keys(aggregation.coverage).length,
    plan: Object.keys(aggregation.plan).length,
    procedures: Object.keys(aggregation.procedures).length,
    limits: Object.keys(aggregation.limits).length,
  };

  return {
    totalFields: Object.values(fieldsByDomain).reduce((sum, count) => sum + count, 0),
    fieldsByDomain,
    sourceFileCount: aggregation.metadata.sourceFiles.length,
    provider: aggregation.metadata.provider
  };
}
