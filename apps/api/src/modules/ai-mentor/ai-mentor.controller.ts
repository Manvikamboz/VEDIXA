import { FastifyInstance } from 'fastify';
import { AiMentorService } from './ai-mentor.service.js';
import { authenticate } from '../identity/auth.middleware.js';
import { CreateDoubtSessionSchema, SendDoubtMessageSchema } from '@vedixa/schemas';
import { db } from '../../core/db/client.js';
import { aiChatSessions } from '../../core/db/schema.js';

export async function aiMentorRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  // Create new doubt session
  app.post('/doubt-sessions', async (request, reply) => {
    const userId = request.user!.sub;
    const body = CreateDoubtSessionSchema.parse(request.body);

    const [session] = await db
      .insert(aiChatSessions)
      .values({
        userId,
        questionContextId: body.questionContextId,
        topicNodeId: body.topicNodeId,
        title: body.title,
      })
      .returning();

    return reply.status(201).send({
      success: true,
      data: session,
    });
  });

  // Query doubt solver with SSE streaming response
  app.post('/doubt-sessions/stream', async (request, reply) => {
    const userId = request.user!.sub;
    const body = SendDoubtMessageSchema.parse(request.body);

    const result = await AiMentorService.processDoubtQuery({
      userId,
      sessionId: body.sessionId,
      messageText: body.messageText,
      pedagogicalMode: body.pedagogicalMode,
    });

    // Setup Server-Sent Events headers
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');

    // Send metadata
    reply.raw.write(
      `event: metadata\ndata: ${JSON.stringify({
        model: result.modelUsed,
        cacheHit: result.isCacheHit,
        costRupees: result.costRupees,
      })}\n\n`
    );

    // Stream text chunks
    const chunks = result.answerText.split(' ');
    for (const chunk of chunks) {
      reply.raw.write(`event: delta\ndata: ${JSON.stringify({ textChunk: chunk + ' ' })}\n\n`);
    }

    reply.raw.write(`event: complete\ndata: {"status": "DONE"}\n\n`);
    reply.raw.end();
  });
}
