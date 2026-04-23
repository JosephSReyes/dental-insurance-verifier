import { getPool, testConnection, closePool } from '../src/shared/db-setup.js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../../.env') });

async function main() {
  console.log('🗑️  Resetting feedback_corrections table...\n');

  const connected = await testConnection();
  if (!connected) {
    console.error('❌ Failed to connect to PostgreSQL');
    process.exit(1);
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    console.log('Dropping existing table and view...');
    await client.query('DROP TABLE IF EXISTS feedback_corrections CASCADE;');
    await client.query('DROP VIEW IF EXISTS feedback_corrections_enriched CASCADE;');
    console.log('✅ Table dropped successfully\n');
    console.log('Now run: npm run db:init');
  } catch (error) {
    console.error('❌ Failed to drop table:', error);
    process.exit(1);
  } finally {
    client.release();
    await closePool();
  }
}

main();
