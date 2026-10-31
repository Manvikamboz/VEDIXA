import { z } from 'zod';

// ─── Common Primitives ────────────────────────────────────────────────────────

export const UUIDSchema = z.string().uuid();

export const PhoneSchema = z
  .string()
  .regex(/^\+91[6-9]\d{9}$/, 'Must be a valid Indian mobile number (+91XXXXXXXXXX)');

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ─── Enums ────────────────────────────────────────────────────────────────────

export const ExamTypeSchema = z.enum([
  'JEE_MAIN',
  'JEE_ADV',
  'NEET_UG',
  'NDA',
  'CUET',
  'CBSE_10',
  'CBSE_12',
]);

export const SubjectIdSchema = z.enum([
  'PHYSICS',
  'CHEMISTRY',
  'MATHEMATICS',
  'BIOLOGY',
  'ENGLISH',
  'GK',
]);

export const DifficultyTierSchema = z.enum(['EASY', 'MEDIUM', 'HARD', 'EXTREME']);

export const QuestionKindSchema = z.enum([
  'SINGLE_CHOICE',
  'MULTI_CHOICE',
  'NUMERICAL',
  'ASSERTION_REASON',
  'MATRIX_MATCH',
]);

export const PlanTierSchema = z.enum(['FREE', 'PRO_MONTHLY', 'PRO_ANNUAL']);

export const PedagogicalModeSchema = z.enum([
  'HINT_ONLY',
  'STEP_BY_STEP',
  'DIRECT_ANSWER',
  'CONCEPT_EXPLAIN',
]);

// ─── Auth Schemas ─────────────────────────────────────────────────────────────

export const RegisterSchema = z
  .object({
    phone: PhoneSchema,
    dob: z.string().date('Invalid date of birth'),
    name: z.string().min(2).max(100).trim(),
    parentPhone: z.string().optional(), // Required if minor, validated separately
  })
  .strict();

export const VerifyOtpSchema = z
  .object({
    phone: PhoneSchema,
    otp: z.string().length(6).regex(/^\d{6}$/),
    otpToken: z.string().min(1), // Server-issued token tied to the OTP
  })
  .strict();

export const LoginSchema = z
  .object({
    phone: PhoneSchema,
  })
  .strict();

export const RefreshTokenSchema = z
  .object({
    refreshToken: z.string().min(1),
  })
  .strict();

export const ParentalConsentSchema = z
  .object({
    childPhone: PhoneSchema,
    consentOtp: z.string().length(6).regex(/^\d{6}$/),
    consentToken: z.string().min(1),
  })
  .strict();

// ─── Profile / Onboarding Schemas ────────────────────────────────────────────

export const OnboardingSchema = z
  .object({
    targetExam: ExamTypeSchema,
    targetYear: z.number().int().min(2025).max(2035),
    classGrade: z.number().int().min(9).max(13),
    languagePreference: z.enum(['en', 'hi']).default('en'),
    dailyBudgetMinutes: z.number().int().min(30).max(600).default(120),
  })
  .strict();

export const UpdateProfileSchema = OnboardingSchema.partial();

// ─── Question Schemas ─────────────────────────────────────────────────────────

export const QuestionFilterSchema = z
  .object({
    examType: ExamTypeSchema.optional(),
    subject: SubjectIdSchema.optional(),
    nodeId: UUIDSchema.optional(),
    difficulty: DifficultyTierSchema.optional(),
    kind: QuestionKindSchema.optional(),
    verificationStatus: z.enum(['PENDING', 'VERIFIED', 'FLAGGED']).optional(),
    search: z.string().max(200).optional(),
  })
  .merge(PaginationQuerySchema);

