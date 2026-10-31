import { FastifyInstance } from 'fastify';
import { ContentService } from './content.service.js';
import { authenticate } from '../identity/auth.middleware.js';
import { QuestionFilterSchema, SubmitPracticeAnswerSchema } from '@vedixa/schemas';
import { MasteryService } from '../mastery/mastery.service.js';

export async function contentRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  // List practice questions by filters
  app.get('/questions', async (request, reply) => {
    const filters = QuestionFilterSchema.parse(request.query);
    const result = await ContentService.listQuestions(filters);
    return reply.send({ success: true, data: result });
  });

  // Get question by ID
  app.get('/questions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const question = await ContentService.getQuestion(id, false);
    return reply.send({ success: true, data: question });
  });

  // Submit practice response with instantaneous feedback and Elo update
  app.post('/practice/submit', async (request, reply) => {
    const userId = request.user!.sub;
    const body = SubmitPracticeAnswerSchema.parse(request.body);

    const evalResult = await ContentService.evaluatePracticeAnswer(
      body.questionId,
      body.selectedOptionIds,
      body.numericalAnswer
    );

    // Retrieve question node for mastery update
    const question = await ContentService.getQuestion(body.questionId);

    // Apply O(1) Elo Mastery Update
    const masteryUpdate = await MasteryService.processAttemptOutcome({
      userId,
      nodeId: question.nodeId,
      isCorrect: evalResult.isCorrect,
      timeSpentSeconds: body.timeSpentSeconds,
      difficulty: question.difficulty,
    });

    return reply.send({
      success: true,
      data: {
        isCorrect: evalResult.isCorrect,
        correctOptionIds: evalResult.correctOptionIds,
        solution: evalResult.solution,
        mastery: masteryUpdate,
      },
    });
  });
}
