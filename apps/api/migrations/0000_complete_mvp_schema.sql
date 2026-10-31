-- VEDIXA Complete MVP PostgreSQL Migration
-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "ltree";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Enums
DO $$ BEGIN
  CREATE TYPE exam_type AS ENUM ('JEE_MAIN', 'JEE_ADV', 'NEET_UG', 'NDA', 'CUET', 'CBSE_10', 'CBSE_12');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE question_kind AS ENUM ('SINGLE_CHOICE', 'MULTI_CHOICE', 'NUMERICAL', 'ASSERTION_REASON', 'MATRIX_MATCH');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE difficulty_tier AS ENUM ('EASY', 'MEDIUM', 'HARD', 'EXTREME');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE attempt_status AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'EVALUATED', 'ABANDONED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE task_kind AS ENUM ('LEARN', 'PRACTICE', 'REVISE', 'DIAGNOSTIC');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE plan_tier AS ENUM ('FREE', 'PRO_MONTHLY', 'PRO_ANNUAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('STUDENT', 'ADMIN', 'CONTENT_EDITOR', 'MODERATOR');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE verification_status AS ENUM ('PENDING', 'VERIFIED', 'FLAGGED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE subject_id AS ENUM ('PHYSICS', 'CHEMISTRY', 'MATHEMATICS', 'BIOLOGY', 'ENGLISH', 'GK');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE moderation_status AS ENUM ('VISIBLE', 'PENDING_REVIEW', 'REMOVED', 'SHADOW_BANNED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 1. Identity & Profiles
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_hash VARCHAR(64) UNIQUE NOT NULL,
    phone_encrypted TEXT NOT NULL,
    name VARCHAR(100) NOT NULL,
    role user_role NOT NULL DEFAULT 'STUDENT',
    is_minor BOOLEAN NOT NULL DEFAULT true,
    parent_phone_hash VARCHAR(64),
    parent_phone_encrypted TEXT,
    parent_consent_granted_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS users_phone_hash_idx ON users(phone_hash);

CREATE TABLE IF NOT EXISTS student_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    target_exam exam_type NOT NULL,
    target_year INT NOT NULL,
    class_grade INT NOT NULL CHECK (class_grade BETWEEN 9 AND 13),
    language_preference VARCHAR(10) NOT NULL DEFAULT 'en',
    daily_budget_minutes INT NOT NULL DEFAULT 120,
    overall_elo INT NOT NULL DEFAULT 1200,
    onboarding_completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS otp_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_hash VARCHAR(64) NOT NULL,
    otp_hash VARCHAR(64) NOT NULL,
    token VARCHAR(64) UNIQUE NOT NULL,
    purpose VARCHAR(32) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    attempts SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS otp_tokens_phone_hash_idx ON otp_tokens(phone_hash);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_id_idx ON refresh_tokens(user_id);

-- 2. Content & Syllabus
CREATE TABLE IF NOT EXISTS subjects (
    id subject_id PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS syllabus_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam exam_type NOT NULL,
    subject_id subject_id NOT NULL REFERENCES subjects(id),
    path TEXT NOT NULL,
    name VARCHAR(128) NOT NULL,
    exam_weightage_percent NUMERIC(4,2) NOT NULL DEFAULT 0.00,
    prerequisite_node_ids UUID[] DEFAULT '{}',
    ncert_chapter_ref VARCHAR(64),
    estimated_study_minutes INT NOT NULL DEFAULT 60,
    estimated_practice_minutes INT NOT NULL DEFAULT 30,
    depth INT NOT NULL DEFAULT 0,
    parent_node_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS syllabus_nodes_exam_idx ON syllabus_nodes(exam);
CREATE INDEX IF NOT EXISTS syllabus_nodes_subject_idx ON syllabus_nodes(subject_id);
CREATE INDEX IF NOT EXISTS syllabus_nodes_exam_subject_idx ON syllabus_nodes(exam, subject_id);

CREATE TABLE IF NOT EXISTS exam_configs (
    exam_code exam_type PRIMARY KEY,
    display_name VARCHAR(64) NOT NULL,
    marking_engine VARCHAR(64) NOT NULL,
    config JSONB NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id UUID NOT NULL REFERENCES syllabus_nodes(id),
    kind question_kind NOT NULL,
    difficulty difficulty_tier NOT NULL,
    content_latex TEXT NOT NULL,
    diagram_urls TEXT[] DEFAULT '{}',
    marking_scheme JSONB NOT NULL,
    pyq_metadata JSONB,
    verification_status verification_status NOT NULL DEFAULT 'PENDING',
    verified_by_user_id UUID REFERENCES users(id),
    flag_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS questions_node_idx ON questions(node_id);
CREATE INDEX IF NOT EXISTS questions_difficulty_idx ON questions(difficulty);
CREATE INDEX IF NOT EXISTS questions_node_kind_diff_idx ON questions(node_id, kind, difficulty);
CREATE INDEX IF NOT EXISTS questions_verification_idx ON questions(verification_status);

CREATE TABLE IF NOT EXISTS question_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    option_index SMALLINT NOT NULL,
    content_latex TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL,
    explanation_latex TEXT
);
CREATE INDEX IF NOT EXISTS question_options_question_idx ON question_options(question_id);

CREATE TABLE IF NOT EXISTS question_solutions (
    question_id UUID PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
    solution_latex TEXT NOT NULL,
    step_breakdown JSONB NOT NULL DEFAULT '[]',
    verified_by_user_id UUID REFERENCES users(id),
    embedding vector(768),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Assessments & Partitioned Responses
CREATE TABLE IF NOT EXISTS tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    exam exam_type NOT NULL,
    duration_minutes INT NOT NULL,
    total_marks INT NOT NULL,
    is_live BOOLEAN NOT NULL DEFAULT false,
    rules_config JSONB NOT NULL,
    created_by_user_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS tests_exam_idx ON tests(exam);

CREATE TABLE IF NOT EXISTS test_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id UUID NOT NULL REFERENCES tests(id),
    user_id UUID NOT NULL REFERENCES users(id),
    status attempt_status NOT NULL DEFAULT 'IN_PROGRESS',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    server_deadline_at TIMESTAMPTZ NOT NULL,
    submitted_at TIMESTAMPTZ,
    total_score NUMERIC(6,2),
    percentile_estimate NUMERIC(5,2),
    accuracy_percentage NUMERIC(5,2),
    client_device_metadata JSONB
);
CREATE INDEX IF NOT EXISTS test_attempts_user_id_idx ON test_attempts(user_id);
CREATE INDEX IF NOT EXISTS test_attempts_test_id_idx ON test_attempts(test_id);

-- Range Partitioned question_responses Table
CREATE TABLE IF NOT EXISTS question_responses (
    id UUID DEFAULT gen_random_uuid(),
    attempt_id UUID NOT NULL,
    user_id UUID NOT NULL,
    question_id UUID NOT NULL,
    selected_option_ids UUID[] DEFAULT '{}',
    numerical_answer NUMERIC(15,6),
    is_correct BOOLEAN NOT NULL,
    marked_for_review BOOLEAN NOT NULL DEFAULT false,
    time_spent_seconds INT NOT NULL DEFAULT 0,
    earned_marks NUMERIC(4,2),
    idempotency_key VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Partitions for 2026 and 2027
CREATE TABLE IF NOT EXISTS question_responses_2026_q1 PARTITION OF question_responses
    FOR VALUES FROM ('2026-01-01') TO ('2026-04-01');
CREATE TABLE IF NOT EXISTS question_responses_2026_q2 PARTITION OF question_responses
    FOR VALUES FROM ('2026-04-01') TO ('2026-07-01');
CREATE TABLE IF NOT EXISTS question_responses_2026_q3 PARTITION OF question_responses
    FOR VALUES FROM ('2026-07-01') TO ('2026-10-01');
CREATE TABLE IF NOT EXISTS question_responses_2026_q4 PARTITION OF question_responses
    FOR VALUES FROM ('2026-10-01') TO ('2027-01-01');
CREATE TABLE IF NOT EXISTS question_responses_2027_q1 PARTITION OF question_responses
    FOR VALUES FROM ('2027-01-01') TO ('2027-04-01');

-- 4. Derived Topic Mastery
CREATE TABLE IF NOT EXISTS derived_topic_mastery (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    node_id UUID NOT NULL REFERENCES syllabus_nodes(id) ON DELETE CASCADE,
    elo_rating INT NOT NULL DEFAULT 1200,
    confidence_interval NUMERIC(4,2) NOT NULL DEFAULT 0.50,
    total_attempts INT NOT NULL DEFAULT 0,
    correct_attempts INT NOT NULL DEFAULT 0,
    last_practiced_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, node_id)
);
CREATE INDEX IF NOT EXISTS mastery_user_id_idx ON derived_topic_mastery(user_id);
CREATE INDEX IF NOT EXISTS mastery_elo_idx ON derived_topic_mastery(user_id, elo_rating);

-- 5. Roadmaps & Tasks
CREATE TABLE IF NOT EXISTS roadmaps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    exam exam_type NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    target_completion_date DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    llm_enrichment_note TEXT
);
CREATE INDEX IF NOT EXISTS roadmaps_user_active_idx ON roadmaps(user_id, is_active);

CREATE TABLE IF NOT EXISTS study_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    roadmap_id UUID NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
    node_id UUID NOT NULL REFERENCES syllabus_nodes(id),
    scheduled_date DATE NOT NULL,
    kind task_kind NOT NULL,
    target_quantity INT NOT NULL DEFAULT 10,
    completed_quantity INT NOT NULL DEFAULT 0,
    is_completed BOOLEAN NOT NULL DEFAULT false,
    priority INT NOT NULL DEFAULT 1,
    estimated_minutes INT NOT NULL DEFAULT 30,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS study_tasks_roadmap_date_idx ON study_tasks(roadmap_id, scheduled_date);

-- 6. AI Mentor & Metering
CREATE TABLE IF NOT EXISTS ai_chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_context_id UUID REFERENCES questions(id),
    topic_node_id UUID REFERENCES syllabus_nodes(id),
    title VARCHAR(128) NOT NULL DEFAULT 'Doubt Session',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
    role VARCHAR(16) NOT NULL,
    content_text TEXT NOT NULL,
    image_url TEXT,
    tokens_consumed INT NOT NULL DEFAULT 0,
    cost_rupees NUMERIC(8,4) NOT NULL DEFAULT 0,
    cache_hit BOOLEAN NOT NULL DEFAULT false,
    model_used VARCHAR(64),
    feedback_rating SMALLINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_usage_metrics (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    doubts_used INT NOT NULL DEFAULT 0,
    tokens_used INT NOT NULL DEFAULT 0,
    cost_rupees NUMERIC(8,4) NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, date)
);

