/**
 * Fresh Migration — Drops all tables and re-runs migrations + seed.
 * DEV ONLY — will destroy all data.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { env } from '../env.js';

if (env.NODE_ENV === 'production') {
  console.error('❌ REFUSING to run fresh migration in production. Set NODE_ENV=development.');
  process.exit(1);
}

const client = postgres(env.DATABASE_URL, { max: 1 });
const db = drizzle(client);

console.log('⚠️  Dropping all tables (DEV ONLY)...');

await db.execute(`
  DO $$ DECLARE
    r RECORD;
  BEGIN
    FOR r IN (
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename NOT LIKE 'pg_%'
        AND tablename NOT LIKE 'sql_%'
    ) LOOP
      EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
  END $$;
`);

// Drop enums
await db.execute(`
  DO $$ DECLARE
    r RECORD;
  BEGIN
    FOR r IN (
      SELECT typname FROM pg_type
      WHERE typtype = 'e'
      AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ) LOOP
      EXECUTE 'DROP TYPE IF EXISTS ' || quote_ident(r.typname) || ' CASCADE';
    END LOOP;
  END $$;
`);

console.log('✅ All tables and enums dropped. Now running migrations...');
await client.end();

// Import and run migrate
const { default: runMigrate } = await import('./migrate.js');
