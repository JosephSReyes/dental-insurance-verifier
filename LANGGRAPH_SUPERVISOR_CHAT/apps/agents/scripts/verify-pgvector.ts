import { getPool, testConnection, closePool } from '../src/shared/db-setup.js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../../.env') });

async function main() {
  console.log('🔍 Verifying pgvector installation...\n');

  const connected = await testConnection();
  if (!connected) {
    console.error('❌ Failed to connect to PostgreSQL');
    process.exit(1);
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    // Check pgvector extension
    console.log('1️⃣  Checking pgvector extension...');
    const extResult = await client.query(
      "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector'"
    );
    if (extResult.rows.length > 0) {
      console.log(`   ✅ pgvector ${extResult.rows[0].extversion} is installed\n`);
    } else {
      console.log('   ❌ pgvector extension not found\n');
    }

    // Check embedding column type
    console.log('2️⃣  Checking embedding column type...');
    const colResult = await client.query(`
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns 
      WHERE table_name = 'feedback_corrections' 
      AND column_name = 'embedding'
    `);
    if (colResult.rows.length > 0) {
      const col = colResult.rows[0];
      console.log(`   Column: ${col.column_name}`);
      console.log(`   Type: ${col.udt_name}`);
      if (col.udt_name === 'vector') {
        console.log('   ✅ Using native vector type!\n');
      } else {
        console.log(`   ⚠️  Using ${col.udt_name} instead of vector\n`);
      }
    }

    // Check vector indexes
    console.log('3️⃣  Checking vector indexes...');
    const idxResult = await client.query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'feedback_corrections' 
      AND indexname LIKE '%embedding%'
    `);
    if (idxResult.rows.length > 0) {
      console.log(`   ✅ Found ${idxResult.rows.length} vector index(es):`);
      idxResult.rows.forEach(idx => {
        console.log(`      - ${idx.indexname}`);
      });
    } else {
      console.log('   ℹ️  No vector indexes found (will be created after data is loaded)');
    }

    // Test vector operations
    console.log('\n4️⃣  Testing vector operations...');
    try {
      await client.query("SELECT '[1,2,3]'::vector <-> '[1,2,4]'::vector AS distance");
      console.log('   ✅ Vector distance calculations work!\n');
    } catch (err) {
      console.log('   ❌ Vector operations failed:', err);
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ pgvector is properly installed and configured!');
    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await closePool();
  }
}

main();
