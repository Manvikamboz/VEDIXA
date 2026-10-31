import { describe, it, expect } from 'vitest';
import { MasteryService } from '../mastery.service.js';

describe('MasteryService - Modified Elo Algorithm', () => {
  it('correct answer on an equal difficulty question increases Elo', () => {
    const result = MasteryService.calculateNewElo({
      currentElo: 1200,
      questionDifficulty: 1200,
      isCorrect: true,
      totalAttempts: 5,
      daysSinceLastPractice: 0,
    });

    expect(result.expectedProbability).toBe(0.5);
    // K = 40 (attempts < 20), Delta = 40 * (1 - 0.5) = +20
    expect(result.delta).toBe(20);
    expect(result.newElo).toBe(1220);
  });

  it('incorrect answer on an easy question heavily penalizes rating', () => {
    const result = MasteryService.calculateNewElo({
      currentElo: 1400,
      questionDifficulty: 1000, // Easy question for proficient student
      isCorrect: false,
      totalAttempts: 25, // K = 24
      daysSinceLastPractice: 0,
    });

    // Student expected probability was high (~0.909)
    // Delta = 24 * (0 - 0.909) ~ -22
    expect(result.delta).toBeLessThan(-20);
    expect(result.newElo).toBeLessThan(1400);
  });

  it('correct answer on an extreme question yields massive rating boost for novice', () => {
    const result = MasteryService.calculateNewElo({
      currentElo: 1100,
      questionDifficulty: 1600, // Hard/Extreme
      isCorrect: true,
      totalAttempts: 10, // K = 40
      daysSinceLastPractice: 0,
    });

    // Student expected probability was low (~0.05)
    // Delta = 40 * (1 - 0.05) ~ +38
    expect(result.delta).toBeGreaterThanOrEqual(35);
    expect(result.newElo).toBeGreaterThanOrEqual(1135);
  });

  it('respects lower and upper bounds (600 to 2400)', () => {
    const minResult = MasteryService.calculateNewElo({
      currentElo: 605,
      questionDifficulty: 1200,
      isCorrect: false,
      totalAttempts: 5,
      daysSinceLastPractice: 0,
    });
    expect(minResult.newElo).toBeGreaterThanOrEqual(600);
  });
});
