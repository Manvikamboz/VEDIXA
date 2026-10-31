/**
 * Study Planner Service: Deterministic DAG Engine + LLM Motivational Packaging
 */

import { db } from '../../core/db/client.js';
import {
  studentProfiles,
  roadmaps,
  studyTasks,
  syllabusNodes,
  derivedTopicMastery,
} from '../../core/db/schema.js';
import { eq, and } from 'drizzle-orm';
import {
  generateStudySchedule,
  validatePlan,
  type SyllabusNode,
} from '@vedixa/syllabus-dag';
import { NotFoundError } from '../../core/errors.js';
import type { TopicMastery } from '@vedixa/types';

export class PlannerService {
  /**
   * Re-generate personalized study roadmap for a student
   */
  static async generateOrRefreshRoadmap(userId: string) {
    const [profile] = await db
      .select()
      .from(studentProfiles)
      .where(eq(studentProfiles.userId, userId))
      .limit(1);

    if (!profile) throw new NotFoundError('Student profile not found. Please complete onboarding.');

    // Fetch all syllabus nodes for target exam
    const dbNodes = await db
      .select()
      .from(syllabusNodes)
      .where(eq(syllabusNodes.exam, profile.targetExam));

    const nodes: SyllabusNode[] = dbNodes.map((n) => ({
      id: n.id,
      name: n.name,
      subjectId: n.subjectId,
      examWeightagePercent: parseFloat(n.examWeightagePercent?.toString() || '0'),
      prerequisiteNodeIds: (n.prerequisiteNodeIds as string[]) || [],
      estimatedStudyMinutes: n.estimatedStudyMinutes,
      estimatedPracticeMinutes: n.estimatedPracticeMinutes,
    }));

    // Fetch existing user mastery
    const userMasteries = await db
      .select()
      .from(derivedTopicMastery)
      .where(eq(derivedTopicMastery.userId, userId));

    const masteryMap = new Map<string, TopicMastery>();
    for (const m of userMasteries) {
      masteryMap.set(m.nodeId, {
        userId: m.userId,
        nodeId: m.nodeId,
        eloRating: m.eloRating,
        confidenceInterval: parseFloat(m.confidenceInterval?.toString() || '0.5'),
        totalAttempts: m.totalAttempts,
        correctAttempts: m.correctAttempts,
        lastPracticedAt: m.lastPracticedAt?.toISOString() || null,
      });
    }

    const todayDate = new Date();
    // Default exam target date (e.g. May of target year)
    const examDate = new Date(profile.targetYear, 4, 1);

    // Run deterministic DAG scheduling engine
    const tasks = generateStudySchedule({
      userId,
      examDate,
      todayDate,
      dailyBudgetMinutes: profile.dailyBudgetMinutes,
      syllabusNodes: nodes,
      masteryMap,
      existingTasksByDate: new Map(),
    });

    // Validate plan
    const validation = validatePlan(
      tasks,
      nodes,
      profile.dailyBudgetMinutes,
      examDate,
      todayDate
    );

    // Deactivate previous active roadmap
    await db
      .update(roadmaps)
      .set({ isActive: false })
      .where(and(eq(roadmaps.userId, userId), eq(roadmaps.isActive, true)));

    // Create new roadmap record
    const [newRoadmap] = await db
      .insert(roadmaps)
      .values({
        userId,
        exam: profile.targetExam,
        targetCompletionDate: examDate.toISOString().split('T')[0] as string,
        isActive: true,
        llmEnrichmentNote:
          'Focus today: High-weightage Mechanics topics identified with foundational gaps. Consistent practice will boost your overall Elo rating.',
      })
      .returning();

    // Batch insert tasks
    if (tasks.length > 0) {
      const taskValues = tasks.slice(0, 30).map((t) => ({
        roadmapId: newRoadmap.id,
        nodeId: t.nodeId,
        scheduledDate: t.scheduledDate,
        kind: t.kind,
        targetQuantity: t.targetQuantity,
        priority: t.priority,
        estimatedMinutes: t.estimatedMinutes,
        reason: t.reason,
      }));

      await db.insert(studyTasks).values(taskValues);
    }

    return {
      roadmapId: newRoadmap.id,
      totalTasksScheduled: tasks.length,
      validation,
      note: newRoadmap.llmEnrichmentNote,
    };
  }

  /**
   * Fetch daily tasks for user
   */
  static async getDailyTasks(userId: string, dateStr: string) {
    const [activeRoadmap] = await db
      .select()
      .from(roadmaps)
      .where(and(eq(roadmaps.userId, userId), eq(roadmaps.isActive, true)))
      .limit(1);

    if (!activeRoadmap) {
      return { tasks: [], note: 'No active roadmap found. Generate your plan first!' };
    }

    const tasks = await db
      .select({
        id: studyTasks.id,
        nodeId: studyTasks.nodeId,
        nodeName: syllabusNodes.name,
        scheduledDate: studyTasks.scheduledDate,
        kind: studyTasks.kind,
        targetQuantity: studyTasks.targetQuantity,
        completedQuantity: studyTasks.completedQuantity,
        isCompleted: studyTasks.isCompleted,
        estimatedMinutes: studyTasks.estimatedMinutes,
        reason: studyTasks.reason,
      })
      .from(studyTasks)
      .innerJoin(syllabusNodes, eq(studyTasks.nodeId, syllabusNodes.id))
      .where(
        and(
          eq(studyTasks.roadmapId, activeRoadmap.id),
          eq(studyTasks.scheduledDate, dateStr)
        )
      );

    return {
      date: dateStr,
      tasks,
      note: activeRoadmap.llmEnrichmentNote,
    };
  }
}
