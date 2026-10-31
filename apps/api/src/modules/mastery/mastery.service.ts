/**
 * Modified Elo Topic Mastery Rating Engine
 *
 * Implements the mathematical formula defined in Section 4.2 of the Blueprint:
 *
 * R_new = R_old + K * (S - E) * D_q * T_decay
 *
 * Where:
 *  - R_old: Current Student Topic Mastery Rating (Default: 1200)
 *  - Q_diff: Question Difficulty Rating (Easy=1000, Med=1200, Hard=1400, Extreme=1600)
 *  - S: Actual Outcome (1.0 for Correct, 0.0 for Incorrect)
 *  - E: Expected Probability = 1 / (1 + 10^((Q_diff - R_old) / 400))
 *  - K: Dynamic Sensitivity Factor (K=40 if attempts < 20; K=24 for stable profiles)
 *  - D_q: Question Discrimination Factor (Default 1.0)
 *  - T_decay: Time Decay Penalty = e^(-0.03 * days_since_last_practice)
 */

import { db } from '../../core/db/client.js';
import { derivedTopicMastery } from '../../core/db/schema.js';
import { eq, and } from 'drizzle-orm';
import type { DifficultyTier } from '@vedixa/types';

export const DIFFICULTY_RATING_MAP: Record<DifficultyTier, number> = {
  EASY: 1000,
  MEDIUM: 1200,
  HARD: 1400,
  EXTREME: 1600,
};

export interface AttemptOutcomeInput {
  userId: string;
  nodeId: string;
  isCorrect: boolean;
  timeSpentSeconds: number;
  difficulty: DifficultyTier;
}

export class MasteryService {
  /**
   * Pure mathematical calculation of new Elo rating
   */
  static calculateNewElo(params: {
    currentElo: number;
    questionDifficulty: number;
    isCorrect: boolean;
    totalAttempts: number;
    daysSinceLastPractice: number;
    discriminationFactor?: number;
  }): { newElo: number; delta: number; expectedProbability: number } {
    const {
      currentElo,
      questionDifficulty,
      isCorrect,
      totalAttempts,
      daysSinceLastPractice,
      discriminationFactor = 1.0,
    } = params;

    // 1. Expected probability of correct answer
    const exponent = (questionDifficulty - currentElo) / 400;
    const expectedProbability = 1 / (1 + Math.pow(10, exponent));

    // 2. Dynamic K-factor (more volatile for new students, stable later)
    const kFactor = totalAttempts < 20 ? 40 : 24;

    // 3. Outcome S
    const actualOutcome = isCorrect ? 1.0 : 0.0;

    // 4. Memory time decay factor e^(-0.03 * days)
    const timeDecay = Math.exp(-0.03 * Math.min(daysSinceLastPractice, 60));

    // 5. Delta
    const rawDelta = kFactor * (actualOutcome - expectedProbability) * discriminationFactor * (isCorrect ? 1.0 : 1.0 / Math.max(timeDecay, 0.5));
    const delta = Math.round(rawDelta);

    const newElo = Math.max(600, Math.min(2400, currentElo + delta));

    return {
      newElo,
      delta,
      expectedProbability: Math.round(expectedProbability * 1000) / 1000,
    };
  }

  /**
   * Event-driven idempotent attempt outcome processor
   */
  static async processAttemptOutcome(input: AttemptOutcomeInput) {
    const { userId, nodeId, isCorrect, difficulty } = input;
    const qDifficultyRating = DIFFICULTY_RATING_MAP[difficulty] || 1200;

    // Retrieve or initialize topic mastery record
    const [existing] = await db
      .select()
      .from(derivedTopicMastery)
      .where(and(eq(derivedTopicMastery.userId, userId), eq(derivedTopicMastery.nodeId, nodeId)))
      .limit(1);

    const currentElo = existing?.eloRating ?? 1200;
    const totalAttempts = existing?.totalAttempts ?? 0;
    const correctAttempts = existing?.correctAttempts ?? 0;

    let daysSince = 0;
    if (existing?.lastPracticedAt) {
      const diffMs = Date.now() - new Date(existing.lastPracticedAt).getTime();
      daysSince = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    }

    const { newElo, delta, expectedProbability } = this.calculateNewElo({
      currentElo,
      questionDifficulty: qDifficultyRating,
      isCorrect,
      totalAttempts,
      daysSinceLastPractice: daysSince,
    });

    const newTotalAttempts = totalAttempts + 1;
    const newCorrectAttempts = correctAttempts + (isCorrect ? 1 : 0);

    if (existing) {
      await db
        .update(derivedTopicMastery)
        .set({
          eloRating: newElo,
          totalAttempts: newTotalAttempts,
          correctAttempts: newCorrectAttempts,
          lastPracticedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(derivedTopicMastery.userId, userId), eq(derivedTopicMastery.nodeId, nodeId)));
    } else {
      await db.insert(derivedTopicMastery).values({
        userId,
        nodeId,
        eloRating: newElo,
        totalAttempts: newTotalAttempts,
        correctAttempts: newCorrectAttempts,
        lastPracticedAt: new Date(),
      });
    }

    return {
      nodeId,
      oldElo: currentElo,
      newElo,
      delta,
      expectedProbability,
      totalAttempts: newTotalAttempts,
      accuracyPercentage: Math.round((newCorrectAttempts / newTotalAttempts) * 100),
    };
  }
}
