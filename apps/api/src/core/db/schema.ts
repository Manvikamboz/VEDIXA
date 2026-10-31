/**
 * VEDIXA Database Schema — Drizzle ORM
 *
 * Implements the full MVP data model from the architecture blueprint.
 * Key design decisions:
 *  - UUIDv4 PKs for all user-facing entities (client-side generation for offline test sync)
 *  - question_responses is NOT partitioned here (Drizzle doesn't support it natively;
 *    partitioning is handled via a raw migration SQL file)
 *  - pgvector columns use the `vector` custom type
 *  - All timestamps in UTC
 */

import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  boolean,
  integer,
  text,
  jsonb,
  timestamp,
  date,
  numeric,
  uniqueIndex,
  index,
  primaryKey,
  smallint,
  customType,
} from 'drizzle-orm/pg-core';

// ─── pgvector custom type ─────────────────────────────────────────────────────
const vector = customType<{ data: number[]; driverData: string }>({
  dataType(config) {
    const dim = (config as { dimensions?: number } | undefined)?.dimensions ?? 768;
    return `vector(${dim})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    return value
      .replace(/^\[/, '')
      .replace(/\]$/, '')
      .split(',')
      .map(Number);
  },
});

// ─── Enums ────────────────────────────────────────────────────────────────────

export const examTypeEnum = pgEnum('exam_type', [
  'JEE_MAIN',
  'JEE_ADV',
  'NEET_UG',
  'NDA',
  'CUET',
  'CBSE_10',
  'CBSE_12',
]);

export const questionKindEnum = pgEnum('question_kind', [
  'SINGLE_CHOICE',
  'MULTI_CHOICE',
  'NUMERICAL',
  'ASSERTION_REASON',
  'MATRIX_MATCH',
]);

export const difficultyTierEnum = pgEnum('difficulty_tier', [
  'EASY',
  'MEDIUM',
  'HARD',
  'EXTREME',
]);

export const attemptStatusEnum = pgEnum('attempt_status', [
  'IN_PROGRESS',
  'SUBMITTED',
  'EVALUATED',
  'ABANDONED',
]);

export const taskKindEnum = pgEnum('task_kind', ['LEARN', 'PRACTICE', 'REVISE', 'DIAGNOSTIC']);

export const planTierEnum = pgEnum('plan_tier', ['FREE', 'PRO_MONTHLY', 'PRO_ANNUAL']);

export const userRoleEnum = pgEnum('user_role', [
  'STUDENT',
  'ADMIN',
  'CONTENT_EDITOR',
  'MODERATOR',
]);

export const verificationStatusEnum = pgEnum('verification_status', [
  'PENDING',
  'VERIFIED',
  'FLAGGED',
]);

export const subjectIdEnum = pgEnum('subject_id', [
  'PHYSICS',
  'CHEMISTRY',
  'MATHEMATICS',
  'BIOLOGY',
  'ENGLISH',
  'GK',
]);

export const moderationStatusEnum = pgEnum('moderation_status', [
  'VISIBLE',
  'PENDING_REVIEW',
  'REMOVED',
  'SHADOW_BANNED',
]);

// ─── 1. Identity ──────────────────────────────────────────────────────────────

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    phoneHash: varchar('phone_hash', { length: 64 }).notNull(), // SHA-256 for lookup
    phoneEncrypted: text('phone_encrypted').notNull(), // AES-256-GCM ciphertext
    name: varchar('name', { length: 100 }).notNull(),
    role: userRoleEnum('role').notNull().default('STUDENT'),
    isMinor: boolean('is_minor').notNull().default(true),
    parentPhoneHash: varchar('parent_phone_hash', { length: 64 }),
    parentPhoneEncrypted: text('parent_phone_encrypted'),
    parentConsentGrantedAt: timestamp('parent_consent_granted_at', { withTimezone: true }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    phoneHashIdx: uniqueIndex('users_phone_hash_idx').on(t.phoneHash),
  }),
);

export const studentProfiles = pgTable('student_profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  targetExam: examTypeEnum('target_exam').notNull(),
  targetYear: integer('target_year').notNull(),
  classGrade: integer('class_grade').notNull(), // 9-13 (13=dropper)
  languagePreference: varchar('language_preference', { length: 10 }).notNull().default('en'),
  dailyBudgetMinutes: integer('daily_budget_minutes').notNull().default(120),
  overallElo: integer('overall_elo').notNull().default(1200),
  onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// OTP management — separate table for security isolation
export const otpTokens = pgTable(
  'otp_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    phoneHash: varchar('phone_hash', { length: 64 }).notNull(),
    otpHash: varchar('otp_hash', { length: 64 }).notNull(), // SHA-256 of OTP
    token: varchar('token', { length: 64 }).notNull(), // Server-side reference token
    purpose: varchar('purpose', { length: 32 }).notNull(), // 'LOGIN' | 'PARENTAL_CONSENT'
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    attempts: smallint('attempts').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    phoneHashIdx: index('otp_tokens_phone_hash_idx').on(t.phoneHash),
    tokenIdx: uniqueIndex('otp_tokens_token_idx').on(t.token),
  }),
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tokenHashIdx: uniqueIndex('refresh_tokens_token_hash_idx').on(t.tokenHash),
    userIdIdx: index('refresh_tokens_user_id_idx').on(t.userId),
  }),
);

// ─── 2. Content: Subjects, Syllabus, Questions ─────────────────────────────────

export const subjects = pgTable('subjects', {
  id: subjectIdEnum('id').primaryKey(),
  name: varchar('name', { length: 64 }).notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const syllabusNodes = pgTable(
  'syllabus_nodes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    exam: examTypeEnum('exam').notNull(),
    subjectId: subjectIdEnum('subject_id').notNull().references(() => subjects.id),
    // ltree-style path stored as text; ltree queries via raw SQL
    path: text('path').notNull(), // e.g. 'Physics.Mechanics.Kinematics'
    name: varchar('name', { length: 128 }).notNull(),
    examWeightagePercent: numeric('exam_weightage_percent', { precision: 4, scale: 2 })
      .notNull()
      .default('0.00'),
    prerequisiteNodeIds: uuid('prerequisite_node_ids').array().default([]),
    ncertChapterRef: varchar('ncert_chapter_ref', { length: 64 }),
    estimatedStudyMinutes: integer('estimated_study_minutes').notNull().default(60),
    estimatedPracticeMinutes: integer('estimated_practice_minutes').notNull().default(30),
    depth: integer('depth').notNull().default(0), // 0=subject, 1=unit, 2=chapter, 3=topic
    parentNodeId: uuid('parent_node_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    examIdx: index('syllabus_nodes_exam_idx').on(t.exam),
    subjectIdx: index('syllabus_nodes_subject_idx').on(t.subjectId),
    examSubjectIdx: index('syllabus_nodes_exam_subject_idx').on(t.exam, t.subjectId),
  }),
);

export const questions = pgTable(
  'questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nodeId: uuid('node_id')
      .notNull()
      .references(() => syllabusNodes.id),
    kind: questionKindEnum('kind').notNull(),
    difficulty: difficultyTierEnum('difficulty').notNull(),
    contentLatex: text('content_latex').notNull(),
    diagramUrls: text('diagram_urls').array().default([]),
    markingScheme: jsonb('marking_scheme')
      .notNull()
      .$type<{ correct: number; incorrect: number; unattempted: number }>(),
    pyqMetadata: jsonb('pyq_metadata')
      .$type<{ exam: string; year: number; shift?: number; paperCode?: string }>(),
    verificationStatus: verificationStatusEnum('verification_status').notNull().default('PENDING'),
    verifiedByUserId: uuid('verified_by_user_id').references(() => users.id),
    flagCount: integer('flag_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    nodeIdx: index('questions_node_idx').on(t.nodeId),
    difficultyIdx: index('questions_difficulty_idx').on(t.difficulty),
    nodeKindDiffIdx: index('questions_node_kind_diff_idx').on(t.nodeId, t.kind, t.difficulty),
    verificationIdx: index('questions_verification_idx').on(t.verificationStatus),
  }),
);

export const questionOptions = pgTable(
  'question_options',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    optionIndex: smallint('option_index').notNull(), // 0=A, 1=B, 2=C, 3=D
    contentLatex: text('content_latex').notNull(),
    isCorrect: boolean('is_correct').notNull(),
    explanationLatex: text('explanation_latex'),
  },
  (t) => ({
    questionIdx: index('question_options_question_idx').on(t.questionId),
  }),
);

export const questionSolutions = pgTable('question_solutions', {
  questionId: uuid('question_id')
    .primaryKey()
    .references(() => questions.id, { onDelete: 'cascade' }),
  solutionLatex: text('solution_latex').notNull(),
  stepBreakdown: jsonb('step_breakdown')
    .notNull()
    .$type<Array<{ step: number; title: string; contentLatex: string }>>()
    .default([]),
  verifiedByUserId: uuid('verified_by_user_id').references(() => users.id),
  embedding: vector('embedding', { dimensions: 768 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Exam configuration table — multi-exam via config, not code branches
export const examConfigs = pgTable('exam_configs', {
  examCode: examTypeEnum('exam_code').primaryKey(),
  displayName: varchar('display_name', { length: 64 }).notNull(),
  markingEngine: varchar('marking_engine', { length: 64 }).notNull(),
  config: jsonb('config').notNull().$type<{
    sections: Array<{
      subject: string;
      parts: Array<{
        kind: string;
        mandatoryCount: number;
        selectableCount: number;
        correctDelta: number;
        incorrectDelta: number;
      }>;
    }>;
    timer: { totalMinutes: number; lockPerSection: boolean };
  }>(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── 3. Assessments ───────────────────────────────────────────────────────────

export const tests = pgTable(
  'tests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: varchar('title', { length: 255 }).notNull(),
    exam: examTypeEnum('exam').notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    totalMarks: integer('total_marks').notNull(),
    isLive: boolean('is_live').notNull().default(false),
    rulesConfig: jsonb('rules_config').notNull().$type<{
      sections: Array<{
        subject: string;
        parts: Array<{
          kind: string;
          mandatoryCount: number;
          selectableCount: number;
          correctDelta: number;
          incorrectDelta: number;
        }>;
        questionIds: string[];
      }>;
    }>(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    examIdx: index('tests_exam_idx').on(t.exam),
  }),
);

export const testAttempts = pgTable(
  'test_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    testId: uuid('test_id')
      .notNull()
      .references(() => tests.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    status: attemptStatusEnum('status').notNull().default('IN_PROGRESS'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    serverDeadlineAt: timestamp('server_deadline_at', { withTimezone: true }).notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    totalScore: numeric('total_score', { precision: 6, scale: 2 }),
    percentileEstimate: numeric('percentile_estimate', { precision: 5, scale: 2 }),
    accuracyPercentage: numeric('accuracy_percentage', { precision: 5, scale: 2 }),
    clientDeviceMetadata: jsonb('client_device_metadata'),
  },
  (t) => ({
    userIdIdx: index('test_attempts_user_id_idx').on(t.userId),
    testIdIdx: index('test_attempts_test_id_idx').on(t.testId),
    userTestIdx: uniqueIndex('test_attempts_user_test_active_idx').on(t.userId, t.testId, t.status),
  }),
);

// High-volume response table — partitioned by created_at (see migration SQL for partition DDL)
export const questionResponses = pgTable(
  'question_responses',
  {
    id: uuid('id').notNull().defaultRandom(),
    attemptId: uuid('attempt_id').notNull().references(() => testAttempts.id),
    userId: uuid('user_id').notNull().references(() => users.id),
    questionId: uuid('question_id').notNull().references(() => questions.id),
    selectedOptionIds: uuid('selected_option_ids').array().default([]),
    numericalAnswer: numeric('numerical_answer', { precision: 15, scale: 6 }),
    isCorrect: boolean('is_correct').notNull(),
    markedForReview: boolean('marked_for_review').notNull().default(false),
    timeSpentSeconds: integer('time_spent_seconds').notNull().default(0),
    earnedMarks: numeric('earned_marks', { precision: 4, scale: 2 }),
    idempotencyKey: varchar('idempotency_key', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.id, t.createdAt] }),
    idempotencyIdx: uniqueIndex('question_responses_idempotency_idx').on(
      t.idempotencyKey,
      t.attemptId,
    ),
    userAttemptIdx: index('question_responses_user_attempt_idx').on(t.userId, t.attemptId),
    attemptIdx: index('question_responses_attempt_idx').on(t.attemptId),
  }),
);

// ─── 4. Mastery ───────────────────────────────────────────────────────────────

export const derivedTopicMastery = pgTable(
  'derived_topic_mastery',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    nodeId: uuid('node_id')
      .notNull()
      .references(() => syllabusNodes.id, { onDelete: 'cascade' }),
    eloRating: integer('elo_rating').notNull().default(1200),
    confidenceInterval: numeric('confidence_interval', { precision: 4, scale: 2 })
      .notNull()
      .default('0.50'),
    totalAttempts: integer('total_attempts').notNull().default(0),
    correctAttempts: integer('correct_attempts').notNull().default(0),
    lastPracticedAt: timestamp('last_practiced_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.nodeId] }),
    userIdIdx: index('mastery_user_id_idx').on(t.userId),
    eloIdx: index('mastery_elo_idx').on(t.userId, t.eloRating),
  }),
);

// ─── 5. Planner & Roadmap ─────────────────────────────────────────────────────

export const roadmaps = pgTable(
  'roadmaps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    exam: examTypeEnum('exam').notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
    targetCompletionDate: date('target_completion_date').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    llmEnrichmentNote: text('llm_enrichment_note'), // LLM-generated daily motivation note
  },
  (t) => ({
    userIdx: index('roadmaps_user_idx').on(t.userId),
    userActiveIdx: index('roadmaps_user_active_idx').on(t.userId, t.isActive),
  }),
);

export const studyTasks = pgTable(
  'study_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roadmapId: uuid('roadmap_id')
      .notNull()
      .references(() => roadmaps.id, { onDelete: 'cascade' }),
    nodeId: uuid('node_id')
      .notNull()
      .references(() => syllabusNodes.id),
    scheduledDate: date('scheduled_date').notNull(),
    kind: taskKindEnum('kind').notNull(),
    targetQuantity: integer('target_quantity').notNull().default(10),
    completedQuantity: integer('completed_quantity').notNull().default(0),
    isCompleted: boolean('is_completed').notNull().default(false),
    priority: integer('priority').notNull().default(1),
    estimatedMinutes: integer('estimated_minutes').notNull().default(30),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    roadmapDateIdx: index('study_tasks_roadmap_date_idx').on(t.roadmapId, t.scheduledDate),
    completionIdx: index('study_tasks_completion_idx').on(t.roadmapId, t.isCompleted),
  }),
);

// ─── 6. AI Mentor ─────────────────────────────────────────────────────────────

export const aiChatSessions = pgTable(
  'ai_chat_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    questionContextId: uuid('question_context_id').references(() => questions.id),
    topicNodeId: uuid('topic_node_id').references(() => syllabusNodes.id),
    title: varchar('title', { length: 128 }).notNull().default('Doubt Session'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('ai_chat_sessions_user_idx').on(t.userId),
  }),
);

export const aiChatMessages = pgTable(
  'ai_chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => aiChatSessions.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 16 }).notNull(), // 'user' | 'assistant' | 'system'
    contentText: text('content_text').notNull(),
    imageUrl: text('image_url'),
    tokensConsumed: integer('tokens_consumed').notNull().default(0),
    costRupees: numeric('cost_rupees', { precision: 8, scale: 4 }).notNull().default('0'),
    cacheHit: boolean('cache_hit').notNull().default(false),
    modelUsed: varchar('model_used', { length: 64 }),
    feedbackRating: smallint('feedback_rating'), // -1 (thumb down) | 1 (thumb up)
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sessionIdx: index('ai_chat_messages_session_idx').on(t.sessionId, t.createdAt),
  }),
);

// Daily AI usage metering (reset at midnight IST)
export const aiUsageMetrics = pgTable(
  'ai_usage_metrics',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    doubtsUsed: integer('doubts_used').notNull().default(0),
    tokensUsed: integer('tokens_used').notNull().default(0),
    costRupees: numeric('cost_rupees', { precision: 8, scale: 4 }).notNull().default('0'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.date] }),
  }),
);

// ─── 7. Gamification ──────────────────────────────────────────────────────────

export const xpLedger = pgTable(
  'xp_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    delta: integer('delta').notNull(),
    reason: varchar('reason', { length: 64 }).notNull(),
    referenceId: uuid('reference_id'), // e.g. attempt_id or task_id
    idempotencyKey: varchar('idempotency_key', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('xp_ledger_user_idx').on(t.userId),
    idempotencyIdx: uniqueIndex('xp_ledger_idempotency_idx').on(t.idempotencyKey),
  }),
);

export const userStreaks = pgTable('user_streaks', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  currentStreak: integer('current_streak').notNull().default(0),
  longestStreak: integer('longest_streak').notNull().default(0),
  freezeTokensAvailable: integer('freeze_tokens_available').notNull().default(1),
  lastActivityDate: date('last_activity_date').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userBadges = pgTable(
  'user_badges',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    badgeId: varchar('badge_id', { length: 64 }).notNull(),
    awardedAt: timestamp('awarded_at', { withTimezone: true }).notNull().defaultNow(),
    referenceId: uuid('reference_id'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.badgeId] }),
    userIdx: index('user_badges_user_idx').on(t.userId),
  }),
);

// ─── 8. Subscriptions ─────────────────────────────────────────────────────────

export const subscriptions = pgTable('subscriptions', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  planTier: planTierEnum('plan_tier').notNull().default('FREE'),
  dailyAiDoubtsQuota: integer('daily_ai_doubts_quota').notNull().default(3),
  validUntil: timestamp('valid_until', { withTimezone: true }),
  razorpaySubscriptionId: varchar('razorpay_subscription_id', { length: 64 }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── 9. Community ─────────────────────────────────────────────────────────────

export const communityPosts = pgTable(
  'community_posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    exam: examTypeEnum('exam').notNull(),
    subject: subjectIdEnum('subject'),
    title: varchar('title', { length: 300 }).notNull(),
    contentMarkdown: text('content_markdown').notNull(),
    questionReferenceId: uuid('question_reference_id').references(() => questions.id),
    upvoteCount: integer('upvote_count').notNull().default(0),
    commentCount: integer('comment_count').notNull().default(0),
    moderationStatus: moderationStatusEnum('moderation_status').notNull().default('VISIBLE'),
    reportCount: integer('report_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    examIdx: index('community_posts_exam_idx').on(t.exam),
    moderationIdx: index('community_posts_moderation_idx').on(t.moderationStatus),
  }),
);

export const communityComments = pgTable(
  'community_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id')
      .notNull()
      .references(() => communityPosts.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    parentCommentId: uuid('parent_comment_id'),
    contentMarkdown: text('content_markdown').notNull(),
    upvoteCount: integer('upvote_count').notNull().default(0),
    moderationStatus: moderationStatusEnum('moderation_status').notNull().default('VISIBLE'),
    reportCount: integer('report_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    postIdx: index('community_comments_post_idx').on(t.postId),
  }),
);

export const contentReports = pgTable(
  'content_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reportedByUserId: uuid('reported_by_user_id')
      .notNull()
      .references(() => users.id),
    contentType: varchar('content_type', { length: 16 }).notNull(), // 'POST' | 'COMMENT'
    contentId: uuid('content_id').notNull(),
    reason: varchar('reason', { length: 32 }).notNull(),
    details: text('details'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedByUserId: uuid('resolved_by_user_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    contentIdx: index('content_reports_content_idx').on(t.contentType, t.contentId),
  }),
);

// ─── 10. Notifications ────────────────────────────────────────────────────────

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 64 }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    body: text('body').notNull(),
    payload: jsonb('payload'),
    isRead: boolean('is_read').notNull().default(false),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userUnreadIdx: index('notifications_user_unread_idx').on(t.userId, t.isRead),
  }),
);

// ─── 11. Audit Log (DPDP Act 2023 compliance) ────────────────────────────────

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(), // NOT a FK — we keep logs even after user deletion
    action: varchar('action', { length: 64 }).notNull(),
    actorIp: varchar('actor_ip', { length: 45 }).notNull(),
    payload: jsonb('payload').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('audit_logs_user_idx').on(t.userId),
    actionIdx: index('audit_logs_action_idx').on(t.action),
    createdAtIdx: index('audit_logs_created_at_idx').on(t.createdAt),
  }),
);
