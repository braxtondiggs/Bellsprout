# Tasks: Brewery Newsletter Digest Application

**Input**: Design documents from `/specs/001-brewery-digest/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Tech Stack Summary

- **Backend**: NestJS 10.x with TypeScript 5.x on Node.js 20 LTS
- **Database**: PostgreSQL 16+ with Prisma 5.x ORM
- **Queue**: BullMQ 5.x with Redis 7+
- **Scraping**: Playwright for Instagram/Facebook
- **Email**: Resend for inbound webhooks + outbound transactional emails
- **LLM**: OpenAI GPT-4o-mini with Tesseract OCR
- **Storage**: MinIO (self-hosted S3-compatible)
- **Templates**: MJML + Handlebars for digest emails

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic NestJS structure

- [X] T001 Initialize NestJS project with TypeScript 5.x in project root
- [X] T002 [P] Configure ESLint, Prettier, and Git hooks in .eslintrc.js, .prettierrc
- [X] T003 [P] Create Docker Compose file with PostgreSQL, Redis, MinIO services in docker/docker-compose.yml
- [X] T004 [P] Configure environment variables template in .env.example
- [X] T005 Install core dependencies: @nestjs/common, @nestjs/core, @nestjs/platform-express, @prisma/client, bullmq, ioredis
- [X] T006 [P] Setup project structure: src/app/, src/common/, prisma/, tests/ directories
- [X] T007 [P] Configure TypeScript compiler options in tsconfig.json for strict mode

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T008 Initialize Prisma with PostgreSQL in prisma/schema.prisma
- [X] T009 Define all Prisma models from data-model.md in prisma/schema.prisma (User, Brewery, ContentItem, Digest, UserBrewerySubscription, DigestContent, FailedJob, EmailBreweryMapping)
- [X] T010 Create initial Prisma migration for all models: npx prisma migrate dev --name init
- [X] T011 [P] Setup Prisma client service in src/common/database/prisma.service.ts
- [X] T012 [P] Configure BullMQ queues module in src/common/queues/queue.config.ts with 4 queues: collect, extract, deduplicate, digest
- [X] T013 [P] Setup Redis connection for BullMQ in src/common/queues/redis.config.ts
- [X] T014 [P] Create global exception filter in src/common/filters/http-exception.filter.ts
- [X] T015 [P] Setup Winston/Pino logger service in src/common/services/logger.service.ts
- [X] T016 [P] Create environment configuration module using @nestjs/config in src/common/config/config.module.ts
- [X] T017 Create Brewery seed script with NYC/DC breweries in prisma/seed.ts
- [X] T018 Create root AppModule importing all common modules in src/app.module.ts
- [X] T019 Setup NestJS application bootstrap in src/main.ts

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 3 - Content Ingestion and Processing (Priority: P1) 🎯 MVP CORE

**Goal**: Automatically collect and process brewery content from email, Instagram, Facebook, and RSS sources with LLM-powered extraction and duplicate detection

**Independent Test**: Configure brewery sources, trigger collection cycle, verify content is extracted and stored with proper categorization

**Why US3 First**: This is the data pipeline that all other stories depend on. Without content ingestion, there's nothing to display or send.

### Implementation for User Story 3

**Content Module Setup**
- [X] T020 [US3] Create content module in src/app/content/content.module.ts
- [X] T021 [P] [US3] Create ContentService base class in src/app/content/content.service.ts
- [X] T022 [P] [US3] Define content DTOs (CreateContentItemDto, ContentItemResponseDto) in src/app/content/dto/

**Email Collection (Resend Webhook)**
- [X] T023 [US3] Install Resend SDK: resend
- [X] T024 [US3] Create InboundEmailService in src/app/email/inbound-email.service.ts
- [X] T025 [US3] Implement email image extraction method in InboundEmailService (extract inline + attachments)
- [X] T026 [US3] Implement brewery sender identification logic in InboundEmailService
- [X] T027 [US3] Create webhook endpoint POST /webhooks/email/inbound in EmailController
- [ ] T028 [US3] Wire InboundEmailService to queue job: process-email in collect.processor.ts (when QueueService is ready)

**Social Media Collection (Instagram/Facebook)**
- [X] T029 [US3] Install Playwright dependencies: playwright, playwright-extra
- [X] T030 [P] [US3] Create InstagramCollectorService in src/app/content/collectors/instagram.collector.ts
- [X] T031 [P] [US3] Create FacebookCollectorService in src/app/content/collectors/facebook.collector.ts
- [X] T032 [US3] Implement Playwright scraping with rate limiting (1 req/hour/brewery) in both collectors
- [X] T033 [US3] Create BullMQ job: scrape-instagram in src/app/content/jobs/collect.processor.ts
- [X] T034 [US3] Create BullMQ job: scrape-facebook in src/app/content/jobs/collect.processor.ts
- [X] T035 [US3] Setup cron schedule for social scraping (every 6 hours)

**RSS Feed Collection**
- [X] T036 [US3] Install RSS parser: rss-parser
- [X] T037 [US3] Create RSSCollectorService in src/app/content/collectors/rss.collector.ts
- [X] T038 [US3] Create BullMQ job: fetch-rss in src/app/content/jobs/collect.processor.ts
- [X] T039 [US3] Setup cron schedule for RSS polling (every 4 hours)

**OCR Processing (Tesseract)**
- [X] T040 [US3] Install OCR dependencies: tesseract.js, sharp, cheerio
- [X] T041 [US3] Create OCRService with Tesseract worker initialization in src/app/content/processors/ocr.service.ts
- [X] T042 [US3] Implement image preprocessing (grayscale, contrast, resize) in OCRService
- [X] T043 [US3] Implement OCR text extraction method in OCRService
- [X] T044 [US3] Implement HTML injection method (replace img tags with OCR text) using Cheerio in OCRService

**LLM Entity Extraction**
- [X] T045 [US3] Install OpenAI SDK: openai
- [X] T046 [US3] Create LLMExtractionService in src/app/content/processors/llm-extraction.service.ts
- [X] T047 [US3] Implement GPT-4o-mini integration with JSON mode in LLMExtractionService
- [X] T048 [US3] Create extraction prompt template for beers, events, updates in LLMExtractionService
- [X] T049 [US3] Implement Zod schema validation for extracted data in src/app/content/validators/extracted-data.schema.ts
- [X] T050 [US3] Create BullMQ job: extract-email in src/app/content/jobs/extract.processor.ts (calls OCR + LLM)
- [X] T051 [US3] Setup parallel processing (10 concurrent extraction workers) in queue config

**Duplicate Detection**
- [X] T052 [US3] Install deduplication dependencies: minhash, natural, stopword
- [X] T053 [US3] Create DeduplicationService in src/app/content/processors/deduplication.service.ts
- [X] T054 [US3] Implement MinHash signature generation in DeduplicationService
- [X] T055 [US3] Implement cosine similarity scoring using TF-IDF in DeduplicationService
- [X] T056 [US3] Implement candidate matching with temporal window (±3 days) in DeduplicationService
- [X] T057 [US3] Implement Jaccard similarity from MinHash in DeduplicationService
- [X] T058 [US3] Create BullMQ job: check-duplicate in src/app/content/jobs/deduplicate.processor.ts
- [X] T059 [US3] Setup deduplication job processing (3 concurrent workers)

**Content Storage & Partitioning**
- [X] T060 [US3] Create monthly partition migration for content_items table in prisma/migrations/add_content_partitioning/migration.sql
- [X] T061 [US3] Create PartitionService for automated partition creation in src/app/content/services/partition.service.ts
- [X] T062 [US3] Setup cron job for partition creation (monthly) using @nestjs/schedule
- [X] T063 [US3] Setup cron job for partition cleanup (12-month retention)

**BullMQ Pipeline Integration**
- [X] T064 [US3] Wire 4-stage pipeline: collect → extract → deduplicate → (ready for digest) in src/app/content/jobs/
- [X] T065 [US3] Implement dead letter queue handler in src/app/content/jobs/dlq.processor.ts
- [X] T066 [US3] Add job retry logic with exponential backoff for each queue
- [X] T067 [US3] Create FailedJob model persistence for DLQ in src/app/content/services/failed-job.service.ts

**Checkpoint**: At this point, content ingestion pipeline should be fully functional - emails/social/RSS processed, OCR'd, extracted with LLM, deduplicated, and stored in database

---

## Phase 4: User Story 2 - Brewery Selection and Preferences (Priority: P1)

**Goal**: Allow users to browse breweries and select which ones to follow for personalized digests

**Independent Test**: Register account, browse brewery list, select/deselect breweries, verify selections are saved and respected in digest generation

### Implementation for User Story 2

**Brewery Module**
- [X] T068 [P] [US2] Create brewery module in src/app/breweries/breweries.module.ts
- [X] T069 [P] [US2] Create BreweryService in src/app/breweries/breweries.service.ts
- [X] T070 [P] [US2] Create BreweryController in src/app/breweries/breweries.controller.ts
- [X] T071 [P] [US2] Define brewery DTOs (BreweryResponseDto, BreweryFilterDto) in src/app/breweries/dto/

**Brewery Endpoints**
- [X] T072 [US2] Implement GET /api/breweries (list all breweries with pagination) in BreweryController
- [X] T073 [US2] Implement GET /api/breweries/:id (get brewery details) in BreweryController
- [X] T074 [US2] Implement GET /api/breweries/search (search by name, location, region) in BreweryController
- [X] T075 [US2] Add Prisma query optimization (indexes on name, city, region) to BreweryService

**User Brewery Subscription**
- [X] T076 [US2] Create UserBrewerySubscriptionService in src/app/breweries/user-brewery-subscription.service.ts
- [X] T077 [US2] Implement POST /api/users/me/breweries/:breweryId (subscribe to brewery) in src/app/users/users.controller.ts
- [X] T078 [US2] Implement DELETE /api/users/me/breweries/:breweryId (unsubscribe) in src/app/users/users.controller.ts
- [X] T079 [US2] Implement GET /api/users/me/breweries (list user's subscriptions) in src/app/users/users.controller.ts
- [X] T080 [US2] Add validation to prevent duplicate subscriptions in UserBrewerySubscriptionService

**Checkpoint**: At this point, users can browse breweries and manage their subscriptions

---

## Phase 5: User Story 4 - Account Management (Priority: P2)

**Goal**: Users can create accounts, verify email, reset passwords, and manage subscription status

**Independent Test**: Register account, receive verification email, update profile, pause/resume subscription, verify changes persist

### Implementation for User Story 4

**Auth Module**
- [X] T081 [P] [US4] Create auth module in src/app/auth/auth.module.ts
- [X] T082 [P] [US4] Create AuthService with bcrypt password hashing in src/app/auth/auth.service.ts
- [X] T083 [P] [US4] Create AuthController in src/app/auth/auth.controller.ts
- [X] T084 [P] [US4] Define auth DTOs (RegisterDto, LoginDto, ResetPasswordDto) in src/app/auth/dto/

**User Module**
- [X] T085 [P] [US4] Create users module in src/app/users/users.module.ts
- [X] T086 [P] [US4] Create UsersService in src/app/users/users.service.ts
- [X] T087 [P] [US4] Create UsersController in src/app/users/users.controller.ts
- [X] T088 [P] [US4] Define user DTOs (UpdateUserDto, UserResponseDto) in src/app/users/dto/

**JWT Authentication**
- [X] T089 [US4] Install Passport and JWT dependencies: @nestjs/passport, @nestjs/jwt, passport-jwt
- [X] T090 [US4] Create JWT strategy in src/app/auth/strategies/jwt.strategy.ts
- [X] T091 [US4] Create JWT auth guard in src/app/auth/guards/jwt-auth.guard.ts
- [X] T092 [US4] Configure JWT signing in AuthModule with environment variables

**Auth Endpoints**
- [X] T093 [US4] Implement POST /api/auth/register (create account with email verification token) in AuthController
- [X] T094 [US4] Implement POST /api/auth/login (JWT token generation) in AuthController
- [X] T095 [US4] Implement POST /api/auth/verify-email (verify email token) in AuthController
- [X] T096 [US4] Implement POST /api/auth/forgot-password (send reset token email) in AuthController
- [X] T097 [US4] Implement POST /api/auth/reset-password (reset password with token) in AuthController

**User Profile Management**
- [X] T098 [US4] Implement GET /api/users/me (get current user profile) in UsersController
- [X] T099 [US4] Implement PATCH /api/users/me (update profile) in UsersController
- [X] T100 [US4] Implement PATCH /api/users/me/email (change email with verification) in UsersController
- [X] T101 [US4] Implement PATCH /api/users/me/subscription (pause/resume subscription) in UsersController

**Email Service (Verification & Notifications)**
- [X] T102 [US4] Install Resend SDK and Handlebars: resend, handlebars
- [X] T103 [US4] Create EmailService with Resend integration in src/app/email/email.service.ts
- [X] T104 [US4] Configure Resend API key and template compilation in EmailService
- [X] T105 [US4] Create email verification template in src/app/email/templates/verify-email.hbs
- [X] T106 [US4] Create password reset template in src/app/email/templates/reset-password.hbs
- [X] T107 [US4] Implement sendVerificationEmail method in EmailService
- [X] T108 [US4] Implement sendPasswordResetEmail method in EmailService

**Checkpoint**: At this point, users can register, login, verify email, reset passwords, and manage their accounts

---

## Phase 6: User Story 1 - Weekly Digest Delivery (Priority: P1) 🎯 MVP COMPLETE

**Goal**: Generate and deliver personalized weekly digests containing all updates from users' selected breweries

**Independent Test**: User with brewery subscriptions waits for scheduled digest, receives consolidated email with content from multiple sources

### Implementation for User Story 1

**Digest Module**
- [X] T109 [P] [US1] Create digest module in src/app/digests/digests.module.ts
- [X] T110 [P] [US1] Create DigestService in src/app/digests/digests.service.ts
- [X] T111 [P] [US1] Create DigestController in src/app/digests/digests.controller.ts
- [X] T112 [P] [US1] Define digest DTOs (DigestResponseDto, DigestFilterDto) in src/app/digests/dto/

**Template Engine Setup**
- [X] T113 [US1] Install template dependencies: mjml, handlebars, juice, html-minifier
- [X] T114 [US1] Create TemplateService in src/app/digests/services/template.service.ts
- [X] T115 [US1] Implement MJML + Handlebars compilation pipeline in TemplateService
- [X] T116 [US1] Create digest email template in src/app/digests/templates/digest.mjml
- [X] T117 [US1] Create Handlebars helpers (formatDate, truncate, ifEquals) in src/app/digests/helpers.ts
- [X] T118 [US1] Implement CSS inlining with Juice in TemplateService

**Digest Generation**
- [X] T119 [US1] Create DigestGeneratorService in src/app/digests/services/digest-generator.service.ts
- [X] T120 [US1] Implement content fetching logic (user's breweries, last 7 days, non-duplicates) in DigestGeneratorService
- [X] T121 [US1] Implement content grouping by brewery and type (releases, events, updates) in DigestGeneratorService
- [X] T122 [US1] Implement template rendering with user preferences in DigestGeneratorService
- [X] T123 [US1] Create BullMQ job: generate-user-digest in src/app/digests/jobs/digest-generation.processor.ts
- [X] T124 [US1] Setup digest generation cron (weekly Sundays 8 AM) in src/app/digests/schedulers/digest.scheduler.ts

**Email Delivery**
- [X] T125 [US1] Implement digest email sending in EmailService
- [X] T126 [US1] Add email bounce tracking logic in BounceHandlerService
- [X] T127 [US1] Implement bounce handling (3 consecutive bounces → pause subscription) in src/app/email/bounce-handler.service.ts
- [X] T128 [US1] Create empty digest notification template in src/app/email/templates/no-content.hbs
- [X] T129 [US1] Setup digest queue processing (2 concurrent workers) in DigestDeliveryProcessor

**Digest History**
- [X] T130 [US1] Implement GET /api/users/me/digests (list user's past digests) in DigestController
- [X] T131 [US1] Implement GET /api/users/me/digests/:id (view specific digest) in DigestController
- [X] T132 [US1] Store rendered HTML in Digest model for historical viewing (implemented in DigestGeneratorService)

**Checkpoint**: At this point, MVP is COMPLETE - users can register, select breweries, and receive weekly personalized digests with content from all sources

---

## Phase 7: User Story 5 - Digest Customization (Priority: P2)

**Goal**: Users can customize digest delivery day, content type filters, and detail level preferences

**Independent Test**: Adjust digest preferences, trigger generation, verify delivered digest reflects user's preferences

### Implementation for User Story 5

**Preference Management**
- [ ] T133 [P] [US5] Add user preference endpoints to UsersController (already in US4, extend here)
- [ ] T134 [US5] Implement PATCH /api/users/me/preferences (update digestDeliveryDay, contentTypePreferences, digestFormat) in UsersController
- [ ] T135 [US5] Add preference validation (day 0-6, valid content types, valid format) in UpdateUserDto

**Digest Generation with Preferences**
- [ ] T136 [US5] Update DigestGeneratorService to filter content by user's contentTypePreferences
- [ ] T137 [US5] Create brief digest template variant in src/app/digests/templates/digest-brief.mjml
- [ ] T138 [US5] Create detailed digest template variant in src/app/digests/templates/digest-detailed.mjml
- [ ] T139 [US5] Update digest scheduler to respect user's digestDeliveryDay in DigestSchedulerService

**Checkpoint**: At this point, users can fully customize their digest experience

---

## Phase 8: User Story 6 - Visual Consistency and Branding (Priority: P3)

**Goal**: Ensure digests render consistently across email clients with brewery branding and responsive design

**Independent Test**: Generate digest, verify rendering in Gmail, Outlook, Apple Mail with consistent formatting and mobile responsiveness

### Implementation for User Story 6

**MinIO Asset Storage**
- [ ] T140 [P] [US6] Install MinIO SDK: @aws-sdk/client-s3, @aws-sdk/s3-request-presigner
- [ ] T141 [P] [US6] Create StorageService in src/app/storage/storage.service.ts
- [ ] T142 [P] [US6] Configure MinIO connection with S3-compatible API in StorageService
- [ ] T143 [US6] Create StorageInitializer to create buckets on startup in src/app/storage/storage.initializer.ts
- [ ] T144 [US6] Implement uploadBreweryLogo method in StorageService
- [ ] T145 [US6] Implement image optimization with Sharp in src/app/storage/image.service.ts

**Template Enhancements**
- [ ] T146 [P] [US6] Add brewery logo display to digest templates (digest.mjml)
- [ ] T147 [P] [US6] Implement responsive design with MJML media queries
- [ ] T148 [P] [US6] Add visual separators between content types and breweries in templates
- [ ] T149 [US6] Create template partials for reusable components (brewery-card, beer-release, event-listing) in src/app/digests/partials/

**Email Client Testing**
- [ ] T150 [US6] Add HTML minification to reduce email size in TemplateService
- [ ] T151 [US6] Test digest rendering in Gmail, Outlook 2016, Apple Mail (manual testing)
- [ ] T152 [US6] Verify mobile responsiveness on iOS and Android email clients (manual testing)

**Checkpoint**: At this point, digests have professional, consistent branding across all email clients

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

**Monitoring & Health Checks**
- [ ] T153 [P] Create health check endpoint GET /api/health in src/app/health/health.controller.ts
- [ ] T154 [P] Create Prometheus metrics exporter in src/common/metrics/prometheus.service.ts
- [ ] T155 [P] Add BullMQ queue metrics (job counts, latencies) to Prometheus
- [ ] T156 [P] Setup partition health monitoring cron job in src/app/content/services/partition-health.service.ts

**Error Handling & Validation**
- [ ] T157 [P] Add global validation pipe with class-validator in main.ts
- [ ] T158 [P] Create custom exception types in src/common/exceptions/
- [ ] T159 [P] Add request logging middleware in src/common/middleware/logger.middleware.ts

**Security**
- [ ] T160 [P] Add helmet middleware for security headers in main.ts
- [ ] T161 [P] Configure CORS with environment variables in main.ts
- [ ] T162 [P] Add rate limiting with @nestjs/throttler for API endpoints
- [ ] T163 [P] Implement password strength validation in RegisterDto

**Documentation**
- [ ] T164 [P] Add Swagger/OpenAPI documentation using @nestjs/swagger in main.ts
- [ ] T165 [P] Document all endpoints with @ApiOperation decorators
- [ ] T166 [P] Create API documentation in specs/001-brewery-digest/api-docs.md (auto-generated from Swagger)

**Testing & Validation**
- [ ] T167 [P] Run through quickstart.md validation scenarios manually
- [ ] T168 [P] Verify all success criteria from spec.md are met
- [ ] T169 [P] Performance testing: 1000 digests in <30 minutes (SC-010)
- [ ] T170 [P] Load testing: Content extraction <5 seconds per source

**Cleanup**
- [ ] T171 Code cleanup and refactoring for consistency
- [ ] T172 Remove unused dependencies and imports
- [ ] T173 Update README.md with setup instructions
- [ ] T174 Create deployment guide in specs/001-brewery-digest/deployment.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Story 3 (Phase 3)**: Depends on Foundational - MUST complete first (data pipeline)
- **User Story 2 (Phase 4)**: Depends on Foundational + US3 (needs content to show)
- **User Story 4 (Phase 5)**: Depends on Foundational only (independent of US2/US3)
- **User Story 1 (Phase 6)**: Depends on Foundational + US3 + US2 + US4 (needs all pieces)
- **User Story 5 (Phase 7)**: Depends on US1 (extends digest delivery)
- **User Story 6 (Phase 8)**: Depends on US1 (enhances digest appearance)
- **Polish (Phase 9)**: Depends on all desired user stories being complete

### User Story Dependencies

```
Foundational (Phase 2) → BLOCKS ALL
    ↓
    ├─→ US3: Content Ingestion (Phase 3) → MUST COMPLETE FIRST
    │     ↓
    │     ├─→ US2: Brewery Selection (Phase 4)
    │     │
    │     └─→ US4: Account Management (Phase 5)
    │           ↓
    │           └─→ US1: Weekly Digest Delivery (Phase 6) 🎯 MVP COMPLETE
    │                 ↓
    │                 ├─→ US5: Digest Customization (Phase 7)
    │                 │
    │                 └─→ US6: Visual Branding (Phase 8)
