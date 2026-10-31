/**
 * Syllabus DAG — Deterministic Study Planner Core Engine
 *
 * Responsibilities:
 *  1. Topological sort of prerequisite topics
 *  2. SM-2 spaced repetition interval calculation
 *  3. Weakness-weighted task prioritization
 *  4. Schedule generation given daily time budget
 */

import { addDays, differenceInDays, format, parseISO, isAfter, isBefore } from 'date-fns';

import type { TaskKind, StudyTask, TopicMastery } from '@vedixa/types';

// ─── Core Data Structures ──────────────────────────────────────────────────────

export interface SyllabusNode {
  id: string;
  name: string;
  subjectId: string;
  examWeightagePercent: number;
  prerequisiteNodeIds: string[];
  estimatedStudyMinutes: number; // baseline minutes to LEARN this topic
  estimatedPracticeMinutes: number; // minutes for 10 questions
}

export interface PlannerInput {
  userId: string;
  examDate: Date;
  todayDate: Date;
  dailyBudgetMinutes: number;
  syllabusNodes: SyllabusNode[];
  masteryMap: Map<string, TopicMastery>; // nodeId → mastery
  existingTasksByDate: Map<string, StudyTask[]>; // ISO date → tasks
}

export interface GeneratedTask {
  nodeId: string;
  topicName: string;
  scheduledDate: string;
  kind: TaskKind;
  targetQuantity: number;
  estimatedMinutes: number;
  priority: number;
  reason: string;
}

// ─── SM-2 Spaced Repetition ────────────────────────────────────────────────────

const SM2_INTERVALS_DAYS = [1, 3, 7, 14, 21, 30] as const;

/**
 * Returns the next review date for a topic based on current accuracy.
 * Uses a simplified SM-2 algorithm: review interval depends on mastery Elo.
 */
export function getNextReviewDate(
  lastPracticedAt: string | null,
  todayDate: Date,
  eloRating: number,
  correctAttempts: number,
  totalAttempts: number,
): Date {
  if (!lastPracticedAt) return todayDate;

  const accuracy = totalAttempts > 0 ? correctAttempts / totalAttempts : 0;
  const daysSince = differenceInDays(todayDate, parseISO(lastPracticedAt));

  // Select interval index based on accuracy (0–5)
  let intervalIndex: number;
  if (accuracy >= 0.9 && eloRating >= 1400) {
    intervalIndex = 5; // 30 days — mastered, long interval
  } else if (accuracy >= 0.75 && eloRating >= 1300) {
    intervalIndex = 4; // 21 days
  } else if (accuracy >= 0.6 && eloRating >= 1200) {
    intervalIndex = 3; // 14 days
  } else if (accuracy >= 0.5) {
    intervalIndex = 2; // 7 days
  } else if (accuracy >= 0.3) {
    intervalIndex = 1; // 3 days
  } else {
    intervalIndex = 0; // 1 day — struggling, daily review
  }

  const interval = SM2_INTERVALS_DAYS[intervalIndex] ?? 1;
  const dueDate = addDays(parseISO(lastPracticedAt), interval);

  // If already overdue, schedule for today
  if (isBefore(dueDate, todayDate)) return todayDate;
  return dueDate;
}

// ─── Topological Sort ─────────────────────────────────────────────────────────

/**
 * Returns syllabus nodes in topological order (prerequisites before dependents).
 * Detects and throws on circular dependencies.
 */
export function topologicalSort(nodes: SyllabusNode[]): SyllabusNode[] {
  const nodeMap = new Map<string, SyllabusNode>(nodes.map((n) => [n.id, n]));
  const visited = new Set<string>();
  const visiting = new Set<string>(); // For cycle detection
  const result: SyllabusNode[] = [];

  function visit(id: string): void {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      throw new Error(`Circular dependency detected in syllabus DAG at node: ${id}`);
    }

    visiting.add(id);
    const node = nodeMap.get(id);
    if (!node) {
      visiting.delete(id);
      return; // Skip unknown prerequisite references
    }

    for (const prereqId of node.prerequisiteNodeIds) {
      visit(prereqId);
    }

    visiting.delete(id);
    visited.add(id);
    result.push(node);
  }

  for (const node of nodes) {
    visit(node.id);
  }

  return result;
}

// ─── Priority Scoring ─────────────────────────────────────────────────────────

/**
 * Computes a priority score for a topic, combining:
 *  - Exam weightage (40%)
 *  - Mastery deficit / weakness (40%)
 *  - Days since last review (20%)
 *
 * Higher score = schedule sooner.
 */
