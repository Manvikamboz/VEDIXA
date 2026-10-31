import { FastifyInstance } from 'fastify';
import { PlannerService } from './planner.service.js';
import { authenticate } from '../identity/auth.middleware.js';

export async function plannerRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  // Generate or re-balance roadmap
  app.post('/roadmap/generate', async (request, reply) => {
    const userId = request.user!.sub;
    const result = await PlannerService.generateOrRefreshRoadmap(userId);
    return reply.status(200).send({
      success: true,
      data: result,
    });
  });

  // Get daily study tasks
  app.get('/tasks/today', async (request, reply) => {
    const userId = request.user!.sub;
    const query = request.query as { date?: string };
    const dateStr = query.date || new Date().toISOString().split('T')[0] as string;

    const result = await PlannerService.getDailyTasks(userId, dateStr);
    return reply.send({
      success: true,
      data: result,
    });
  });
}
