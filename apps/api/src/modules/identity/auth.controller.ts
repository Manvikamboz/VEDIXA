import { FastifyInstance } from 'fastify';
import { AuthService } from './auth.service.js';
import { LoginSchema, VerifyOtpSchema, ParentalConsentSchema } from '@vedixa/schemas';
import { authenticate } from './auth.middleware.js';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Request OTP for phone login / signup
  app.post('/otp/request', async (request, reply) => {
    const body = LoginSchema.parse(request.body);
    const result = await AuthService.requestOtp(body.phone, 'LOGIN');
    return reply.status(200).send({
      success: true,
      data: result,
    });
  });

  // Verify OTP and issue JWT access + refresh tokens
  app.post('/otp/verify', async (request, reply) => {
    const body = VerifyOtpSchema.parse(request.body);
    const clientIp = request.ip || '127.0.0.1';
    const result = await AuthService.verifyOtpAndLogin(body, clientIp);
    return reply.status(200).send({
      success: true,
      data: result,
    });
  });

  // Request Parental Consent OTP (DPDP compliance for minors)
  app.post('/parental-consent/request-otp', { preHandler: [authenticate] }, async (request, reply) => {
    const body = LoginSchema.parse(request.body); // uses PhoneSchema
    const result = await AuthService.requestOtp(body.phone, 'PARENTAL_CONSENT');
    return reply.status(200).send({
      success: true,
      data: result,
    });
  });

  // Confirm Parental Consent
  app.post('/parental-consent/verify', { preHandler: [authenticate] }, async (request, reply) => {
    const body = ParentalConsentSchema.parse(request.body);
    const clientIp = request.ip || '127.0.0.1';
    await AuthService.recordParentalConsent(
      request.user!.sub,
      body.childPhone,
      body.consentOtp,
      body.consentToken,
      clientIp
    );
    return reply.status(200).send({
      success: true,
      data: { message: 'Parental consent verified successfully' },
    });
  });
}
