import { addDays } from 'date-fns';

import {
  topologicalSort,
  computeTopicPriority,
  getNextReviewDate,
  generateStudySchedule,
  validatePlan,
  type SyllabusNode,
  type PlannerInput,
} from '../src/index';
import type { TopicMastery } from '@vedixa/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeNode = (overrides: Partial<SyllabusNode> & Pick<SyllabusNode, 'id' | 'name'>): SyllabusNode => ({
  subjectId: 'PHYSICS',
  examWeightagePercent: 5,
  prerequisiteNodeIds: [],
  estimatedStudyMinutes: 60,
  estimatedPracticeMinutes: 30,
  ...overrides,
});

const makeMastery = (overrides: Partial<TopicMastery> & Pick<TopicMastery, 'userId' | 'nodeId'>): TopicMastery => ({
  eloRating: 1200,
  confidenceInterval: 0.5,
  totalAttempts: 10,
  correctAttempts: 6,
  lastPracticedAt: new Date().toISOString(),
  ...overrides,
});

// ─── Topological Sort Tests ───────────────────────────────────────────────────

describe('topologicalSort', () => {
  test('sorts independent nodes in stable order', () => {
    const nodes = [
      makeNode({ id: 'A', name: 'Topic A' }),
      makeNode({ id: 'B', name: 'Topic B' }),
    ];
    const sorted = topologicalSort(nodes);
    expect(sorted).toHaveLength(2);
  });

  test('places prerequisites before dependents', () => {
    const nodes = [
      makeNode({ id: 'CALC', name: 'Calculus', prerequisiteNodeIds: ['ALGEBRA'] }),
      makeNode({ id: 'ALGEBRA', name: 'Algebra', prerequisiteNodeIds: [] }),
    ];
    const sorted = topologicalSort(nodes);
    const algebraIdx = sorted.findIndex((n) => n.id === 'ALGEBRA');
    const calcIdx = sorted.findIndex((n) => n.id === 'CALC');
    expect(algebraIdx).toBeLessThan(calcIdx);
  });

  test('handles multi-level chain: A → B → C', () => {
    const nodes = [
      makeNode({ id: 'C', name: 'C', prerequisiteNodeIds: ['B'] }),
      makeNode({ id: 'A', name: 'A', prerequisiteNodeIds: [] }),
      makeNode({ id: 'B', name: 'B', prerequisiteNodeIds: ['A'] }),
    ];
    const sorted = topologicalSort(nodes);
    const [aIdx, bIdx, cIdx] = [
      sorted.findIndex((n) => n.id === 'A'),
      sorted.findIndex((n) => n.id === 'B'),
      sorted.findIndex((n) => n.id === 'C'),
    ];
    expect(aIdx).toBeLessThan(bIdx);
    expect(bIdx).toBeLessThan(cIdx);
  });

  test('throws on circular dependency', () => {
    const nodes = [
      makeNode({ id: 'A', name: 'A', prerequisiteNodeIds: ['B'] }),
      makeNode({ id: 'B', name: 'B', prerequisiteNodeIds: ['A'] }),
    ];
    expect(() => topologicalSort(nodes)).toThrow(/Circular dependency/);
  });

  test('handles node with unknown prerequisite id gracefully', () => {
    const nodes = [
      makeNode({ id: 'A', name: 'A', prerequisiteNodeIds: ['NON_EXISTENT'] }),
    ];
    expect(() => topologicalSort(nodes)).not.toThrow();
  });
});

// ─── SM-2 Spacing Tests ───────────────────────────────────────────────────────

describe('getNextReviewDate', () => {
  const today = new Date('2026-10-01');

  test('returns today if never practiced', () => {
    const result = getNextReviewDate(null, today, 1200, 0, 0);
    expect(result).toEqual(today);
  });

  test('high-mastery topic (Elo >= 1400, accuracy >= 0.9) gets 30-day interval', () => {
    const lastPracticed = new Date('2026-10-01').toISOString();
    const result = getNextReviewDate(lastPracticed, today, 1450, 9, 10);
    const expected = addDays(new Date('2026-10-01'), 30);
    expect(result.getTime()).toBeGreaterThanOrEqual(expected.getTime() - 1000);
  });

  test('struggling topic (accuracy < 0.3) gets 1-day interval', () => {
    const lastPracticed = new Date('2026-10-01').toISOString();
    const result = getNextReviewDate(lastPracticed, today, 1100, 2, 10);
    const expected = addDays(new Date('2026-10-01'), 1);
    expect(result.getTime()).toBeGreaterThanOrEqual(expected.getTime() - 1000);
  });

  test('overdue topic is scheduled for today', () => {
    // Last practiced 40 days ago
    const lastPracticed = addDays(today, -40).toISOString();
    const result = getNextReviewDate(lastPracticed, today, 1200, 5, 10);
    expect(result.getTime()).toBeLessThanOrEqual(today.getTime() + 1000);
  });
});

// ─── Priority Scoring Tests ───────────────────────────────────────────────────

describe('computeTopicPriority', () => {
  const today = new Date('2026-10-01');
  const daysToExam = 90;

  test('unpracticed high-weightage topic has highest priority', () => {
    const node = makeNode({ id: 'A', name: 'High Weightage', examWeightagePercent: 10 });
    const priority = computeTopicPriority(node, undefined, today, daysToExam);
    expect(priority).toBeGreaterThan(5);
  });

  test('mastered low-weightage topic has low priority', () => {
    const node = makeNode({ id: 'B', name: 'Low Weightage', examWeightagePercent: 1 });
    const mastery = makeMastery({
      userId: 'u1',
      nodeId: 'B',
      eloRating: 1500,
      correctAttempts: 95,
      totalAttempts: 100,
    });
    const priority = computeTopicPriority(node, mastery, today, daysToExam);
    expect(priority).toBeLessThan(3);
  });

  test('close to exam boosts priority by urgency multiplier', () => {
    const node = makeNode({ id: 'C', name: 'Topic', examWeightagePercent: 5 });
    const priorityFar = computeTopicPriority(node, undefined, today, 180);
    const priorityNear = computeTopicPriority(node, undefined, today, 15);
    expect(priorityNear).toBeGreaterThan(priorityFar);
  });
});

