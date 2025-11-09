# Implementation Plan: Brew Digest

**Branch**: `001-brewery-digest` | **Date**: 2025-11-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-brewery-digest/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Build a self-contained backend service that automatically aggregates brewery newsletters and social media content from multiple sources (email, Instagram, Facebook, RSS), processes and categorizes the content using LLM-powered extraction, and generates personalized weekly digest emails for users based on their selected breweries in the NYC and DC metropolitan areas. The system uses NestJS for API/scheduling, BullMQ with Redis for async job processing, PostgreSQL with Prisma for data persistence, Puppeteer for web scraping, and optional MinIO for content asset storage.

## Technical Context

**Language/Version**: Node.js 20 LTS with TypeScript 5.x
**Primary Dependencies**: NestJS 10.x, BullMQ 5.x, Prisma 5.x, Puppeteer 21.x
**Storage**: PostgreSQL 16+ (relational data), Redis 7+ (queue/cache), MinIO (optional - content assets/images)
**Testing**: Jest (unit/integration), Supertest (API contract), Playwright/Puppeteer (E2E scraping)
**Target Platform**: Linux server (containerized via Docker), horizontal scaling via queue workers
**Project Type**: Single backend application with modular NestJS architecture
**Performance Goals**:
- Process 1000 user digests in <30 minutes
- Content extraction <5 seconds per source
- API response time <200ms p95
- Queue processing throughput: 50 jobs/second per worker

**Constraints**:
- Email delivery within 1 hour of scheduled time (95% SLA)
- Instagram/Facebook API rate limits (200 calls/hour per app)
- RSS feed polling interval: minimum 15 minutes per source
- LLM API cost: <$0.10 per digest generation
- Puppeteer memory limit: <512MB per worker instance

**Scale/Scope**:
- 100-300 breweries (NYC + DC)
- 1,000 users (initial target)
- 4 content source types (email, Instagram, Facebook, RSS)
- ~50-200 content items processed per day
- Weekly digest generation (7,000 digests/week at 1k users)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Code Quality & Maintainability

**Status**: ✅ PASS

- **Transparent Code Structure**: NestJS modules provide clear separation of concerns (auth, users, breweries, content, digests, email)
- **Consistent Testing**: Jest for unit tests, Supertest for API contracts, E2E tests for scraping/processing pipelines
- **Verifiable Correctness**: BullMQ job processors are testable with mock queues; Prisma migrations ensure DB schema correctness
- **Maintainability First**: TypeScript provides type safety; NestJS dependency injection enables testable, modular code; Prisma schema documents data model

**Notes**: Strong foundation for maintainability via TypeScript + NestJS patterns.

### II. User-Centric Experience

**Status**: ✅ PASS

- **Cohesive Design**: RESTful API provides consistent interface for user preferences, brewery selection, digest customization
- **Trustworthy Content**: LLM-powered extraction with confidence scoring; duplicate detection prevents redundancy; manual brewery curation ensures quality sources
- **Regional Personalization**: Brewery filtering by NYC/DC region; user-selected breweries only; location-based search
- **Quality Standards**: Email templates with responsive design; digest preview before delivery; user-configurable preferences

**Notes**: Focus on accurate content extraction and reliable delivery ensures trust.

### III. Performance & Reliability

**Status**: ⚠️ PARTIAL - Needs justification

- **Data Integrity**: Prisma transactions for atomic operations; job retries for failed extractions; email bounce handling
- **Processing Speed**: BullMQ parallel workers; Redis caching for brewery/user lookups; batch digest generation
- **System Reliability**: Job retry logic with exponential backoff; graceful degradation for failed sources; health checks for all external APIs
- **Long-term Scalability**: Horizontal scaling via queue workers; PostgreSQL partitioning for content items; Redis cluster for high availability
- **Observability**: Structured logging (Winston/Pino); Prometheus metrics for queue depth, job duration, API latency; OpenTelemetry tracing

**Complexity Concerns**:
1. **BullMQ + Redis**: Adds distributed queue complexity vs simple cron jobs
2. **Puppeteer**: Memory-intensive headless browser for scraping
3. **MinIO**: Optional object storage adds deployment complexity
4. **LLM API**: External dependency with cost and rate limits

