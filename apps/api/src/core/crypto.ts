/**
 * Cryptographic & Privacy Utilities for Indian DPDP Act 2023 Compliance
 *
 * 1. SHA-256 for deterministic hash indexing (phone lookup without storing plain phone)
 * 2. AES-256-GCM for encrypted storage of PII (phone number retrieval for authorized SMS only)
 */

import crypto from 'node:crypto';
import { env } from './env.js';

// Derive 32-byte key from hex string
const KEY = Buffer.from(env.ENCRYPTION_KEY, 'hex');
const ALGORITHM = 'aes-256-gcm';

/**
 * SHA-256 hash for indexed lookups without revealing plaintext
 */
export function hashSha256(text: string): string {
  return crypto.createHash('sha256').update(text.trim()).digest('hex');
}

/**
 * Encrypt sensitive PII using AES-256-GCM
 * Output format: iv:authTag:ciphertext (hex encoded)
 */
export function encryptPii(plainText: string): string {
  const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt sensitive PII
 */
export function decryptPii(encryptedPayload: string): string {
  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted payload format');
  }

  const [ivHex, authTagHex, cipherTextHex] = parts as [string, string, string];
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(cipherTextHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Generate 6-digit cryptographic numeric OTP
 */
export function generateNumericOtp(): string {
  return crypto.randomInt(100000, 999999).toString();
}
