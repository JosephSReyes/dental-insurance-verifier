import { getPool, testConnection, closePool } from '../src/shared/db-setup.js';
import { getFeedbackStats } from '../src/shared/feedback-rag.js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../../.env') });

async function main() {
  console.log('📊 Current RAG Data Summary\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  const connected = await testConnection();
  if (!connected) {
    console.error('❌ Failed to connect to PostgreSQL');
    process.exit(1);
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    // Get total count
    const countResult = await client.query('SELECT COUNT(*) as total FROM feedback_corrections');
    const total = parseInt(countResult.rows[0].total);

    console.log(`📈 Total Corrections in Database: ${total}\n`);

    if (total === 0) {
      console.log('ℹ️  No corrections yet. Submit feedback through the UI to see RAG in action!\n');
      console.log('Steps:');
      console.log('  1. Run a verification');
      console.log('  2. Visit http://localhost:3000/review');
      console.log('  3. Correct any mistakes');
      console.log('  4. Submit feedback');
      console.log('  5. Run this script again to see the data\n');
    } else {
      // Show recent corrections
      console.log('📋 Recent Corrections:\n');
      const recentResult = await client.query(`
        SELECT 
          mapper,
          provider,
          field,
          ai_value,
          human_value,
          human_reasoning,
          TO_CHAR(reviewed_at, 'YYYY-MM-DD HH24:MI:SS') as reviewed_at
        FROM feedback_corrections
        ORDER BY reviewed_at DESC
        LIMIT 10
      `);

      recentResult.rows.forEach((row, i) => {
        console.log(`${i + 1}. ${row.field} (${row.mapper})`);
        console.log(`   Provider: ${row.provider}`);
        console.log(`   ❌ AI: "${row.ai_value || 'null'}"`);
        console.log(`   ✅ Human: "${row.human_value || 'null'}"`);
        console.log(`   💡 Reasoning: ${row.human_reasoning || 'No reasoning provided'}`);
        console.log(`   📅 Reviewed: ${row.reviewed_at}`);
        console.log('');
      });

      // Get statistics
      console.log('\n📊 Statistics by Mapper:\n');
      const mapperStats = await client.query(`
        SELECT 
          mapper,
          COUNT(*) as count
        FROM feedback_corrections
        GROUP BY mapper
        ORDER BY count DESC
      `);

      mapperStats.rows.forEach(row => {
        console.log(`   ${row.mapper}: ${row.count} corrections`);
      });

      console.log('\n📊 Statistics by Provider:\n');
      const providerStats = await client.query(`
        SELECT 
          provider,
          COUNT(*) as count
        FROM feedback_corrections
        GROUP BY provider
        ORDER BY count DESC
      `);

      providerStats.rows.forEach(row => {
        console.log(`   ${row.provider}: ${row.count} corrections`);
      });

      console.log('\n📊 Most Corrected Fields:\n');
      const fieldStats = await client.query(`
        SELECT 
          mapper,
          field,
          COUNT(*) as count
        FROM feedback_corrections
        GROUP BY mapper, field
        ORDER BY count DESC
        LIMIT 10
      `);

      fieldStats.rows.forEach((row, i) => {
        console.log(`   ${i + 1}. ${row.field} (${row.mapper}): ${row.count} times`);
      });
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('✅ RAG system is active and ready to learn!');
    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    client.release();
    await closePool();
  }
}

main();
