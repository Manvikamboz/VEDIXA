/**
 * Database Migration Runner
 *
 * Uses Drizzle Kit's migrate() function.
 * Run: pnpm db:migrate
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { env } from '../env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runMigrations(): Promise<void> {
  console.log('🚀 Running database migrations...');
  console.log(`   Database: ${env.DATABASE_URL.replace(/:[^@]+@/, ':****@')}`);

  const migrationClient = postgres(env.DATABASE_URL, { max: 1 });

  try {
    const db = drizzle(migrationClient);
    await migrate(db, {
      migrationsFolder: path.resolve(__dirname, '../../../migrations'),
    });
    console.log('✅ Migrations completed successfully.');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await migrationClient.end();
  }
}

await runMigrations();
