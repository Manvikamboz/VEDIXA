// ─── Exam & Academic Enums ────────────────────────────────────────────────────

export type ExamType =
  | 'JEE_MAIN'
  | 'JEE_ADV'
  | 'NEET_UG'
  | 'NDA'
  | 'CUET'
  | 'CBSE_10'
  | 'CBSE_12';

export type QuestionKind =
  | 'SINGLE_CHOICE'
  | 'MULTI_CHOICE'
  | 'NUMERICAL'
  | 'ASSERTION_REASON'
  | 'MATRIX_MATCH';

export type DifficultyTier = 'EASY' | 'MEDIUM' | 'HARD' | 'EXTREME';

export type BloomsLevel =
  | 'RECALL'
  | 'UNDERSTANDING'
  | 'APPLICATION'
  | 'ANALYSIS';

export type SubjectId = 'PHYSICS' | 'CHEMISTRY' | 'MATHEMATICS' | 'BIOLOGY' | 'ENGLISH' | 'GK';

export type VerificationStatus = 'PENDING' | 'VERIFIED' | 'FLAGGED';

// ─── User & Profile Types ─────────────────────────────────────────────────────

export type PlanTier = 'FREE' | 'PRO_MONTHLY' | 'PRO_ANNUAL';

export type UserRole = 'STUDENT' | 'ADMIN' | 'CONTENT_EDITOR' | 'MODERATOR';

export interface UserProfile {
  id: string;
  targetExam: ExamType;
  targetYear: number;
  classGrade: number; // 9-13 (13 = dropper)
  languagePreference: 'en' | 'hi';
  dailyBudgetMinutes: number;
  overallElo: number;
  isMinor: boolean;
  parentConsentGrantedAt: string | null;
}

// ─── Assessment Types ─────────────────────────────────────────────────────────

export type AttemptStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'EVALUATED' | 'ABANDONED';

export interface MarkingScheme {
  correct: number;
  incorrect: number;
  unattempted: number;
}

export interface SectionPart {
  kind: QuestionKind;
  mandatoryCount: number;
  selectableCount: number;
  correctDelta: number;
  incorrectDelta: number;
}

export interface ExamSection {
  subject: SubjectId;
  parts: SectionPart[];
}

export interface ExamConfig {
  examCode: ExamType;
  markingEngine: string;
  sections: ExamSection[];
  timer: {
    totalMinutes: number;
    lockPerSection: boolean;
  };
}

// ─── Mastery Types ────────────────────────────────────────────────────────────

export interface TopicMastery {
  userId: string;
  nodeId: string;
  eloRating: number;
  confidenceInterval: number;
  totalAttempts: number;
  correctAttempts: number;
  lastPracticedAt: string | null;
}

export type MasteryTier = 'NOVICE' | 'COMPETENT' | 'PROFICIENT' | 'MASTER';

export function getMasteryTier(elo: number): MasteryTier {
  if (elo < 1100) return 'NOVICE';
  if (elo < 1250) return 'COMPETENT';
  if (elo < 1400) return 'PROFICIENT';
  return 'MASTER';
}

// ─── Planner Types ────────────────────────────────────────────────────────────

export type TaskKind = 'LEARN' | 'PRACTICE' | 'REVISE' | 'DIAGNOSTIC';

export interface StudyTask {
  id: string;
  roadmapId: string;
  nodeId: string;
  topicName: string;
  scheduledDate: string; // ISO date string
  kind: TaskKind;
  targetQuantity: number;
  completedQuantity: number;
  isCompleted: boolean;
  priority: number;
  reason?: string;
}

// ─── AI Mentor Types ──────────────────────────────────────────────────────────

export type PedagogicalMode = 'HINT_ONLY' | 'STEP_BY_STEP' | 'DIRECT_ANSWER' | 'CONCEPT_EXPLAIN';

export type AiModelTier = 'TIER_1' | 'TIER_2';

export interface AiUsageMetadata {
  modelTier: AiModelTier;
  cacheHit: boolean;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  costRupees: number;
}

// ─── Gamification Types ───────────────────────────────────────────────────────

export type XpReason =
  | 'QUESTION_CORRECT'
  | 'QUESTION_FIRST_TRY_CORRECT'
  | 'MOCK_TEST_COMPLETED'
  | 'DAILY_STREAK'
  | 'TOPIC_MASTERED'
  | 'PROFILE_COMPLETED';

export type BadgeId =
  | 'FIRST_QUESTION'
  | 'STREAK_7'
  | 'STREAK_30'
  | 'FIRST_MOCK_TEST'
  | 'MECHANICS_MASTER'
  | 'CHEMISTRY_MASTER'
  | 'PROFILE_COMPLETE';

export interface XpEntry {
  id: string;
  userId: string;
  delta: number;
  reason: XpReason;
  idempotencyKey: string;
  createdAt: string;
}

// ─── API Response Helpers ─────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: PaginationMeta;
}
