export interface OfficeContext {
  name: string;
  username: string;
  password: string;
  contractedPlans: string;
  blueCrossBlueShield?: {
    username: string;
    password: string;
    contractedPlans?: string;
  };
  deltaDental?: {
    username: string;
    password: string;
    contractedPlans?: string;
  };
}

interface OfficeConfig {
  key: string;
  displayName: string;
  aliases: string[];
}

let cachedOfficesConfig: OfficeConfig[] | null = null;

function loadOfficesFromEnv(): OfficeConfig[] {
  if (cachedOfficesConfig) {
    return cachedOfficesConfig;
  }
  
  const offices: OfficeConfig[] = [];
  const officeKeys = Object.keys(process.env)
    .filter(key => key.endsWith('_NAME'))
    .map(key => key.replace('_NAME', ''));
  
  for (const key of officeKeys) {
    const nameEnv = process.env[`${key}_NAME`];
    const aliasesEnv = process.env[`${key}_ALIASES`];
    
    if (nameEnv) {
      offices.push({
        key,
        displayName: nameEnv,
        aliases: aliasesEnv ? aliasesEnv.split(',').map(a => a.trim().toLowerCase()) : []
      });
    }
  }
  
  cachedOfficesConfig = offices;
  return offices;
}

export function getAllOfficeNames(): string[] {
  const offices = loadOfficesFromEnv();
  return offices.map(o => o.displayName);
}

export function getOfficeAliases(officeKey: string): string[] {
  const offices = loadOfficesFromEnv();
  const office = offices.find(o => o.key === officeKey);
  return office ? office.aliases : [];
}

/**
 * Map insurance provider name to environment variable prefix
 * This handles all provider name variations (BCBS, Blue Cross, etc.) → standard env var name
 */
export function getProviderEnvPrefix(insuranceProvider: string): string {
  const providerLower = insuranceProvider.toLowerCase();

  if (providerLower.includes('blue cross') || providerLower.includes('bcbs')) {
    return 'BLUE_CROSS_BLUE_SHIELD';
  } else if (providerLower.includes('delta dental') || providerLower.includes('delta')) {
    return 'DELTA_DENTAL';
  } else {
    throw new Error(`Unsupported insurance provider: ${insuranceProvider}. Supported: BCBS/Blue Cross, Delta Dental`);
  }
}

export function getOfficeContext(officeKey: string, insuranceProvider: string): OfficeContext {
  const offices = loadOfficesFromEnv();
  const officeConfig = offices.find(o => o.key === officeKey);

  if (!officeConfig) {
    const validKeys = offices.map(o => o.key).join(', ');
    throw new Error(`Invalid office key: ${officeKey}. Valid keys: ${validKeys}`);
  }

  const name = officeConfig.displayName;

  // Determine which provider to load based on insuranceProvider
  const providerEnvPrefix = getProviderEnvPrefix(insuranceProvider);
  
  const userKey = `${officeKey}_${providerEnvPrefix}_USER`;
  const passwordKey = `${officeKey}_${providerEnvPrefix}_PASSWORD`;
  const plansKey = `${officeKey}_${providerEnvPrefix}_CONTRACTED_PLANS`;
  
  const username = process.env[userKey];
  const password = process.env[passwordKey];
  const contractedPlans = process.env[plansKey];
  
  if (!username || !password) {
    const missingVars = [
      !username && userKey,
      !password && passwordKey,
    ].filter(Boolean);
    throw new Error(`Missing credentials for ${officeKey} ${providerEnvPrefix}: ${missingVars.join(', ')}`);
  }
  
  if (!contractedPlans) {
    throw new Error(`Missing contracted plans for ${officeKey}: ${plansKey}`);
  }

  return {
    name,
    username,
    password,
    contractedPlans,
  };
}