import { FastifyInstance } from 'fastify';
import { db } from '../../core/db/client.js';
import {
  studentProfiles,
  derivedTopicMastery,
  syllabusNodes,
  userStreaks,
  xpLedger,
  testAttempts,
} from '../../core/db/schema.js';
import { eq, desc, sql } from 'drizzle-orm';
import { authenticate } from '../identity/auth.middleware.js';

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  app.get('/summary', async (request, reply) => {
    const userId = request.user!.sub;

    // 1. Profile & Target
    const [profile] = await db
      .select()
      .from(studentProfiles)
      .where(eq(studentProfiles.userId, userId))
      .limit(1);

    // 2. Streaks
    const [streak] = await db
      .select()
      .from(userStreaks)
      .where(eq(userStreaks.userId, userId))
      .limit(1);

    // 3. Total XP
    const xpEntries = await db
      .select({ totalXp: sql<number>`COALESCE(SUM(${xpLedger.delta}), 0)` })
      .from(xpLedger)
      .where(eq(xpLedger.userId, userId));

    const totalXp = Number(xpEntries[0]?.totalXp || 0);

    // 4. Topic Mastery Heatmap
    const masteryRecords = await db
      .select({
        nodeId: derivedTopicMastery.nodeId,
        nodeName: syllabusNodes.name,
        subjectId: syllabusNodes.subjectId,
        eloRating: derivedTopicMastery.eloRating,
        totalAttempts: derivedTopicMastery.totalAttempts,
        correctAttempts: derivedTopicMastery.correctAttempts,
      })
      .from(derivedTopicMastery)
      .innerJoin(syllabusNodes, eq(derivedTopicMastery.nodeId, syllabusNodes.id))
      .where(eq(derivedTopicMastery.userId, userId));

    // 5. Recent Mock Test Performance
    const recentAttempts = await db
      .select({
        attemptId: testAttempts.id,
        totalScore: testAttempts.totalScore,
        percentileEstimate: testAttempts.percentileEstimate,
        accuracyPercentage: testAttempts.accuracyPercentage,
        submittedAt: testAttempts.submittedAt,
      })
      .from(testAttempts)
      .where(eq(testAttempts.userId, userId))
      .orderBy(desc(testAttempts.submittedAt))
      .limit(5);

    // 6. Explainable Next Best Action Recommendation
    const weakestTopic = masteryRecords
      .filter((m) => m.totalAttempts > 0)
      .sort((a, b) => a.eloRating - b.eloRating)[0];

    const recommendation = weakestTopic
      ? {
          action: 'PRACTICE_WEAK_TOPIC',
          topicName: weakestTopic.nodeName,
          nodeId: weakestTopic.nodeId,
          reason: `Your accuracy in ${weakestTopic.nodeName} is currently ${Math.round(
            (weakestTopic.correctAttempts / weakestTopic.totalAttempts) * 100
          )}% (Elo: ${weakestTopic.eloRating}). Solving 10 targeted questions will reinforce fundamentals.`,
        }
      : {
          action: 'START_DIAGNOSTIC',
          topicName: 'Kinematics in 1D and 2D',
          nodeId: '11111111-1111-1111-1111-111111111111',
          reason: 'Take your first diagnostic practice session to establish your baseline topic mastery ratings.',
        };

    return reply.send({
      success: true,
      data: {
        profile,
        streak: {
          current: streak?.currentStreak ?? 0,
          longest: streak?.longestStreak ?? 0,
          freezes: streak?.freezeTokensAvailable ?? 1,
        },
        totalXp,
        recommendation,
        masteryHeatmap: masteryRecords,
        recentAttempts,
      },
    });
  });
}
