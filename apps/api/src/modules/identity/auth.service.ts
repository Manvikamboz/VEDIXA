/**
 * Authentication and DPDP Compliance Service
 */

import crypto from 'node:crypto';
import { db } from '../../core/db/client.js';
import { users, studentProfiles, otpTokens, refreshTokens, auditLogs, subscriptions } from '../../core/db/schema.js';
import { eq, and, gt } from 'drizzle-orm';
import { hashSha256, encryptPii, generateNumericOtp } from '../../core/crypto.js';
import { signJwt, generateJti } from './jwt.service.js';
import { BadRequestError, UnauthorizedError, NotFoundError } from '../../core/errors.js';

export interface RegisterInput {
  phone: string;
  dob: string;
  name: string;
  parentPhone?: string;
}

export interface VerifyOtpInput {
  phone: string;
  otp: string;
  otpToken: string;
}

export class AuthService {
  /**
   * Calculate student age to enforce DPDP minor classification (< 18)
   */
  static isMinor(dobString: string): boolean {
    const birthDate = new Date(dobString);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age < 18;
  }

  /**
   * Request an OTP for registration or login
   */
  static async requestOtp(phone: string, purpose: 'LOGIN' | 'PARENTAL_CONSENT' = 'LOGIN'): Promise<{ otpToken: string; debugOtp?: string }> {
    const phoneHash = hashSha256(phone);
    const otp = generateNumericOtp();
    const otpHash = hashSha256(otp);
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await db.insert(otpTokens).values({
      phoneHash,
      otpHash,
      token,
      purpose,
      expiresAt,
    });

    // In local/dev/test mode return debugOtp, in production this would dispatch via SMS gateway (MSG91)
    console.info(`[SMS Dispatch Simulation] Phone: ${phone.slice(0, 6)}**** OTP: ${otp} Purpose: ${purpose}`);

    return {
      otpToken: token,
      debugOtp: process.env['NODE_ENV'] !== 'production' ? otp : undefined,
    };
  }

  /**
   * Verify OTP and complete sign-in / registration
   */
  static async verifyOtpAndLogin(input: VerifyOtpInput, actorIp = '127.0.0.1'): Promise<{
    accessToken: string;
    refreshToken: string;
    user: { id: string; name: string; isMinor: boolean; role: string; hasProfile: boolean };
  }> {
    const phoneHash = hashSha256(input.phone);
    const otpHash = hashSha256(input.otp);

    // Validate OTP record
    const [tokenRecord] = await db
      .select()
      .from(otpTokens)
      .where(
        and(
          eq(otpTokens.token, input.otpToken),
          eq(otpTokens.phoneHash, phoneHash),
          eq(otpTokens.otpHash, otpHash),
          gt(otpTokens.expiresAt, new Date())
        )
      )
      .limit(1);

    if (!tokenRecord || tokenRecord.usedAt) {
      throw new BadRequestError('Invalid or expired OTP');
    }

    // Mark OTP as used
    await db.update(otpTokens).set({ usedAt: new Date() }).where(eq(otpTokens.id, tokenRecord.id));

    // Look up or auto-create User
    let [user] = await db.select().from(users).where(eq(users.phoneHash, phoneHash)).limit(1);

    if (!user) {
      const encryptedPhone = encryptPii(input.phone);
      const [newUser] = await db
        .insert(users)
        .values({
          phoneHash,
          phoneEncrypted: encryptedPhone,
          name: 'Student',
          isMinor: true, // Default safe until DOB registration
        })
        .returning();

      user = newUser;

      // Assign default Free subscription
      await db.insert(subscriptions).values({
        userId: user.id,
        planTier: 'FREE',
        dailyAiDoubtsQuota: 3,
      });

      // DPDP Audit log
      await db.insert(auditLogs).values({
        userId: user.id,
        action: 'USER_REGISTERED',
        actorIp,
        payload: { method: 'PHONE_OTP' },
      });
    }

    // Check existing profile
    const [profile] = await db.select().from(studentProfiles).where(eq(studentProfiles.userId, user.id)).limit(1);

    // Generate tokens
    const jti = generateJti();
    const accessToken = signJwt({
      sub: user.id,
      role: user.role,
      isMinor: user.isMinor,
      jti,
    });

    const rawRefreshToken = crypto.randomUUID();
    const refreshTokenHash = hashSha256(rawRefreshToken);
    const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash: refreshTokenHash,
      expiresAt: refreshExpiresAt,
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      user: {
        id: user.id,
        name: user.name,
        isMinor: user.isMinor,
        role: user.role,
        hasProfile: Boolean(profile?.onboardingCompletedAt),
      },
    };
  }

  /**
   * DPDP Act 2023: Parental Consent Flow for Minors
   */
  static async recordParentalConsent(
    studentUserId: string,
    parentPhone: string,
    otp: string,
    otpToken: string,
    actorIp: string
  ): Promise<void> {
    const parentPhoneHash = hashSha256(parentPhone);
    const otpHash = hashSha256(otp);

    const [tokenRecord] = await db
      .select()
      .from(otpTokens)
      .where(
        and(
          eq(otpTokens.token, otpToken),
          eq(otpTokens.phoneHash, parentPhoneHash),
          eq(otpTokens.otpHash, otpHash),
          gt(otpTokens.expiresAt, new Date())
        )
      )
      .limit(1);

    if (!tokenRecord || tokenRecord.usedAt) {
      throw new BadRequestError('Invalid or expired parental consent OTP');
    }

    await db.update(otpTokens).set({ usedAt: new Date() }).where(eq(otpTokens.id, tokenRecord.id));

    // Update student user record
    await db
      .update(users)
      .set({
        parentPhoneHash,
        parentPhoneEncrypted: encryptPii(parentPhone),
        parentConsentGrantedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, studentUserId));

    // Audit trail mandatory under DPDP
    await db.insert(auditLogs).values({
      userId: studentUserId,
      action: 'PARENTAL_CONSENT_RECORDED',
      actorIp,
      payload: { parentPhoneHash, method: 'SMS_OTP' },
    });
  }
}
