/**
 * Database Connection — Drizzle ORM + postgres.js
 *
 * Uses a singleton pattern; safe for long-lived Node.js processes.
 * Connection pool is configured for the expected concurrency profile.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { env } from '../env.js';
import * as schema from './schema.js';

// Configure postgres.js connection pool
// max: sized for concurrent API requests + background workers
// idle_timeout: close idle connections after 30s to reduce RDS costs
// connect_timeout: fail fast if DB is unreachable (surface config errors early)
const connectionString = postgres(env.DATABASE_URL, {
  max: env.NODE_ENV === 'test' ? 5 : 20,
  idle_timeout: 30,
  connect_timeout: 10,
  prepare: false, // Required for pgvector queries with parameterized embeddings
});

export const db = drizzle(connectionString, {
  schema,
  logger: env.LOG_LEVEL === 'debug',
});

export type Database = typeof db;

// Re-export raw postgres client for migrations
export { connectionString as pgClient };
