import { Pool, PoolConfig } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let pool: Pool | null = null;

export function getPostgresConfig(): PoolConfig {
  if (process.env.POSTGRES_URL) {
    return {
      connectionString: process.env.POSTGRES_URL,
      ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
    };
  }

  return {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'insurance_verification',
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
  };
}

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool(getPostgresConfig());
    
    pool.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL client', err);
    });
  }
  return pool;
}

export async function testConnection(): Promise<boolean> {
  try {
    const client = await getPool().connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('✅ PostgreSQL connection successful');
    return true;
  } catch (error) {
    console.error('❌ PostgreSQL connection failed:', error);
    return false;
  }
}

export async function runMigrations(): Promise<void> {
  const client = await getPool().connect();

  try {
    // Check if pgvector is available
    console.log('Checking for pgvector extension...');
    let useFallback = false;
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
      console.log('✅ pgvector extension available');
    } catch (error: any) {
      console.warn('⚠️  pgvector not available, using fallback (TEXT-based embeddings)');
      useFallback = true;
    }

    // Run all migration files in order
    const migrationsDir = path.join(__dirname, '../../migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .filter(file => {
        // Skip no_vector version if we have pgvector
        if (!useFallback && file.includes('no_vector')) return false;
        // Skip regular version if we need fallback
        if (useFallback && file.includes('001_create_feedback_table.sql')) return false;
        return true;
      })
      .sort(); // Ensures migrations run in order (001_, 002_, etc.)

    console.log(`Running ${migrationFiles.length} migration(s)...`);

    for (const file of migrationFiles) {
      const migrationPath = path.join(migrationsDir, file);
      console.log(`  📄 Running migration: ${file}`);

      const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

      try {
        await client.query(migrationSQL);
        console.log(`  ✅ ${file} completed`);
      } catch (error: any) {
        // Check if error is "already exists" - if so, skip gracefully
        if (error.message?.includes('already exists')) {
          console.log(`  ⏭️  ${file} - objects already exist, skipping`);
          continue;
        }
        console.error(`  ❌ ${file} failed:`, error.message);
        throw error;
      }
    }

    console.log('✅ All migrations completed successfully');
    if (useFallback) {
      console.log('ℹ️  Note: Using TEXT-based embeddings. Semantic search will be slower but functional.');
    }
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('PostgreSQL connection pool closed');
  }
}

export async function initializeDatabase(): Promise<void> {
  console.log('Initializing database...');
  const connected = await testConnection();
  
  if (!connected) {
    throw new Error('Failed to connect to PostgreSQL. Please check your configuration.');
  }

  await runMigrations();
  console.log('✅ Database initialization complete');
}
