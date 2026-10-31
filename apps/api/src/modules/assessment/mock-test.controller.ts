import { FastifyInstance } from 'fastify';
import { MockTestService } from './mock-test.service.js';
import { authenticate } from '../identity/auth.middleware.js';
import { StartTestAttemptSchema, SyncAttemptSchema } from '@vedixa/schemas';

export async function mockTestRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  // Start or resume test attempt
  app.post('/attempts/start', async (request, reply) => {
    const userId = request.user!.sub;
    const body = StartTestAttemptSchema.parse(request.body);

    const result = await MockTestService.startOrResumeAttempt(
      body.testId,
      userId,
      body.clientDeviceInfo
    );

    return reply.status(200).send({
      success: true,
      data: result,
    });
  });

  // Autosave and sync question responses
  app.post('/attempts/:attemptId/sync', async (request, reply) => {
    const userId = request.user!.sub;
    const { attemptId } = request.params as { attemptId: string };
    const body = SyncAttemptSchema.parse(request.body);

    const result = await MockTestService.syncResponses(
      attemptId,
      userId,
      body.events,
      body.isFinalSubmission
    );

    return reply.status(200).send({
      success: true,
      data: result,
    });
  });
}