export const CreateQuestionSchema = z
  .object({
    nodeId: UUIDSchema,
    kind: QuestionKindSchema,
    difficulty: DifficultyTierSchema,
    contentLatex: z.string().min(10).max(10000),
    diagramUrls: z.array(z.string().url()).max(5).default([]),
    markingScheme: z.object({
      correct: z.number(),
      incorrect: z.number(),
      unattempted: z.number().default(0),
    }),
    pyqMetadata: z
      .object({
        exam: ExamTypeSchema,
        year: z.number().int().min(1980).max(2030),
        shift: z.number().int().min(1).max(4).optional(),
        paperCode: z.string().optional(),
      })
      .optional(),
    options: z
      .array(
        z.object({
          optionIndex: z.number().int().min(0).max(3),
          contentLatex: z.string().min(1).max(5000),
          isCorrect: z.boolean(),
          explanationLatex: z.string().max(5000).optional(),
        }),
      )
      .min(2)
      .max(4)
      .optional(),
    solutionLatex: z.string().min(10).max(20000).optional(),
  })
  .strict();

// ─── Practice Session Schemas ─────────────────────────────────────────────────

export const StartPracticeSessionSchema = z
  .object({
    nodeId: UUIDSchema.optional(),
    examType: ExamTypeSchema.optional(),
    subject: SubjectIdSchema.optional(),
    difficulty: DifficultyTierSchema.optional(),
    questionCount: z.number().int().min(5).max(50).default(10),
  })
  .strict();

export const SubmitPracticeAnswerSchema = z
  .object({
    questionId: UUIDSchema,
    selectedOptionIds: z.array(UUIDSchema).max(4).default([]),
    numericalAnswer: z.number().optional(),
    timeSpentSeconds: z.number().int().min(0).max(3600),
    idempotencyKey: z.string().uuid('idempotencyKey must be a UUIDv4'),
  })
  .strict();

// ─── Mock Test Schemas ────────────────────────────────────────────────────────

export const StartTestAttemptSchema = z
  .object({
    testId: UUIDSchema,
    clientDeviceInfo: z
      .object({
        platform: z.string().max(50).optional(),
        osVersion: z.string().max(50).optional(),
        appVersion: z.string().max(30).optional(),
        networkType: z.string().max(20).optional(),
      })
      .optional(),
  })
  .strict();

export const SyncAttemptSchema = z
  .object({
    isFinalSubmission: z.boolean().default(false),
    clientSubmittedAt: z.string().datetime().optional(),
    events: z.array(
      z.object({
        questionId: UUIDSchema,
        selectedOptionIds: z.array(UUIDSchema).max(4).default([]),
        numericalAnswer: z.number().nullable().default(null),
        timeSpentSeconds: z.number().int().min(0).max(3600),
        markedForReview: z.boolean().default(false),
        clientTimestamp: z.number().int().positive(),
      }),
    ),
  })
  .strict();

// ─── AI Mentor Schemas ────────────────────────────────────────────────────────

export const CreateDoubtSessionSchema = z
  .object({
    questionContextId: UUIDSchema.optional(),
    topicNodeId: UUIDSchema.optional(),
    title: z.string().min(3).max(128).default('Doubt Session'),
  })
  .strict();

export const SendDoubtMessageSchema = z
  .object({
    sessionId: UUIDSchema,
    messageText: z.string().min(1).max(2000).trim(),
    imageUrl: z.string().url().optional(),
    pedagogicalMode: PedagogicalModeSchema.default('HINT_ONLY'),
  })
  .strict();

// ─── Community Schemas ────────────────────────────────────────────────────────

export const CreatePostSchema = z
  .object({
    examType: ExamTypeSchema,
    subject: SubjectIdSchema.optional(),
    title: z.string().min(5).max(300).trim(),
    contentMarkdown: z.string().min(10).max(10000).trim(),
    questionReferenceId: UUIDSchema.optional(),
  })
  .strict();

export const CreateCommentSchema = z
  .object({
    postId: UUIDSchema,
    contentMarkdown: z.string().min(2).max(3000).trim(),
    parentCommentId: UUIDSchema.optional(),
  })
  .strict();

export const ReportContentSchema = z
  .object({
    contentType: z.enum(['POST', 'COMMENT']),
    contentId: UUIDSchema,
    reason: z.enum([
      'SPAM',
      'INAPPROPRIATE',
      'WRONG_ANSWER',
      'PIRATED_CONTENT',
      'HARASSMENT',
      'SELF_HARM',
    ]),
    details: z.string().max(500).optional(),
  })
  .strict();
