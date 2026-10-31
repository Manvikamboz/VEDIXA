import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { env } from './core/env.js';
import { logger } from './core/logger.js';
import { AppError } from './core/errors.js';

// Route imports
import { authRoutes } from './modules/identity/auth.controller.js';
import { profileRoutes } from './modules/identity/profile.controller.js';
import { contentRoutes } from './modules/content/content.controller.js';
import { mockTestRoutes } from './modules/assessment/mock-test.controller.js';
import { plannerRoutes } from './modules/planner/planner.controller.js';
import { aiMentorRoutes } from './modules/ai-mentor/ai-mentor.controller.js';
import { dashboardRoutes } from './modules/recommendations/dashboard.controller.js';
import { communityRoutes } from './modules/community/community.controller.js';
import { notificationRoutes } from './modules/notifications/notifications.controller.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    loggerInstance: logger,
    trustProxy: true,
    requestIdHeader: 'x-request-id',
    disableRequestLogging: env.NODE_ENV === 'test',
  });

  await app.register(sensible);
  await app.register(helmet, {
    contentSecurityPolicy: env.NODE_ENV === 'production',
  });
  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
  });

  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX_DEFAULT,
    timeWindow: env.RATE_LIMIT_WINDOW_DEFAULT,
  });

  // Global Healthcheck
  app.get('/health', async () => {
    return {
      status: 'ok',
      service: env.APP_NAME,
      environment: env.NODE_ENV,
      timestamp: new Date().toISOString(),
    };
  });

  // Register API Module Routes
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(profileRoutes, { prefix: '/api/v1/profile' });
  await app.register(contentRoutes, { prefix: '/api/v1/content' });
  await app.register(mockTestRoutes, { prefix: '/api/v1/assessments' });
  await app.register(plannerRoutes, { prefix: '/api/v1/planner' });
  await app.register(aiMentorRoutes, { prefix: '/api/v1/ai' });
  await app.register(dashboardRoutes, { prefix: '/api/v1/dashboard' });
  await app.register(communityRoutes, { prefix: '/api/v1/community' });
  await app.register(notificationRoutes, { prefix: '/api/v1/account' });

  // Centralized Error Handler (RFC 7807 compliant)
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        type: `https://vedixa.com/errors/${error.code.toLowerCase()}`,
        title: error.message,
        status: error.statusCode,
        code: error.code,
        details: error.details,
        instance: request.url,
      });
    }

    if (error.validation) {
      return reply.status(400).send({
        type: 'https://vedixa.com/errors/validation-error',
        title: 'Input Validation Failed',
        status: 400,
        code: 'VALIDATION_ERROR',
        details: error.validation,
        instance: request.url,
      });
    }

    request.log.error(error);
    return reply.status(500).send({
      type: 'https://vedixa.com/errors/internal-server-error',
      title: 'An unexpected internal error occurred',
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
      instance: request.url,
    });
  });

  return app;
}