// ─── Schedule Generation Tests ────────────────────────────────────────────────

describe('generateStudySchedule', () => {
  const today = new Date('2026-10-01');
  const examDate = addDays(today, 60);

  const nodes: SyllabusNode[] = [
    makeNode({ id: 'KIN', name: 'Kinematics', examWeightagePercent: 8, estimatedStudyMinutes: 60, estimatedPracticeMinutes: 30 }),
    makeNode({ id: 'NEWT', name: "Newton's Laws", examWeightagePercent: 7, prerequisiteNodeIds: ['KIN'], estimatedStudyMinutes: 60, estimatedPracticeMinutes: 30 }),
    makeNode({ id: 'WEP', name: 'Work Energy Power', examWeightagePercent: 6, prerequisiteNodeIds: ['NEWT'], estimatedStudyMinutes: 60, estimatedPracticeMinutes: 30 }),
  ];

  test('generates tasks within daily budget', () => {
    const input: PlannerInput = {
      userId: 'user-1',
      examDate,
      todayDate: today,
      dailyBudgetMinutes: 120,
      syllabusNodes: nodes,
      masteryMap: new Map(),
      existingTasksByDate: new Map(),
    };

    const tasks = generateStudySchedule(input);
    expect(tasks.length).toBeGreaterThan(0);

    // Verify no day exceeds 150% of budget
    const byDate = new Map<string, number>();
    for (const t of tasks) {
      byDate.set(t.scheduledDate, (byDate.get(t.scheduledDate) ?? 0) + t.estimatedMinutes);
    }
    for (const [, mins] of byDate) {
      expect(mins).toBeLessThanOrEqual(120 * 1.5);
    }
  });

  test('returns empty array when exam date is in the past', () => {
    const input: PlannerInput = {
      userId: 'user-1',
      examDate: addDays(today, -1),
      todayDate: today,
      dailyBudgetMinutes: 120,
      syllabusNodes: nodes,
      masteryMap: new Map(),
      existingTasksByDate: new Map(),
    };

    const tasks = generateStudySchedule(input);
    expect(tasks).toHaveLength(0);
  });

  test('weak topics (Elo < 1250) appear as PRACTICE tasks', () => {
    const masteryMap = new Map([
      ['KIN', makeMastery({ userId: 'u1', nodeId: 'KIN', eloRating: 1100, correctAttempts: 3, totalAttempts: 10 })],
    ]);

    const input: PlannerInput = {
      userId: 'user-1',
      examDate,
      todayDate: today,
      dailyBudgetMinutes: 240,
      syllabusNodes: nodes,
      masteryMap,
      existingTasksByDate: new Map(),
    };

    const tasks = generateStudySchedule(input);
    const kinPracticeTasks = tasks.filter((t) => t.nodeId === 'KIN' && t.kind === 'PRACTICE');
    expect(kinPracticeTasks.length).toBeGreaterThan(0);
  });

  test('all scheduled tasks have valid dates', () => {
    const input: PlannerInput = {
      userId: 'user-1',
      examDate,
      todayDate: today,
      dailyBudgetMinutes: 180,
      syllabusNodes: nodes,
      masteryMap: new Map(),
      existingTasksByDate: new Map(),
    };

    const tasks = generateStudySchedule(input);
    for (const task of tasks) {
      expect(task.scheduledDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(task.scheduledDate).getTime()).toBeGreaterThanOrEqual(today.getTime() - 86400000);
    }
  });
});

// ─── Plan Validation Tests ────────────────────────────────────────────────────

describe('validatePlan', () => {
  const today = new Date('2026-10-01');
  const examDate = addDays(today, 60);
  const nodes = [makeNode({ id: 'A', name: 'Topic A', examWeightagePercent: 10 })];

  test('valid plan passes with no errors', () => {
    const tasks = [
      {
        nodeId: 'A',
        topicName: 'Topic A',
        scheduledDate: '2026-10-05',
        kind: 'PRACTICE' as const,
        targetQuantity: 10,
        estimatedMinutes: 30,
        priority: 5,
        reason: 'test',
      },
    ];

    const result = validatePlan(tasks, nodes, 120, examDate, today);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('tasks past exam date fail validation', () => {
    const tasks = [
      {
        nodeId: 'A',
        topicName: 'Topic A',
        scheduledDate: '2027-01-01',
        kind: 'PRACTICE' as const,
        targetQuantity: 10,
        estimatedMinutes: 30,
        priority: 5,
        reason: 'test',
      },
    ];

    const result = validatePlan(tasks, nodes, 120, examDate, today);
    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining('after exam date')]));
  });

  test('over-budget days produce errors', () => {
    const tasks = Array.from({ length: 10 }, (_, i) => ({
      nodeId: 'A',
      topicName: 'Topic A',
      scheduledDate: '2026-10-05',
      kind: 'PRACTICE' as const,
      targetQuantity: 10,
      estimatedMinutes: 60, // 10 × 60 = 600 min, way over budget
      priority: 5,
      reason: 'test',
    }));

    const result = validatePlan(tasks, nodes, 120, examDate, today);
    expect(result.isValid).toBe(false);
  });
});
