/**
 * Mock Test Service: Timed Test Engine, Autosave Sync, and Examination Rules
 */

import { db } from '../../core/db/client.js';
import {
  tests,
  testAttempts,
  questionResponses,
  questions,
  questionOptions,
  syllabusNodes,
} from '../../core/db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { NotFoundError, BadRequestError } from '../../core/errors.js';
import { MasteryService } from '../mastery/mastery.service.js';

export interface SyncResponseEvent {
  questionId: string;
  selectedOptionIds: string[];
  numericalAnswer: number | null;
  timeSpentSeconds: number;
  markedForReview: boolean;
  clientTimestamp: number;
}

export class MockTestService {
  /**
   * Start a new test attempt or resume an active one
   */
  static async startOrResumeAttempt(testId: string, userId: string, clientDeviceMetadata?: any) {
    const [test] = await db.select().from(tests).where(eq(tests.id, testId)).limit(1);
    if (!test) throw new NotFoundError('Mock test not found');

    // Check if an IN_PROGRESS attempt already exists
    const [existing] = await db
      .select()
      .from(testAttempts)
      .where(
        and(
          eq(testAttempts.testId, testId),
          eq(testAttempts.userId, userId),
          eq(testAttempts.status, 'IN_PROGRESS')
        )
      )
      .limit(1);

    if (existing) {
      // Check if server deadline has expired
      if (new Date() > new Date(existing.serverDeadlineAt)) {
        await this.finalizeSubmission(existing.id, userId);
        throw new BadRequestError('Test time limit has already expired and attempt has been closed');
      }

      // Fetch previously saved responses to resume state
      const savedResponses = await db
        .select()
        .from(questionResponses)
        .where(eq(questionResponses.attemptId, existing.id));

      return {
        attemptId: existing.id,
        testTitle: test.title,
        durationMinutes: test.durationMinutes,
        startedAt: existing.startedAt,
        serverDeadlineAt: existing.serverDeadlineAt,
        savedResponses,
        rulesConfig: test.rulesConfig,
      };
    }

    // Create fresh attempt with server-side countdown deadline
    const startedAt = new Date();
    const serverDeadlineAt = new Date(startedAt.getTime() + test.durationMinutes * 60 * 1000);

    const [attempt] = await db
      .insert(testAttempts)
      .values({
        testId,
        userId,
        status: 'IN_PROGRESS',
        startedAt,
        serverDeadlineAt,
        clientDeviceMetadata,
      })
      .returning();

    return {
      attemptId: attempt.id,
      testTitle: test.title,
      durationMinutes: test.durationMinutes,
      startedAt: attempt.startedAt,
      serverDeadlineAt: attempt.serverDeadlineAt,
      savedResponses: [],
      rulesConfig: test.rulesConfig,
    };
  }

  /**
   * Idempotent batch autosave of student responses
   */
  static async syncResponses(
    attemptId: string,
    userId: string,
    events: SyncResponseEvent[],
    isFinalSubmission = false
  ) {
    const [attempt] = await db
      .select()
      .from(testAttempts)
      .where(and(eq(testAttempts.id, attemptId), eq(testAttempts.userId, userId)))
      .limit(1);

    if (!attempt) throw new NotFoundError('Test attempt not found');
    if (attempt.status !== 'IN_PROGRESS') {
      throw new BadRequestError('Cannot sync responses to a test that is already evaluated or closed');
    }

    // Persist each response idempotently
    for (const evt of events) {
      const idempotencyKey = `${attemptId}:${evt.questionId}:${evt.clientTimestamp}`;

      // Check answer correctness
      const [question] = await db.select().from(questions).where(eq(questions.id, evt.questionId)).limit(1);
      if (!question) continue;

      let isCorrect = false;
      let earnedMarks = 0;

      if (question.kind === 'SINGLE_CHOICE' || question.kind === 'MULTI_CHOICE') {
        const options = await db
          .select()
          .from(questionOptions)
          .where(eq(questionOptions.questionId, evt.questionId));

        const correctIds = options.filter((o) => o.isCorrect).map((o) => o.id);
        isCorrect =
          evt.selectedOptionIds.length === 1 && correctIds.includes(evt.selectedOptionIds[0] as string);
      }

      const marking = question.markingScheme;
      if (evt.selectedOptionIds.length > 0 || evt.numericalAnswer !== null) {
        earnedMarks = isCorrect ? marking.correct : marking.incorrect;
      } else {
        earnedMarks = marking.unattempted ?? 0;
      }

      await db
        .insert(questionResponses)
        .values({
          attemptId,
          userId,
          questionId: evt.questionId,
          selectedOptionIds: evt.selectedOptionIds,
          numericalAnswer: evt.numericalAnswer?.toString(),
          isCorrect,
          markedForReview: evt.markedForReview,
          timeSpentSeconds: evt.timeSpentSeconds,
          earnedMarks: earnedMarks.toString(),
          idempotencyKey,
        })
        .onConflictDoNothing();
    }

    if (isFinalSubmission) {
      return await this.finalizeSubmission(attemptId, userId);
    }

    return { syncedCount: events.length, status: 'IN_PROGRESS' };
  }

  /**
   * Finalize submission, compute metrics, update topic mastery
   */
  static async finalizeSubmission(attemptId: string, userId: string) {
    const responses = await db
      .select()
      .from(questionResponses)
      .where(eq(questionResponses.attemptId, attemptId));

    let totalScore = 0;
    let correctCount = 0;
    let attemptedCount = 0;

    for (const r of responses) {
      const marks = parseFloat(r.earnedMarks?.toString() || '0');
      totalScore += marks;
      if (r.selectedOptionIds && r.selectedOptionIds.length > 0) {
        attemptedCount++;
        if (r.isCorrect) correctCount++;
      }
    }

    const accuracy = attemptedCount > 0 ? (correctCount / attemptedCount) * 100 : 0;
    const percentile = Math.min(99.9, Math.max(10, 50 + (totalScore / 300) * 50)); // normative placeholder

    await db
      .update(testAttempts)
      .set({
        status: 'EVALUATED',
        submittedAt: new Date(),
        totalScore: totalScore.toString(),
        percentileEstimate: percentile.toFixed(2),
        accuracyPercentage: accuracy.toFixed(2),
      })
      .where(eq(testAttempts.id, attemptId));

    // Update mastery asynchronously for attempted items
    for (const r of responses) {
      const [q] = await db.select().from(questions).where(eq(questions.id, r.questionId)).limit(1);
      if (q) {
        await MasteryService.processAttemptOutcome({
          userId,
          nodeId: q.nodeId,
          isCorrect: r.isCorrect,
          timeSpentSeconds: r.timeSpentSeconds,
          difficulty: q.difficulty,
        });
      }
    }

    return {
      attemptId,
      status: 'EVALUATED',
      totalScore,
      percentileEstimate: percentile,
      accuracyPercentage: accuracy,
      totalAttempted: attemptedCount,
      totalCorrect: correctCount,
    };
  }
}
