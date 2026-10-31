/**
 * Redis / Valkey Client — ioredis
 *
 * Used for:
 *  - Session store / JWT blocklist
 *  - AI quota token buckets (rate limiting per user per day)
 *  - BullMQ job queues
 *  - Semantic cache key lookups
 *  - Rate limiting middleware
 */

import Redis from 'ioredis';

import { env } from '../env.js';

let _redis: Redis | undefined;

export function getRedis(): Redis {
  if (_redis) return _redis;

  _redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
    reconnectOnError(err) {
      const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
      return targetErrors.some((e) => err.message.includes(e));
    },
  });

  _redis.on('error', (err: Error) => {
    // Don't crash the process on transient Redis errors — log and continue
    console.error({ msg: 'Redis client error', error: err.message });
  });

  _redis.on('connect', () => {
    console.info({ msg: 'Redis connected' });
  });

  return _redis;
}

export const redis = getRedis();

// ─── Typed Key Builders ───────────────────────────────────────────────────────
// Centralizing all key patterns prevents typos and makes invalidation explicit.

export const RedisKeys = {
  // Auth
  otpAttempts: (phoneHash: string) => `otp:attempts:${phoneHash}`,
  jwtBlocklist: (jti: string) => `jwt:block:${jti}`,

  // AI metering — atomic counter, reset daily
  aiDoubtsUsed: (userId: string, dateStr: string) => `ai:doubts:${userId}:${dateStr}`,
  aiTokensUsed: (userId: string, dateStr: string) => `ai:tokens:${userId}:${dateStr}`,

  // Semantic cache — maps embedding key to cached message id
  semanticCache: (embeddingKey: string) => `ai:scache:${embeddingKey}`,

  // Rate limiting
  rateLimitAuth: (ip: string) => `rl:auth:${ip}`,
  rateLimitAi: (userId: string) => `rl:ai:${userId}`,

  // Streak lock (prevents concurrent streak updates)
  streakLock: (userId: string) => `lock:streak:${userId}`,

  // Online presence for study rooms
  studyRoomPresence: (roomId: string) => `room:presence:${roomId}`,
} as const;
