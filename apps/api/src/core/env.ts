/**
 * Environment Validation
 *
 * All env vars are parsed and validated at startup via Zod.
 * Application WILL NOT START if required vars are missing or malformed.
 * This prevents runtime "undefined" crashes deep in the application.
 */

import { z } from 'zod';

const envSchema = z.object({
  // ─── Node ────────────────────────────────────────────────────────────────────
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // ─── Server ──────────────────────────────────────────────────────────────────
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  // ─── Database ────────────────────────────────────────────────────────────────
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid connection string'),

  // ─── Redis ───────────────────────────────────────────────────────────────────
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // ─── Auth ────────────────────────────────────────────────────────────────────
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  // ─── Encryption (for PII) ────────────────────────────────────────────────────
  ENCRYPTION_KEY: z
    .string()
    .min(64, 'ENCRYPTION_KEY must be a 32-byte hex string (64 chars)')
    .regex(/^[0-9a-fA-F]+$/, 'ENCRYPTION_KEY must be hex'),

  // ─── AI Providers ────────────────────────────────────────────────────────────
  GOOGLE_GEMINI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),

  // ─── AI Quotas ───────────────────────────────────────────────────────────────
  AI_FREE_DAILY_DOUBTS: z.coerce.number().int().default(3),
  AI_PRO_DAILY_DOUBTS: z.coerce.number().int().default(30),
  AI_FREE_MAX_TOKENS: z.coerce.number().int().default(450),
  AI_PRO_MAX_TOKENS: z.coerce.number().int().default(1200),

  // ─── Rate Limits ─────────────────────────────────────────────────────────────
  RATE_LIMIT_MAX_AUTH: z.coerce.number().int().default(10),
  RATE_LIMIT_WINDOW_AUTH: z.coerce.number().int().default(60000),
  RATE_LIMIT_MAX_AI: z.coerce.number().int().default(5),
  RATE_LIMIT_WINDOW_AI: z.coerce.number().int().default(60000),
  RATE_LIMIT_MAX_DEFAULT: z.coerce.number().int().default(100),
  RATE_LIMIT_WINDOW_DEFAULT: z.coerce.number().int().default(60000),

  // ─── App ─────────────────────────────────────────────────────────────────────
  APP_URL: z.string().url().default('http://localhost:3000'),
  APP_NAME: z.string().default('VEDIXA'),

  // ─── SMS ─────────────────────────────────────────────────────────────────────
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_TEMPLATE_ID: z.string().optional(),
  MSG91_SENDER_ID: z.string().default('VEDIXA'),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | undefined;

export function getEnv(): Env {
  if (_env) return _env;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`\n❌ Environment validation failed:\n${issues}\n\nSee .env.example for reference.`);
  }

  _env = result.data;
  return _env;
}

// Eagerly validate on import — startup fails fast
export const env = getEnv();
