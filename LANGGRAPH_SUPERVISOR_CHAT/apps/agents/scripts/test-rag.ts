import { 
  saveCorrectionToRAG, 
  getFeedbackForField, 
  searchSimilarCorrections, 
  getRelevantFeedback,
  getFeedbackStats 
} from '../src/shared/feedback-rag.js';
import { CorrectionData } from '../src/shared/feedback-types.js';
import { testConnection } from '../src/shared/db-setup.js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../../.env') });

async function testConnection_() {
  console.log('1️⃣  Testing PostgreSQL connection...');
  const connected = await testConnection();
  if (!connected) {
    throw new Error('Failed to connect to PostgreSQL');
  }
  console.log('   ✅ Connection successful\n');
}

async function testSaveCorrection() {
  console.log('2️⃣  Testing: Save correction with embedding...');
  
  const testCorrection: CorrectionData = {
    verification_id: 'TEST-001',
    mapper: 'patient_info_mapper',
    provider: 'Delta Dental',
    field: 'member_id',
    ai_value: '12345',
    human_value: '67890',
    source_path: 'patient.id',
    correct_path: 'plan.subscriber.memberId',
    human_reasoning: 'Member ID is in plan.subscriber.memberId, not patient.id. Always check plan object first.',
    reviewer_id: 'test_reviewer',
    reviewed_at: new Date(),
    metadata: {
      patient_name: 'Test Patient',
      verification_date: new Date().toISOString(),
      error_type: 'wrong_path'
    }
  };

  await saveCorrectionToRAG(testCorrection);
  console.log('   ✅ Correction saved with embedding\n');
}

async function testExactMatch() {
  console.log('3️⃣  Testing: Exact field match retrieval...');
  
  const results = await getFeedbackForField({
    mapper: 'patient_info_mapper',
    provider: 'Delta Dental',
    field: 'member_id',
    limit: 5
  });

  console.log(`   ✅ Retrieved ${results.length} exact matches`);
  if (results.length > 0) {
    console.log(`   📄 Example: "${results[0].human_reasoning}"\n`);
  } else {
    console.log('   ⚠️  No matches found (database might be empty)\n');
  }
}

async function testSemanticSearch() {
  console.log('4️⃣  Testing: Semantic similarity search...');
  
  const results = await searchSimilarCorrections({
    query: 'How to find member ID in insurance data',
    mapper: 'patient_info_mapper',
    provider: 'Delta Dental',
    limit: 3,
    minSimilarity: 0.6
  });

  console.log(`   ✅ Retrieved ${results.length} semantically similar corrections`);
  if (results.length > 0) {
    results.forEach((r, i) => {
      console.log(`   ${i + 1}. ${r.field} (similarity: ${(r.similarity_score! * 100).toFixed(1)}%)`);
      console.log(`      "${r.human_reasoning?.substring(0, 80)}..."`);
    });
  } else {
    console.log('   ⚠️  No similar corrections found\n');
  }
  console.log();
}

async function testHybridRetrieval() {
  console.log('5️⃣  Testing: Hybrid retrieval (exact + semantic)...');
  
  const results = await getRelevantFeedback({
    mapper: 'patient_info_mapper',
    provider: 'Delta Dental',
    field: 'member_id',
    currentContext: 'Extracting member ID from Delta Dental verification data',
    limit: 5
  });

  console.log(`   ✅ Retrieved ${results.length} relevant corrections`);
  if (results.length > 0) {
    results.forEach((r, i) => {
      console.log(`   ${i + 1}. ${r.field}: "${r.ai_value}" → "${r.human_value}"`);
    });
  } else {
    console.log('   ⚠️  No relevant corrections found\n');
  }
  console.log();
}

async function testCrossProviderSearch() {
  console.log('6️⃣  Testing: Cross-provider semantic search...');
  
  const results = await searchSimilarCorrections({
    query: 'member identification number extraction errors',
    field: 'member_id',
    limit: 5,
    minSimilarity: 0.5
  });

  console.log(`   ✅ Retrieved ${results.length} corrections across all providers`);
  if (results.length > 0) {
    const providers = new Set(results.map(r => r.provider));
    console.log(`   📊 Providers: ${Array.from(providers).join(', ')}`);
  } else {
    console.log('   ⚠️  No corrections found\n');
  }
  console.log();
}

async function testStats() {
  console.log('7️⃣  Testing: Feedback statistics...');
  
  try {
    const stats = await getFeedbackStats();
    
    console.log(`   ✅ Total corrections: ${stats.total_corrections}`);
    console.log(`   📊 By mapper:`);
    for (const [mapper, count] of Object.entries(stats.by_mapper)) {
      console.log(`      ${mapper}: ${count}`);
    }
    console.log(`   📊 By provider:`);
    for (const [provider, count] of Object.entries(stats.by_provider)) {
      console.log(`      ${provider}: ${count}`);
    }
    console.log(`   📊 Most corrected fields:`);
    stats.most_corrected_fields.slice(0, 5).forEach((item, i) => {
      console.log(`      ${i + 1}. ${item.field} (${item.mapper}): ${item.count} times`);
    });
  } catch (error) {
    console.log(`   ⚠️  Stats query failed: ${error}`);
  }
  console.log();
}

async function main() {
  console.log('🧪 RAG System Test Suite\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    await testConnection_();
    await testSaveCorrection();
    await testExactMatch();
    await testSemanticSearch();
    await testHybridRetrieval();
    await testCrossProviderSearch();
    await testStats();

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ All tests passed!\n');
    console.log('Your RAG system is ready to use. Next steps:');
    console.log('  1. Submit feedback through UI: http://localhost:3000/review');
    console.log('  2. Import existing feedback: npm run import-feedback');
    console.log('  3. Run a verification to see RAG in action\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error('\nMake sure:');
    console.error('  1. PostgreSQL is running');
    console.error('  2. Database is initialized: npm run init-db');
    console.error('  3. Environment variables are set in .env\n');
    process.exit(1);
  }
}

main();