export function computeTopicPriority(
  node: SyllabusNode,
  mastery: TopicMastery | undefined,
  todayDate: Date,
  daysToExam: number,
): number {
  const weightageScore = node.examWeightagePercent / 10; // normalize 0-10

  const elo = mastery?.eloRating ?? 1200;
  const masteryDeficit = Math.max(0, (1600 - elo) / 400); // 0.0 (mastered) to 1.0+ (novice)

  let recencyScore = 0;
  if (mastery?.lastPracticedAt) {
    const daysSince = differenceInDays(todayDate, parseISO(mastery.lastPracticedAt));
    // Scale: 0 days → 0 score, 30+ days → 1.0
    recencyScore = Math.min(daysSince / 30, 1.0);
  } else {
    recencyScore = 1.0; // Never practiced = highest urgency
  }

  // Urgency multiplier: topics closer to exam get higher weight
  const urgencyMultiplier = daysToExam < 30 ? 1.5 : daysToExam < 90 ? 1.2 : 1.0;

  const rawScore =
    urgencyMultiplier * (0.4 * weightageScore + 0.4 * masteryDeficit * 10 + 0.2 * recencyScore * 10);

  return Math.round(rawScore * 100) / 100;
}

// ─── Main Schedule Generator ──────────────────────────────────────────────────

/**
 * Primary engine function: generates daily task schedule.
 *
 * Algorithm:
 *  1. Topologically sort syllabus nodes
 *  2. Identify topics needing revision (SM-2 due)
 *  3. Identify weak topics (Elo < 1250 and weightage > 2%)
 *  4. Identify unstarted topics
 *  5. Score & sort all candidates by priority
 *  6. Pack tasks into daily budget respecting minute constraints
 */
export function generateStudySchedule(input: PlannerInput): GeneratedTask[] {
  const {
    examDate,
    todayDate,
    dailyBudgetMinutes,
    syllabusNodes,
    masteryMap,
    existingTasksByDate,
  } = input;

  const daysToExam = differenceInDays(examDate, todayDate);
  if (daysToExam <= 0) return []; // Exam is past

  // Step 1: Sort topologically
  const sortedNodes = topologicalSort(syllabusNodes);

  // Step 2: Categorize nodes
  interface CandidateTask {
    node: SyllabusNode;
    mastery: TopicMastery | undefined;
    kind: TaskKind;
    scheduledDate: Date;
    priority: number;
    reason: string;
  }

  const candidates: CandidateTask[] = [];

  for (const node of sortedNodes) {
    const mastery = masteryMap.get(node.id);

    // a) SM-2 revision due
    const nextReviewDate = getNextReviewDate(
      mastery?.lastPracticedAt ?? null,
      todayDate,
      mastery?.eloRating ?? 1200,
      mastery?.correctAttempts ?? 0,
      mastery?.totalAttempts ?? 0,
    );

    if (!isAfter(nextReviewDate, addDays(todayDate, daysToExam))) {
      const priority = computeTopicPriority(node, mastery, todayDate, daysToExam);

      if (mastery && mastery.totalAttempts > 0) {
        // Already practiced — schedule revision
        candidates.push({
          node,
          mastery,
          kind: 'REVISE',
          scheduledDate: nextReviewDate < todayDate ? todayDate : nextReviewDate,
          priority: priority * 1.2, // Boost revision priority slightly
          reason: `SM-2 spaced review (accuracy: ${mastery.totalAttempts > 0 ? Math.round((mastery.correctAttempts / mastery.totalAttempts) * 100) : 0}%)`,
        });
      } else {
        // Never practiced — schedule learning
        candidates.push({
          node,
          mastery,
          kind: 'LEARN',
          scheduledDate: todayDate,
          priority,
          reason: `Not yet started. Exam weightage: ${node.examWeightagePercent}%`,
        });
      }
    }

    // b) Weak topics needing practice (even if recently reviewed)
    const elo = mastery?.eloRating ?? 1200;
    if (elo < 1250 && node.examWeightagePercent >= 2 && (mastery?.totalAttempts ?? 0) > 0) {
      candidates.push({
        node,
        mastery,
        kind: 'PRACTICE',
        scheduledDate: todayDate,
        priority: computeTopicPriority(node, mastery, todayDate, daysToExam) * 1.5,
        reason: `Weak topic (Elo: ${elo}). Target high-weightage improvement.`,
      });
    }
  }

  // Step 3: Sort by date then priority
  candidates.sort((a, b) => {
    const dateDiff = a.scheduledDate.getTime() - b.scheduledDate.getTime();
    if (dateDiff !== 0) return dateDiff;
    return b.priority - a.priority;
  });

  // Step 4: Pack tasks into budget by date
  const tasks: GeneratedTask[] = [];
  const minutesByDate = new Map<string, number>();

  // Pre-populate with existing committed tasks
  for (const [date, existing] of existingTasksByDate) {
    const usedMinutes = existing.reduce((sum, t) => {
      const node = sortedNodes.find((n) => n.id === t.nodeId);
      return sum + (node?.estimatedPracticeMinutes ?? 20);
    }, 0);
    minutesByDate.set(date, usedMinutes);
  }

  for (const candidate of candidates) {
    let targetDate = candidate.scheduledDate;
    let placed = false;

    // Try up to 14 days forward to find a slot
    for (let offset = 0; offset < 14 && !placed; offset++) {
      const tryDate = addDays(targetDate, offset);

      // Don't schedule past the exam
      if (isAfter(tryDate, examDate)) break;

      const dateStr = format(tryDate, 'yyyy-MM-dd');
      const used = minutesByDate.get(dateStr) ?? 0;

      const taskMinutes =
        candidate.kind === 'LEARN'
          ? candidate.node.estimatedStudyMinutes
          : candidate.node.estimatedPracticeMinutes;

      if (used + taskMinutes <= dailyBudgetMinutes) {
        minutesByDate.set(dateStr, used + taskMinutes);

        const targetQty = candidate.kind === 'LEARN' ? 1 : 10; // 1 = study session, 10 = practice questions

        tasks.push({
          nodeId: candidate.node.id,
          topicName: candidate.node.name,
          scheduledDate: dateStr,
          kind: candidate.kind,
          targetQuantity: targetQty,
          estimatedMinutes: taskMinutes,
          priority: Math.round(candidate.priority),
          reason: candidate.reason,
        });

        placed = true;
      }
    }
  }

  return tasks;
}

