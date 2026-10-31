<<<<<<< HEAD
# Vedixa – AI-Powered Learning Platform

## Overview
VEDIXA is a modular-monolith AI-powered personalized learning platform for Indian competitive exam aspirants (JEE, NEET, NDA, CUET, CBSE Boards).

## Architecture
- **Backend:** Fastify 5 + TypeScript (Node.js 18+) — Modular Monolith
- **Database:** PostgreSQL 16 + Drizzle ORM + pgvector
- **Cache / Queue:** Redis 7 (Valkey) + BullMQ
- **Frontend (Web):** Next.js 15 (App Router)
- **Frontend (Mobile):** React Native + Expo SDK 52
- **AI:** Google Gemini 2.0 Flash (Tier 1) + OpenAI-compatible API for deep STEM (Tier 2)
- **Storage:** Cloudflare R2 (S3-compatible)

## Prerequisites
- Node.js 18+
- pnpm 9+
- Docker & Docker Compose

## Quick Start

### 1. Clone and install
```bash
git clone <repo>
cd vedixa
pnpm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your credentials
```

### 3. Start infrastructure (PostgreSQL + Redis)
```bash
pnpm docker:up
```

### 4. Run database migrations and seed
```bash
pnpm db:migrate
pnpm db:seed
```

### 5. Start development servers
```bash
pnpm dev
```

Services:
| Service     | URL                       |
|-------------|---------------------------|
| API         | http://localhost:3001      |
| API Docs    | http://localhost:3001/docs |
| Web         | http://localhost:3000      |
| PostgreSQL  | localhost:5432             |
| Redis       | localhost:6379             |
| Adminer     | http://localhost:8080      |

## Environment Variables
See [`.env.example`](.env.example) for all required variables.

### Required for full functionality
| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | ≥32 char secret for access tokens |
| `JWT_REFRESH_SECRET` | ≥32 char secret for refresh tokens |
| `GOOGLE_GEMINI_API_KEY` | Gemini API key for AI mentor |
| `ENCRYPTION_KEY` | 32-byte hex key for PII encryption |

## Project Structure
```
vedixa/
├── apps/
│   ├── api/          # Fastify backend (primary — modular monolith)
│   ├── web/          # Next.js 15 web frontend
│   └── mobile/       # Expo React Native mobile app
├── packages/
│   ├── types/        # Shared TypeScript interfaces
│   ├── schemas/      # Shared Zod validation schemas
│   ├── syllabus-dag/ # DAG scheduling logic
│   └── math-parser/  # LaTeX AST utilities
├── infra/
│   ├── docker/       # Docker Compose configs
│   └── terraform/    # Infrastructure as Code
├── scripts/          # CLI utilities (seed, ingest, migrate)
└── tests/            # Cross-app integration & E2E tests
```

## Running Tests
```bash
# Unit tests (mastery engine, scoring, scheduling)
pnpm test:unit

# Integration tests (API)
pnpm --filter @vedixa/api test:integration

# E2E test (full core loop)
pnpm --filter @vedixa/api test:e2e
```

## Database Management
```bash
# Generate new migration after schema change
pnpm --filter @vedixa/api db:generate

# Apply pending migrations
pnpm db:migrate

# Reset and re-seed (dev only — DESTROYS ALL DATA)
pnpm db:migrate:fresh

# Open Drizzle Studio
pnpm db:studio
```

## Content Ingestion
```bash
# Ingest questions from a JSON file
pnpm --filter @vedixa/api content:ingest -- --file ./scripts/data/jee_main_questions.json

# Seed syllabus for a specific exam
pnpm --filter @vedixa/api content:seed-syllabus -- --exam JEE_MAIN
```

## Security Notes
- Never commit `.env` files
- `ENCRYPTION_KEY` must be 32 random hex bytes: `openssl rand -hex 32`
- JWT secrets must be ≥32 characters
- All PII (phone numbers) is AES-256-GCM encrypted at rest
- Phone numbers are also SHA-256 hashed for indexed lookup
=======
# VEDIXA
>>>>>>> c27210da5c720f52d00eb72539eced6ebefc3db0
