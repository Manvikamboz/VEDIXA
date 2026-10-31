import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../core/db/client.js';
import { subscriptions, notifications } from '../../core/db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { authenticate } from '../identity/auth.middleware.js';
import { ForbiddenError } from '../../core/errors.js';

export function requirePlan(minimumTier: 'FREE' | 'PRO_MONTHLY' | 'PRO_ANNUAL') {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const userId = request.user?.sub;
    if (!userId) return;

    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);

    const userTier = sub?.planTier ?? 'FREE';

    if (minimumTier !== 'FREE' && userTier === 'FREE') {
      throw new ForbiddenError(
        'This feature requires an active VEDIXA Pro subscription. Upgrade to unlock full access.'
      );
    }
  };
}

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  // Get notifications
  app.get('/notifications', async (request, reply) => {
    const userId = request.user!.sub;

    const items = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(20);

    return reply.send({ success: true, data: items });
  });

  // Get current plan & entitlements
  app.get('/subscriptions/me', async (request, reply) => {
    const userId = request.user!.sub;

    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);

    return reply.send({
      success: true,
      data: sub || { planTier: 'FREE', dailyAiDoubtsQuota: 3 },
    });
  });
}
