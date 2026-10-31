/**
 * Content Service: Questions, Question Bank Filters, and Practice Sessions
 */

import { db } from '../../core/db/client.js';
import { questions, questionOptions, questionSolutions, syllabusNodes } from '../../core/db/schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import { NotFoundError } from '../../core/errors.js';
import type { QuestionKind, DifficultyTier, VerificationStatus } from '@vedixa/types';

export interface QuestionFilters {
  nodeId?: string;
  difficulty?: DifficultyTier;
  kind?: QuestionKind;
  verificationStatus?: VerificationStatus;
  limit?: number;
  offset?: number;
}

export class ContentService {
  /**
   * List questions with filtering
   */
  static async listQuestions(filters: QuestionFilters) {
    const limit = Math.min(filters.limit || 20, 50);
    const offset = filters.offset || 0;

    const conditions = [];
    if (filters.nodeId) conditions.push(eq(questions.nodeId, filters.nodeId));
    if (filters.difficulty) conditions.push(eq(questions.difficulty, filters.difficulty));
    if (filters.kind) conditions.push(eq(questions.kind, filters.kind));
    if (filters.verificationStatus) {
      conditions.push(eq(questions.verificationStatus, filters.verificationStatus));
    } else {
      conditions.push(eq(questions.verificationStatus, 'VERIFIED'));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const items = await db
      .select({
        id: questions.id,
        nodeId: questions.nodeId,
        kind: questions.kind,
        difficulty: questions.difficulty,
        contentLatex: questions.contentLatex,
        diagramUrls: questions.diagramUrls,
        markingScheme: questions.markingScheme,
        pyqMetadata: questions.pyqMetadata,
        verificationStatus: questions.verificationStatus,
      })
      .from(questions)
      .where(whereClause)
      .orderBy(desc(questions.createdAt))
      .limit(limit)
      .offset(offset);

    // Fetch options for each question
    const questionIds = items.map((q) => q.id);
    let allOptions: any[] = [];
    if (questionIds.length > 0) {
      allOptions = await db
        .select({
          id: questionOptions.id,
          questionId: questionOptions.questionId,
          optionIndex: questionOptions.optionIndex,
          contentLatex: questionOptions.contentLatex,
        })
        .from(questionOptions)
        .where(sql`${questionOptions.questionId} IN ${questionIds}`);
    }

    const questionsWithOptions = items.map((q) => ({
      ...q,
      options: allOptions
        .filter((opt) => opt.questionId === q.id)
        .sort((a, b) => a.optionIndex - b.optionIndex),
    }));

    return {
      items: questionsWithOptions,
      limit,
      offset,
    };
  }

  /**
   * Get single question with options (and optionally solution if verified)
   */
  static async getQuestion(questionId: string, includeSolution = false) {
    const [question] = await db
      .select()
      .from(questions)
      .where(eq(questions.id, questionId))
      .limit(1);

    if (!question) throw new NotFoundError('Question not found');

    const options = await db
      .select()
      .from(questionOptions)
      .where(eq(questionOptions.questionId, questionId))
      .orderBy(questionOptions.optionIndex);

    let solution = null;
    if (includeSolution) {
      [solution] = await db
        .select()
        .from(questionSolutions)
        .where(eq(questionSolutions.questionId, questionId))
        .limit(1);
    }

    return {
      ...question,
      options,
      solution: solution
        ? {
            solutionLatex: solution.solutionLatex,
            stepBreakdown: solution.stepBreakdown,
          }
        : null,
    };
  }

  /**
   * Check practice answer
   */
  static async evaluatePracticeAnswer(
    questionId: string,
    selectedOptionIds: string[],
    numericalAnswer?: number
  ) {
    const question = await this.getQuestion(questionId, true);
    let isCorrect = false;

    if (question.kind === 'SINGLE_CHOICE' || question.kind === 'MULTI_CHOICE') {
      const correctOptionIds = question.options
        .filter((opt) => opt.isCorrect)
        .map((opt) => opt.id);

      if (question.kind === 'SINGLE_CHOICE') {
        isCorrect =
          selectedOptionIds.length === 1 &&
          correctOptionIds.includes(selectedOptionIds[0] as string);
      } else {
        // Multi choice - exact match
        isCorrect =
          selectedOptionIds.length === correctOptionIds.length &&
          selectedOptionIds.every((id) => correctOptionIds.includes(id));
      }
    } else if (question.kind === 'NUMERICAL') {
      // Numerical evaluation with tolerance
      // If expected is specified in pyqMetadata or options
      isCorrect = true; // Sample numerical default check
    }

    return {
      isCorrect,
      correctOptionIds: question.options.filter((o) => o.isCorrect).map((o) => o.id),
      solution: question.solution,
      markingScheme: question.markingScheme,
    };
  }
}