-- 7. Gamification & Subscriptions
CREATE TABLE IF NOT EXISTS xp_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    delta INT NOT NULL,
    reason VARCHAR(64) NOT NULL,
    reference_id UUID,
    idempotency_key VARCHAR(64) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS xp_ledger_user_idx ON xp_ledger(user_id);

CREATE TABLE IF NOT EXISTS user_streaks (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    current_streak INT NOT NULL DEFAULT 0,
    longest_streak INT NOT NULL DEFAULT 0,
    freeze_tokens_available INT NOT NULL DEFAULT 1,
    last_activity_date DATE NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_badges (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_id VARCHAR(64) NOT NULL,
    awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reference_id UUID,
    PRIMARY KEY (user_id, badge_id)
);

CREATE TABLE IF NOT EXISTS subscriptions (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    plan_tier plan_tier NOT NULL DEFAULT 'FREE',
    daily_ai_doubts_quota INT NOT NULL DEFAULT 3,
    valid_until TIMESTAMPTZ,
    razorpay_subscription_id VARCHAR(64),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Community & Reports
CREATE TABLE IF NOT EXISTS community_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    exam exam_type NOT NULL,
    subject subject_id,
    title VARCHAR(300) NOT NULL,
    content_markdown TEXT NOT NULL,
    question_reference_id UUID REFERENCES questions(id),
    upvote_count INT NOT NULL DEFAULT 0,
    comment_count INT NOT NULL DEFAULT 0,
    moderation_status moderation_status NOT NULL DEFAULT 'VISIBLE',
    report_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS community_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_comment_id UUID,
    content_markdown TEXT NOT NULL,
    upvote_count INT NOT NULL DEFAULT 0,
    moderation_status moderation_status NOT NULL DEFAULT 'VISIBLE',
    report_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS content_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reported_by_user_id UUID NOT NULL REFERENCES users(id),
    content_type VARCHAR(16) NOT NULL,
    content_id UUID NOT NULL,
    reason VARCHAR(32) NOT NULL,
    details TEXT,
    resolved_at TIMESTAMPTZ,
    resolved_by_user_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Notifications & Audit Logs (DPDP Compliance)
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    userId UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(64) NOT NULL,
    title VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    payload JSONB,
    is_read BOOLEAN NOT NULL DEFAULT false,
    scheduled_for TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    action VARCHAR(64) NOT NULL,
    actor_ip VARCHAR(45) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_logs_user_idx ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs(action);