```

### Within Each User Story

- Models/schemas before services
- Services before controllers/jobs
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

**Phase 2 (Foundational)**: Tasks T011, T012, T013, T014, T015, T016 can run in parallel
**Phase 3 (US3)**: Tasks T030-T031 (social collectors), T040-T044 (OCR tasks) can run in parallel
**Phase 4 (US2)**: Tasks T068-T071 (brewery module setup) can run in parallel
**Phase 5 (US4)**: Tasks T081-T088 (auth & user module setup) can run in parallel
**Phase 6 (US1)**: Tasks T109-T112 (digest module setup) can run in parallel
**Phase 9 (Polish)**: Most tasks marked [P] can run in parallel

---

## Implementation Strategy

### MVP First (Minimum Viable Product)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: US3 (Content Ingestion) - Data pipeline
4. Complete Phase 4: US2 (Brewery Selection) - User can choose breweries
5. Complete Phase 5: US4 (Account Management) - Authentication
6. Complete Phase 6: US1 (Digest Delivery) - **MVP COMPLETE!**
7. **STOP and VALIDATE**: Test end-to-end flow independently
8. Deploy/demo if ready

### Incremental Delivery After MVP

1. Add Phase 7: US5 (Digest Customization) → Deploy/Demo
2. Add Phase 8: US6 (Visual Branding) → Deploy/Demo
3. Add Phase 9: Polish → Production Ready

### Parallel Team Strategy

With multiple developers:

1. **Week 1**: Team completes Setup + Foundational together
2. **Week 2-3**:
   - Developer A: US3 (Content Ingestion - largest, most complex)
   - Developer B: US4 (Account Management - independent)
3. **Week 4**:
   - Developer A: US2 (Brewery Selection - depends on US3)
   - Developer B: US1 (Digest Delivery - depends on all)
4. **Week 5**: Integration testing, US5, US6, Polish

---

## Notes

- **[P] tasks**: Different files, no dependencies - can run in parallel
- **[Story] label**: Maps task to specific user story for traceability
- **Critical path**: Setup → Foundational → US3 → US2 → US4 → US1 → MVP
- **US3 is blocking**: Must complete content ingestion before digest delivery
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at checkpoints to validate story independently
- Total estimated tasks: 174 tasks across 9 phases
- Estimated MVP completion: 119 tasks (through Phase 6)

---

## Success Criteria Validation

After completing MVP (Phase 6), verify these from spec.md:

- ✅ **SC-001**: Users receive digest within 1 hour of scheduled time 95% of time
- ✅ **SC-002**: Content extraction ≥90% precision
- ✅ **SC-003**: Brewery selection in <3 minutes
- ✅ **SC-005**: Process content from ≥50 breweries
- ✅ **SC-006**: Duplicate detection ≥80% reduction
- ✅ **SC-008**: Email delivery success rate >98%
- ✅ **SC-009**: 90% account creation success on first attempt
- ✅ **SC-010**: 1000 digests generated in <30 minutes

**MVP is ready when all Phase 6 tasks are complete and success criteria are met!**
