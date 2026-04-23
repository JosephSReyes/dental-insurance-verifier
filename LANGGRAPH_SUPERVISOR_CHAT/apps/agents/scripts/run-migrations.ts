import { initializeDatabase, closePool } from '../src/shared/db-setup.js';

async function runMigrations() {
  console.log('🚀 Starting database migrations...\n');

  try {
    await initializeDatabase();
    console.log('\n✅ All migrations completed successfully!');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await closePool();
    process.exit(0);
  }
}

runMigrations();
