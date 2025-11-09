<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- You have access to the Nx MCP server and its tools, use them to help the user
- When answering questions about the repository, use the `nx_workspace` tool first to gain an understanding of the workspace architecture where applicable.
- When working in individual projects, use the `nx_project_details` mcp tool to analyze and understand the specific project structure and dependencies
- For questions around nx configuration, best practices or if you're unsure, use the `nx_docs` tool to get relevant, up-to-date docs. Always use this instead of assuming things about nx configuration
- If the user needs help with an Nx configuration or project graph error, use the `nx_workspace` tool to get any errors

# CI Error Guidelines

If the user wants help with fixing an error in their CI pipeline, use the following flow:
- Retrieve the list of current CI Pipeline Executions (CIPEs) using the `nx_cloud_cipe_details` tool
- If there are any errors, use the `nx_cloud_fix_cipe_failure` tool to retrieve the logs for a specific task
- Use the task logs to see what's wrong and help the user fix their problem. Use the appropriate tools if necessary
- Make sure that the problem is fixed by running the task that you passed into the `nx_cloud_fix_cipe_failure` tool

<!-- nx configuration end-->

# Brewery Digest Project Guidelines

## Project Overview

This is a NestJS-based brewery newsletter aggregation platform that:
- Collects content from multiple sources (RSS, social media, emails)
- Uses AI (Claude) for content extraction and categorization
- Sends personalized weekly digests to subscribers

## Architecture & Tech Stack

- **Framework**: NestJS 11 with TypeScript 5.9
- **Runtime**: Node.js 22
- **Database**: PostgreSQL 16 + Prisma ORM
- **Queue/Cache**: Redis 7 + BullMQ
- **Email**: Resend API
- **AI**: Anthropic Claude (Sonnet 4)
- **Scraping**: Playwright for social media
- **Templates**: MJML + Handlebars for email rendering
- **Deployment**: Docker + Coolify

## Project Structure

The main API application is located at `apps/api/src/app/` with these modules:

- **auth/** - JWT authentication and passport strategies
- **users/** - User management and account operations
- **breweries/** - Brewery CRUD operations
- **content/** - Content ingestion pipeline (RSS, social, email)
  - Collectors: Instagram, Facebook, RSS
  - Processors: OCR, LLM extraction, deduplication
  - Jobs: Collect, extract, deduplicate queues
  - Schedulers: Automated content fetching
- **email/** - Email service (Resend integration)
- **digests/** - Weekly digest generation and delivery
  - Template rendering with MJML
  - Digest generation and scheduling
  - Email delivery processors

## Database Schema (Prisma)

Key models:
- `User` - User accounts with subscriptions
- `Brewery` - Brewery profiles with social links
- `UserBrewerySubscription` - Many-to-many user/brewery subscriptions
- `ContentItem` - Aggregated content from all sources
- `Digest` - Generated email digests
- `DigestContent` - Link table for digest content

## Development Workflow

1. **Starting Development**
   ```bash
   npm run docker:up          # Start PostgreSQL, Redis, MinIO
   npm run prisma:migrate     # Run migrations
   npm start                  # Start API in dev mode
   ```

2. **Database Changes**
   - Always use Prisma migrations
   - Schema is in `prisma/schema.prisma`
   - Run `npm run prisma:generate` after schema changes

3. **Testing**
   - Unit tests: `npm test`
   - E2E tests: `npm run test:e2e`
   - Coverage: `npm run test:cov`

4. **Code Quality**
   - Always run `npm run lint` before committing
   - Format with `npm run format`

## Common Patterns

### Module Structure
Each NestJS module follows this pattern:
```
module-name/
├── module-name.module.ts      # Module definition
├── module-name.service.ts     # Business logic
├── module-name.controller.ts  # HTTP endpoints
├── dto/                       # Data transfer objects
├── entities/                  # Database entities (if needed)
└── jobs/                      # BullMQ processors (if applicable)
```

### Queue Jobs (BullMQ)
- Jobs are defined in `*/jobs/*.processor.ts`
- Use `@Processor` decorator with queue name from `QueueName` enum
- Extend `WorkerHost` from `@nestjs/bullmq`
- Set appropriate concurrency levels

### Schedulers
- Cron jobs in `*/schedulers/*.scheduler.ts`
- Use `@Cron` decorator with cron expression
- Always set timezone to 'UTC'

### Prisma Usage
- Import `PrismaService` from `common/database/prisma.service`
- Always use transactions for multi-step operations
- Use `select` to limit fields returned
- Include relations with `include` when needed

## Important Notes

1. **Field Names** - Prisma schema uses specific field names:
   - Brewery: `rssFeedUrl` (not `rssUrl`), `facebookHandle` (not `facebookUrl`)
   - User: `subscriptionStatus` (not `isActive`)
   - Digest: `emailHtml` (not `renderedHtml`), `deliveryDate` (not `periodStart`/`periodEnd`)

2. **Environment Variables**
   - Always reference `.env.example` for required variables
   - Never commit `.env` file
   - Use `ConfigService` for accessing environment variables

3. **AI Integration**
   - Claude API calls are in `content/processors/llm-extraction.service.ts`
   - Uses Anthropic SDK with Sonnet 4 model
   - Extracts structured data: beer releases, events, updates

4. **Email Templates**
   - MJML templates in `digests/templates/`
   - Handlebars for variable substitution
   - CSS inlining with `juice`
   - HTML minification before sending

5. **Deployment**
   - Docker multi-stage build for production
   - Coolify for hosting
   - GitHub Actions for CI/CD
   - Migrations run automatically on container start

## Troubleshooting

- **Build Errors**: Check Node version (must be 22+)
- **Database Errors**: Ensure PostgreSQL is running and migrations are applied
- **Queue Errors**: Verify Redis is running
- **Type Errors**: Run `npm run prisma:generate` to regenerate Prisma Client

## Resources

- Project README: `README.md`
- Deployment Guide: `DEPLOYMENT.md`
- Feature Specs: `specs/` directory
- Email Setup: `RESEND_SETUP.md`
