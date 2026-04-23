export function extractProcedureCode(path: string): string | null {
  const match = path.match(/D\d{4}/i);
  if (!match) return null;
  return match[0].toUpperCase();
}

export function normalizeCoverage(value: string | number): string {
  if (typeof value === 'number') {
    return `${value}%`;
  }
  
  if (typeof value === 'string') {
    const numMatch = value.match(/(\d+)/);
    if (numMatch) {
      const num = parseInt(numMatch[1], 10);
      return `${num}%`;
    }
    
    if (value.includes('%')) {
      return value;
    }
  }
  
  return String(value);
}

export function buildFrequencyText(ruleParts: Record<string, string | number>): string {
  const occurrences = ruleParts.occurrences || ruleParts.count || ruleParts.times;
  const unit = ruleParts.unit || ruleParts.period || ruleParts.timeframe;
  
  if (!occurrences) {
    return '';
  }
  
  const count = typeof occurrences === 'number' ? occurrences : parseInt(String(occurrences), 10);
  
  const unitMap: Record<string, string> = {
    'benefitPeriod': 'per benefit period',
    'benefit_period': 'per benefit period',
    'calendarYear': 'per calendar year',
    'calendar_year': 'per calendar year',
    'year': 'per year',
    'lifetime': 'per lifetime',
    'visit': 'per visit',
    'month': 'per month',
    'day': 'per day'
  };
  
  const normalizedUnit = typeof unit === 'string' 
    ? (unitMap[unit] || unit.toLowerCase().replace(/_/g, ' '))
    : 'per benefit period';
  
  if (count === 1) {
    return `Once ${normalizedUnit}`;
  } else if (count === 2) {
    return `Twice ${normalizedUnit}`;
  } else {
    return `${count} ${normalizedUnit}`;
  }
}

export function extractAgeLimit(value: any): number | null {
  if (typeof value === 'number') {
    return value;
  }
  
  if (typeof value === 'string') {
    const match = value.match(/(\d+)/);
    if (match) {
      return parseInt(match[1], 10);
    }
  }
  
  return null;
}

export function normalizeWaitingPeriod(value: any): string | null {
  if (value === null || value === undefined || value === '' || value === 'None') {
    return null;
  }
  
  if (typeof value === 'string') {
    if (value.toLowerCase().includes('month')) {
      const match = value.match(/(\d+)/);
      if (match) {
        return `${match[1]} months`;
      }
      return value;
    }
    
    if (value.toLowerCase().includes('day')) {
      const match = value.match(/(\d+)/);
      if (match) {
        return `${match[1]} days`;
      }
      return value;
    }
    
    return value;
  }
  
  if (typeof value === 'number') {
    return `${value} months`;
  }
  
  return String(value);
}

export function normalizeBoolean(value: any): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'true' || lower === 'yes' || lower === 'y' || lower === '1') {
      return true;
    }
    if (lower === 'false' || lower === 'no' || lower === 'n' || lower === '0') {
      return false;
    }
  }
  
  if (typeof value === 'number') {
    return value > 0;
  }
  
  return false;
}

export function combineLimitationNotes(limitations: Array<Record<string, any>>): string {
  if (!Array.isArray(limitations) || limitations.length === 0) {
    return '';
  }
  
  const notes: string[] = [];
  
  for (const limitation of limitations) {
    if (typeof limitation === 'string') {
      notes.push(limitation);
      continue;
    }
    
    if (limitation.description) {
      notes.push(limitation.description);
    } else if (limitation.text) {
      notes.push(limitation.text);
    } else if (limitation.rule) {
      notes.push(limitation.rule);
    } else {
      const parts: string[] = [];
      
      if (limitation.occurrences || limitation.count) {
        const freq = buildFrequencyText(limitation);
        if (freq) parts.push(freq);
      }
      
      if (limitation.codes && Array.isArray(limitation.codes)) {
        parts.push(`grouped with ${limitation.codes.join(', ')}`);
      }
      
      if (limitation.note) {
        parts.push(limitation.note);
      }
      
      if (parts.length > 0) {
        notes.push(parts.join('; '));
      }
    }
  }
  
  return notes.join('; ');
}

export interface FlattenedEntry {
  path: string;
  value: any;
  type: string;
}

export function groupByProcedureCode(entries: FlattenedEntry[]): Map<string, FlattenedEntry[]> {
  const grouped = new Map<string, FlattenedEntry[]>();
  
  for (const entry of entries) {
    const code = extractProcedureCode(entry.path);
    if (code) {
      if (!grouped.has(code)) {
        grouped.set(code, []);
      }
      grouped.get(code)!.push(entry);
    }
  }
  
  return grouped;
}

export function extractFieldFromEntries(
  entries: FlattenedEntry[],
  fieldPatterns: string[]
): any {
  for (const entry of entries) {
    const pathLower = entry.path.toLowerCase();
    
    for (const pattern of fieldPatterns) {
      if (pathLower.includes(pattern.toLowerCase())) {
        return entry.value;
      }
    }
  }
  
  return null;
}
