import { initializeDatabase, testConnection } from '../src/shared/db-setup.js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../../.env') });

async function main() {
  console.log('🚀 Starting PostgreSQL + pgvector database initialization...\n');
  
  console.log('Environment configuration:');
  console.log(`  POSTGRES_HOST: ${process.env.POSTGRES_HOST || 'localhost'}`);
  console.log(`  POSTGRES_PORT: ${process.env.POSTGRES_PORT || '5432'}`);
  console.log(`  POSTGRES_DB: ${process.env.POSTGRES_DB || 'insurance_verification'}`);
  console.log(`  POSTGRES_USER: ${process.env.POSTGRES_USER ? '***' : '(not set)'}`);
  console.log(`  POSTGRES_PASSWORD: ${process.env.POSTGRES_PASSWORD ? '***' : '(not set)'}`);
  console.log(`  POSTGRES_URL: ${process.env.POSTGRES_URL ? '(using connection string)' : '(not set)'}\n`);

  try {
    console.log('Step 1: Testing database connection...');
    const connected = await testConnection();
    
    if (!connected) {
      console.error('\n❌ Failed to connect to PostgreSQL.');
      console.error('\nPlease check:');
      console.error('  1. PostgreSQL is running');
      console.error('  2. Database credentials in .env are correct');
      console.error('  3. Database "insurance_verification" exists (or create it with: createdb insurance_verification)');
      console.error('  4. PostgreSQL accepts connections from your host\n');
      process.exit(1);
    }

    console.log('\nStep 2: Running database migrations...');
    await initializeDatabase();

    console.log('\n✅ Database initialization complete!');
    console.log('\nYou can now:');
    console.log('  1. Import existing feedback: npm run import-feedback');
    console.log('  2. Test the RAG system: npm run test-rag');
    console.log('  3. Start submitting feedback through the UI\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Database initialization failed:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('ECONNREFUSED')) {
        console.error('\n💡 PostgreSQL connection refused. Make sure PostgreSQL is running:');
        console.error('   - On macOS: brew services start postgresql');
        console.error('   - On Ubuntu: sudo systemctl start postgresql');
        console.error('   - On Windows: pg_ctl start\n');
      } else if (error.message.includes('password authentication failed')) {
        console.error('\n💡 Authentication failed. Check your POSTGRES_USER and POSTGRES_PASSWORD in .env\n');
      } else if (error.message.includes('database') && error.message.includes('does not exist')) {
        console.error('\n💡 Database does not exist. Create it with:');
        console.error('   createdb insurance_verification\n');
      } else if (error.message.includes('pgvector') || error.message.includes('extension')) {
        console.error('\n💡 pgvector extension not available. Install it:');
        console.error('   - On macOS: brew install pgvector');
        console.error('   - On Ubuntu: sudo apt install postgresql-*-pgvector');
        console.error('   - See: https://github.com/pgvector/pgvector#installation\n');
      }
    }
    
    process.exit(1);
  }
}

main();