**Justification Required**: See Complexity Tracking below

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| BullMQ + Redis for job queue | Process 1000+ digests in parallel within 30min window; reliable async processing for Instagram/Facebook/RSS polling with retry logic | Simple cron jobs cannot achieve 30min SLA for 1000 users; in-memory queues lose jobs on restart; cannot horizontally scale processing |
| Puppeteer for web scraping | Instagram/Facebook public pages require JavaScript rendering; RSS feeds from brewery sites with dynamic content | Static HTTP clients cannot access client-rendered social content; Meta official APIs require business verification (weeks delay); public scraping is only viable MVP path |
| MinIO for asset storage | Brewery logos, digest images, and extracted social media photos exceed PostgreSQL BYTEA performance limits (~100MB+ per day) | Storing binary assets in PostgreSQL causes slow queries and backup bloat; file system storage doesn't work with horizontal scaling; cloud storage (S3) adds cost and vendor lock-in for MVP |
| LLM API for content extraction | Brewery newsletters have inconsistent formats; need to extract structured data (beer names, styles, event dates) from unstructured HTML/text with 90% accuracy | Regex/pattern matching fails on varied content formats; NLP libraries (spaCy) require extensive training data and domain tuning; LLM achieves 90% accuracy goal with simple prompts |

**Verdict**: All complexity justified by concrete requirements (performance SLA, accuracy goals, scale targets). Simpler alternatives cannot meet success criteria.

## Project Structure

### Documentation (this feature)

```text
specs/001-brewery-digest/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   ├── openapi.yaml     # REST API specification
│   └── jobs.md          # BullMQ job contracts
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── auth/                    # Authentication module (FR-001, FR-018)
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── strategies/          # Passport JWT strategy
│   │   └── guards/
│   ├── users/                   # User management (FR-004, FR-005, FR-012, FR-017)
│   │   ├── users.controller.ts
│   │   ├── users.service.ts
│   │   └── dto/
│   ├── breweries/               # Brewery catalog (FR-003, FR-019, FR-020)
│   │   ├── breweries.controller.ts
│   │   ├── breweries.service.ts
│   │   └── dto/
│   ├── content/                 # Content ingestion & processing (FR-006, FR-007, FR-008, FR-009)
│   │   ├── collectors/          # Source-specific collectors
│   │   │   ├── email.collector.ts
│   │   │   ├── instagram.collector.ts
│   │   │   ├── facebook.collector.ts
│   │   │   └── rss.collector.ts
│   │   ├── processors/          # LLM-powered extraction
│   │   │   ├── extraction.processor.ts
│   │   │   ├── categorization.processor.ts
│   │   │   └── deduplication.processor.ts
│   │   ├── content.service.ts
│   │   └── jobs/                # BullMQ job handlers
│   ├── digests/                 # Digest generation & delivery (FR-010, FR-011, FR-013, FR-014, FR-015, FR-021, FR-022)
│   │   ├── digests.controller.ts
│   │   ├── digests.service.ts
│   │   ├── generators/          # Digest assembly logic
│   │   ├── templates/           # Email templates (Handlebars/MJML)
│   │   └── jobs/
│   ├── email/                   # Email delivery (FR-002, FR-016, FR-023)
│   │   ├── email.service.ts
│   │   └── providers/           # Nodemailer/Gmail IMAP integration
│   └── storage/                 # Optional MinIO integration
│       └── storage.service.ts
├── common/
│   ├── database/                # Prisma client, migrations
│   ├── queues/                  # BullMQ queue setup
│   ├── config/                  # Environment-based config
│   └── utils/
├── main.ts                      # NestJS bootstrap
└── app.module.ts                # Root module

prisma/
├── schema.prisma               # Data model (users, breweries, content, digests)
├── migrations/                 # Version-controlled DB migrations
└── seed.ts                     # NYC/DC brewery seed data

tests/
├── unit/                       # Module-level unit tests
├── integration/                # API contract tests (Supertest)
└── e2e/                        # End-to-end scraping/processing tests

docker/
├── Dockerfile                  # Application container
├── docker-compose.yml          # PostgreSQL + Redis + MinIO + app
└── nginx.conf                  # Optional reverse proxy

.github/
└── workflows/
    ├── ci.yml                  # Test + lint on PR
    └── cd.yml                  # Deploy on merge
```

**Structure Decision**: Single backend application using NestJS modular architecture. Each module (auth, users, breweries, content, digests, email) maps to functional requirements. BullMQ job processors live within their respective modules. Prisma schema centralizes data model. Docker Compose for local development with all dependencies (PostgreSQL, Redis, MinIO).

