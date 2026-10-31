/**
 * JWT Token and Claims Service
 */

import crypto from 'node:crypto';
import { env } from '../../core/env.js';
import { UnauthorizedError } from '../../core/errors.js';

export interface JwtPayload {
  sub: string; // User ID
  role: string;
  isMinor: boolean;
  jti: string; // Unique JWT token identifier
  iat?: number;
  exp?: number;
}

export function generateJti(): string {
  return crypto.randomUUID();
}

/**
 * Basic HS256 JWT implementation without native dependencies for high testability & portability
 */
export function signJwt(payload: Omit<JwtPayload, 'iat' | 'exp'>, expiresInSeconds = 900): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JwtPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const b64Payload = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const signatureInput = `${b64Header}.${b64Payload}`;
  
  const signature = crypto
    .createHmac('sha256', env.JWT_SECRET)
    .update(signatureInput)
    .digest('base64url');

  return `${signatureInput}.${signature}`;
}

export function verifyJwt(token: string): JwtPayload {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new UnauthorizedError('Malformed authorization token');
  }

  const [b64Header, b64Payload, signature] = parts as [string, string, string];
  const signatureInput = `${b64Header}.${b64Payload}`;
  
  const expectedSignature = crypto
    .createHmac('sha256', env.JWT_SECRET)
    .update(signatureInput)
    .digest('base64url');

  if (signature !== expectedSignature) {
    throw new UnauthorizedError('Invalid authorization signature');
  }

  const payload = JSON.parse(Buffer.from(b64Payload, 'base64url').toString('utf8')) as JwtPayload;
  const now = Math.floor(Date.now() / 1000);

  if (payload.exp && payload.exp < now) {
    throw new UnauthorizedError('Authorization token has expired');
  }

  return payload;
}
