/**
 * Structured Logger — Pino
 *
 * Features:
 *  - JSON output in production, pretty-printed in development
 *  - Request ID injected via Fastify's built-in requestIdHeader
 *  - Redacts sensitive fields from logs
 */

import pino from 'pino';

import { env } from '../env.js';

const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.password',
  'req.body.otp',
  'req.body.phone',
  'req.body.parentPhone',
  '*.phoneHash',
  '*.phoneEncrypted',
  '*.tokenHash',
];

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: redactPaths,
    censor: '[REDACTED]',
  },
  ...(env.NODE_ENV === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      }
    : {
        // Production: pure JSON, no transport overhead
        formatters: {
          level: (label: string) => ({ level: label }),
        },
        timestamp: pino.stdTimeFunctions.isoTime,
      }),
});

export type Logger = typeof logger;