// ─── Validation ───────────────────────────────────────────────────────────────

export interface PlanValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  coveragePercent: number;
  totalScheduledMinutes: number;
  topicsScheduled: number;
  topicsUnscheduled: string[];
}

/**
 * Validates a generated plan against constraints.
 * Called after LLM enrichment to catch any violations.
 */
export function validatePlan(
  tasks: GeneratedTask[],
  nodes: SyllabusNode[],
  dailyBudgetMinutes: number,
  examDate: Date,
  todayDate: Date,
): PlanValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check 1: No tasks scheduled after exam date
  for (const task of tasks) {
    if (isAfter(parseISO(task.scheduledDate), examDate)) {
      errors.push(`Task for "${task.topicName}" scheduled after exam date.`);
    }
    if (isBefore(parseISO(task.scheduledDate), todayDate)) {
      errors.push(`Task for "${task.topicName}" scheduled in the past.`);
    }
  }

  // Check 2: No single day exceeds 150% of daily budget
  const minutesByDate = new Map<string, number>();
  for (const task of tasks) {
    minutesByDate.set(
      task.scheduledDate,
      (minutesByDate.get(task.scheduledDate) ?? 0) + task.estimatedMinutes,
    );
  }
  for (const [date, mins] of minutesByDate) {
    if (mins > dailyBudgetMinutes * 1.5) {
      errors.push(`Over-scheduled on ${date}: ${mins} min > 150% budget.`);
    } else if (mins > dailyBudgetMinutes) {
      warnings.push(`Slightly over budget on ${date}: ${mins}/${dailyBudgetMinutes} min.`);
    }
  }

  // Check 3: Coverage
  const scheduledNodeIds = new Set(tasks.map((t) => t.nodeId));
  const highWeightageUnscheduled = nodes
    .filter((n) => n.examWeightagePercent >= 3 && !scheduledNodeIds.has(n.id))
    .map((n) => n.name);

  if (highWeightageUnscheduled.length > 0) {
    warnings.push(
      `High-weightage topics unscheduled: ${highWeightageUnscheduled.slice(0, 5).join(', ')}`,
    );
  }

  const totalMinutes = tasks.reduce((sum, t) => sum + t.estimatedMinutes, 0);
  const coveragePercent =
    nodes.length > 0 ? Math.round((scheduledNodeIds.size / nodes.length) * 100) : 0;

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    coveragePercent,
    totalScheduledMinutes: totalMinutes,
    topicsScheduled: scheduledNodeIds.size,
    topicsUnscheduled: highWeightageUnscheduled,
  };
}

export { format, addDays, differenceInDays, parseISO };