## Phase 0: Research & Decisions

*Output: `research.md`*

The following areas require investigation before design:

### R1: Instagram/Facebook Scraping Strategy
**Question**: What is the most reliable approach for scraping Instagram and Facebook public brewery pages given API restrictions?

**Research Tasks**:
- Compare Puppeteer vs Playwright for social media scraping
- Investigate Instagram public endpoint patterns (no auth required)
- Evaluate Facebook Graph API vs public scraping trade-offs
- Research rate limiting and IP blocking mitigation (proxies, user agents)
- Identify ethical scraping best practices and legal considerations

**Decision Needed**: Scraping tool (Puppeteer vs Playwright), rate limit handling, fallback strategy if blocked

### R2: LLM Selection for Content Extraction
**Question**: Which LLM API provides optimal balance of accuracy, cost, and latency for extracting structured data from brewery content?

**Research Tasks**:
- Compare OpenAI GPT-4o, Anthropic Claude, Google Gemini for extraction tasks
- Benchmark accuracy on sample brewery newsletters (beer names, styles, dates)
- Estimate cost per digest generation based on token usage
- Evaluate JSON mode/structured output capabilities
- Test latency and rate limits for batch processing

**Decision Needed**: LLM provider, model version, prompt engineering approach, cost mitigation strategies

### R3: Email Ingestion Architecture
**Question**: How should the system receive and process brewery newsletters forwarded or sent to a dedicated email address?

**Research Tasks**:
- Evaluate IMAP polling with Gmail vs webhook-based email ingestion
- Research email parsing libraries (Nodemailer, mailparser)
- Investigate HTML email to plain text extraction best practices
- Design spam filtering and newsletter identification logic

**Decision Needed**: Ingestion method (IMAP vs webhook), email parsing library, spam filtering approach

### R4: BullMQ Job Design Patterns
**Question**: How should jobs be structured for content collection, extraction, and digest generation to maximize parallelism and reliability?

**Research Tasks**:
- Research BullMQ best practices for job priority, concurrency, rate limiting
- Design job dependency patterns (collect → extract → deduplicate → digest)
- Investigate retry strategies and dead letter queue handling
- Evaluate Redis memory optimization for high job volume

**Decision Needed**: Job queue architecture, retry policies, concurrency limits, monitoring approach

### R5: Duplicate Detection Algorithm
**Question**: What algorithm achieves 80%+ duplicate reduction across email, social, and RSS sources?

**Research Tasks**:
- Research fuzzy string matching libraries (Levenshtein, cosine similarity)
- Evaluate content fingerprinting techniques (SimHash, MinHash)
- Design brewery + date + content similarity scoring model
- Test on sample duplicate announcements (same beer release on Instagram + newsletter)

**Decision Needed**: Similarity algorithm, threshold tuning, storage approach for fingerprints

### R6: Email Template Engine and Responsive Design
**Question**: Which email template engine ensures consistent rendering across email clients (Gmail, Outlook, Apple Mail)?

**Research Tasks**:
- Compare MJML (responsive email framework) vs Handlebars + inline CSS
- Research email client compatibility testing tools (Litmus, Email on Acid)
- Investigate dynamic content rendering (user preferences, brewery branding)
- Evaluate template versioning and A/B testing capabilities

**Decision Needed**: Template engine, CSS inlining strategy, testing approach

### R7: PostgreSQL Partitioning Strategy
**Question**: How should the `content_items` table be partitioned to maintain query performance as data grows?

**Research Tasks**:
- Research PostgreSQL partitioning strategies (time-based, hash-based)
- Design partition key (publication_date) and retention policy
- Evaluate impact on Prisma query performance
- Investigate automated partition creation and archival

**Decision Needed**: Partition strategy, retention period, query optimization approach

### R8: MinIO vs S3 for Asset Storage
**Question**: Should the system use self-hosted MinIO or AWS S3 for brewery logos and content images?

**Research Tasks**:
- Compare MinIO deployment complexity vs S3 cost for ~1GB/month storage
- Evaluate CDN integration requirements (CloudFront vs MinIO + nginx)
- Research backup and disaster recovery strategies for both
- Investigate image optimization and thumbnail generation

**Decision Needed**: Storage solution, CDN strategy, backup approach

**Next Step**: Generate `research.md` with findings and decisions for each R# task.
