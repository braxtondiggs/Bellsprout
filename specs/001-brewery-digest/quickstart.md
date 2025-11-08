# Quickstart Guide: Brewery Newsletter Digest Application

**Feature Branch**: `001-brewery-digest`
**Created**: 2025-11-07
**Last Updated**: 2025-11-07

## Overview

This guide walks you through setting up the Brewery Newsletter Digest application locally using Docker Compose for all dependencies and the NestJS development server for the application.

**Time to Complete**: ~15 minutes

## Prerequisites

### Required Software

- **Node.js**: 20 LTS or higher
- **npm**: 10 or higher (comes with Node.js)
- **Docker Desktop**: 4.20+ (for Mac/Windows) or Docker Engine 24+ (for Linux)
- **Docker Compose**: 2.20+ (bundled with Docker Desktop)
- **Git**: 2.40+

### Optional Tools

- **Postman** or **Insomnia**: API testing (import OpenAPI spec)
- **DBeaver** or **pgAdmin**: PostgreSQL GUI
- **RedisInsight**: Redis GUI

### System Requirements

- **RAM**: 8GB minimum, 16GB recommended
- **Disk Space**: 5GB free space
- **OS**: macOS, Linux, or Windows with WSL2

## Installation Steps

### 1. Clone Repository

```bash
git clone <repository-url>
cd Bellsprout
git checkout 001-brewery-digest
```

### 2. Install Dependencies

```bash
npm install
```

This will install:
- NestJS framework and modules
- Prisma ORM and client
- BullMQ and Redis client
- Playwright for scraping
- OpenAI SDK
- Email libraries (Nodemailer, mailparser)
- MJML and Handlebars for templates
- And all other dependencies

### 3. Set Up Environment Variables

Create `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` with the following configuration:

```bash
# Application
NODE_ENV=development
PORT=3000
API_PREFIX=api/v1

# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/brewery_digest?schema=public"

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRATION=3600 # 1 hour in seconds

# OpenAI
OPENAI_API_KEY=sk-your-openai-api-key-here
OPENAI_MODEL=gpt-4o-mini

# Mailgun (optional for email testing)
SENDGRID_API_KEY=your-sendgrid-api-key-here
SENDGRID_FROM_EMAIL=noreply@brewerydigest.com
SENDGRID_FROM_NAME=Brewery Digest

# MinIO (S3-compatible storage)
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_REGION=us-east-1
S3_BUCKET=brewery-assets

# CDN (for production, use CloudFlare or CloudFront)
CDN_URL=http://localhost:9000

# Email Ingestion (Mailgun Inbound Parse webhook)
SENDGRID_WEBHOOK_SECRET=your-webhook-verification-key

# Feature Flags
ENABLE_SCRAPING=true
ENABLE_LLM_EXTRACTION=true
ENABLE_EMAIL_SENDING=false # Set to true when ready to test emails

# Monitoring
LOG_LEVEL=debug
```

### 4. Start Docker Services

Start PostgreSQL, Redis, and MinIO using Docker Compose:

```bash
# Start services in detached mode
docker compose -f docker/docker-compose.yml up -d

# Verify services are running
docker compose -f docker/docker-compose.yml ps
```

**Expected output**:
```
NAME                 IMAGE                    STATUS          PORTS
brewery-postgres     postgres:16-alpine       Up 10 seconds   0.0.0.0:5432->5432/tcp
brewery-redis        redis:7-alpine           Up 10 seconds   0.0.0.0:6379->6379/tcp
brewery-minio        minio/minio:latest       Up 10 seconds   0.0.0.0:9000-9001->9000-9001/tcp
```

### 5. Initialize Database

Run Prisma migrations to create database schema:

```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev --name init

# Apply partitioning (if using monthly partitions)
npx prisma migrate dev --name partition_content_items

# Seed database with NYC/DC breweries
npx prisma db seed
```

**Verify Database**:
```bash
# Open Prisma Studio (GUI for database)
npx prisma studio
```

Navigate to `http://localhost:5555` to view seeded data.

### 6. Configure MinIO

Initialize MinIO bucket and set public access policy:

```bash
# Install MinIO client (mc)
brew install minio/stable/mc  # macOS
# OR
# Download from: https://min.io/docs/minio/linux/reference/minio-mc.html

# Configure MinIO alias
mc alias set local http://localhost:9000 minioadmin minioadmin

# Create bucket
mc mb local/brewery-assets

# Set public read policy for logos and images
mc anonymous set download local/brewery-assets
```

**Verify MinIO Console**:
Navigate to `http://localhost:9001` and login with:
- **Username**: `minioadmin`
- **Password**: `minioadmin`

### 7. Start Development Server

```bash
npm run start:dev
```

**Expected output**:
```
[Nest] 12345  - 01/07/2025, 10:00:00 AM     LOG [NestFactory] Starting Nest application...
[Nest] 12345  - 01/07/2025, 10:00:01 AM     LOG [InstanceLoader] AppModule dependencies initialized
[Nest] 12345  - 01/07/2025, 10:00:01 AM     LOG [InstanceLoader] PrismaModule dependencies initialized
[Nest] 12345  - 01/07/2025, 10:00:01 AM     LOG [InstanceLoader] BullModule dependencies initialized
[Nest] 12345  - 01/07/2025, 10:00:02 AM     LOG [RoutesResolver] AuthController {/api/v1/auth}
[Nest] 12345  - 01/07/2025, 10:00:02 AM     LOG [RoutesResolver] UsersController {/api/v1/users}
[Nest] 12345  - 01/07/2025, 10:00:02 AM     LOG [RoutesResolver] BreweriesController {/api/v1/breweries}
[Nest] 12345  - 01/07/2025, 10:00:02 AM     LOG [NestApplication] Nest application successfully started
[Nest] 12345  - 01/07/2025, 10:00:02 AM     LOG Application is running on: http://localhost:3000
```

### 8. Verify Installation

Run health check:

```bash
curl http://localhost:3000/api/v1/health
```

**Expected response**:
```json
{
  "status": "ok",
  "timestamp": "2025-01-07T10:00:00.000Z",
  "uptime": 12.345
}
```

Check readiness (database, Redis, MinIO):

```bash
curl http://localhost:3000/api/v1/health/ready
```

**Expected response**:
```json
{
  "status": "ready",
  "checks": {
    "database": "ok",
    "redis": "ok",
    "storage": "ok"
  }
}
```

## Testing the Application

### 1. Register a User

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123!",
    "firstName": "John",
    "lastName": "Doe"
  }'
```

**Response**:
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "tokenType": "Bearer",
  "expiresIn": 3600,
  "user": {
    "id": "cm1abc123",
    "email": "test@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "emailVerified": false,
    "subscriptionStatus": "active",
    "createdAt": "2025-01-07T10:00:00.000Z",
    "updatedAt": "2025-01-07T10:00:00.000Z"
  }
}
```

**Save the `accessToken` for subsequent requests.**

### 2. Browse Breweries

```bash
curl http://localhost:3000/api/v1/breweries?region=NYC
```

**Response**:
```json
{
  "data": [
    {
      "id": "brewery_1",
      "name": "Other Half Brewing",
      "slug": "other-half-brewing",
      "city": "Brooklyn",
      "state": "NY",
      "region": "NYC",
      "logoUrl": "http://localhost:9000/brewery-assets/logos/brewery_1.png"
    },
    {
      "id": "brewery_2",
      "name": "Torch & Crown Brewing",
      "slug": "torch-crown-brewing",
      "city": "Manhattan",
      "state": "NY",
      "region": "NYC"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 2,
    "totalPages": 1
  }
}
```

### 3. Subscribe to Breweries

```bash
curl -X POST http://localhost:3000/api/v1/subscriptions/breweries \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "breweryIds": ["brewery_1", "brewery_2"]
  }'
```

### 4. Update Preferences

```bash
curl -X PATCH http://localhost:3000/api/v1/users/me/preferences \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "digestDeliveryDay": 0,
    "contentTypePreferences": ["release", "event"],
    "digestFormat": "detailed"
  }'
```

### 5. Preview Digest

```bash
curl http://localhost:3000/api/v1/digests/preview \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Running Background Jobs

### Start Queue Workers

In a separate terminal, start the queue workers:

```bash
npm run start:worker
```

This starts processors for all queues (collection, extraction, deduplication, digest).

### Trigger Collection Jobs Manually

```bash
# Trigger Instagram scraping for a brewery
curl -X POST http://localhost:3000/api/v1/admin/jobs/trigger \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jobType": "collect:scrape-instagram",
    "breweryId": "brewery_1"
  }'
```

### Monitor Queue Status

Open Bull Board UI:
```bash
open http://localhost:3000/admin/queues
```

**Login**: Use admin credentials (configure in `.env`)

**Features**:
- View queue depths (waiting, active, completed, failed)
- Inspect job details and payloads
- Retry failed jobs manually
- View job logs and error traces

## Database Administration

### Prisma Studio

GUI for viewing and editing database records:

```bash
npx prisma studio
```

Navigate to `http://localhost:5555`

### Direct PostgreSQL Access

```bash
# Using psql
docker exec -it brewery-postgres psql -U postgres -d brewery_digest

# Run queries
SELECT * FROM breweries LIMIT 5;
SELECT * FROM users WHERE email = 'test@example.com';
```

### View Partitions

```sql
-- List all content_items partitions
SELECT tablename, schemaname
FROM pg_tables
WHERE tablename LIKE 'content_items%'
ORDER BY tablename DESC;
```

## Testing Strategies

### Unit Tests

Run unit tests with Jest:

```bash
npm run test

# Watch mode
npm run test:watch

# Coverage
npm run test:cov
```

### Integration Tests

Test API endpoints with Supertest:

```bash
npm run test:e2e
```

### Manual API Testing

Import OpenAPI specification into Postman:

1. Open Postman
2. Import → Link → `http://localhost:3000/api/v1/docs/openapi.yaml`
3. Create environment with `baseUrl = http://localhost:3000/api/v1`
4. Add `accessToken` variable after login

## Seed Data

The `prisma/seed.ts` script includes:

- **10 NYC Breweries**: Other Half, Sixpoint, Torch & Crown, etc.
- **10 DC Breweries**: Right Proper, Bluejacket, etc.
- **Sample Content Items**: 20 beer releases, 10 events, 5 updates (for testing)

**Re-run Seed**:
```bash
npx prisma db seed
```

## Common Issues

### PostgreSQL Connection Error

**Error**: `Error: connect ECONNREFUSED 127.0.0.1:5432`

**Solution**:
```bash
# Check if PostgreSQL container is running
docker compose -f docker/docker-compose.yml ps

# Restart services
docker compose -f docker/docker-compose.yml restart

# Check logs
docker compose -f docker/docker-compose.yml logs postgres
```

### Redis Connection Error

**Error**: `Error: connect ECONNREFUSED 127.0.0.1:6379`

**Solution**:
```bash
# Check Redis container
docker compose -f docker/docker-compose.yml ps

# Test Redis connection
docker exec -it brewery-redis redis-cli PING
# Expected: PONG

# Restart Redis
docker compose -f docker/docker-compose.yml restart redis
```

### MinIO Access Denied

**Error**: `Access Denied when uploading to MinIO`

**Solution**:
```bash
# Check bucket policy
mc anonymous get local/brewery-assets

# Set download policy
mc anonymous set download local/brewery-assets

# Verify in MinIO Console (http://localhost:9001)
```

### Prisma Migration Error

**Error**: `Migration failed to apply`

**Solution**:
```bash
# Reset database (WARNING: Deletes all data)
npx prisma migrate reset

# Apply migrations
npx prisma migrate deploy

# Re-seed
npx prisma db seed
```

### OpenAI API Key Error

**Error**: `OpenAI API key is missing`

**Solution**:
1. Get API key from https://platform.openai.com/api-keys
2. Add to `.env`: `OPENAI_API_KEY=sk-...`
3. Restart server

### Port Already in Use

**Error**: `Port 3000 is already in use`

**Solution**:
```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 <PID>

# Or change port in .env
PORT=3001
```

## Development Workflow

### 1. Create New Migration

When modifying Prisma schema:

```bash
# Update schema.prisma
nano prisma/schema.prisma

# Create migration
npx prisma migrate dev --name descriptive_name

# Apply migration
npx prisma migrate deploy

# Regenerate Prisma client
npx prisma generate
```

### 2. Add New Job Type

1. Define job interface in `src/common/queues/job-types.ts`
2. Add processor in appropriate module (e.g., `src/app/content/jobs/`)
3. Register processor in module
4. Update `contracts/jobs.md` documentation

### 3. Test Email Templates

```bash
# Generate test digest without sending
npm run test:digest-preview -- --userId=user_123

# Render MJML template
npm run render-template -- --template=digest --output=./test-digest.html

# Open in browser
open ./test-digest.html
```

### 4. Debug Job Processing

```bash
# Enable debug logging
LOG_LEVEL=debug npm run start:dev

# Tail logs
npm run start:dev | grep -i "queue\|job"

# Check Redis keys
docker exec -it brewery-redis redis-cli
> KEYS bull:*
> GET bull:content-collection:1
```

## Environment-Specific Configuration

### Development (`.env.development`)

```bash
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug
ENABLE_SCRAPING=true
ENABLE_LLM_EXTRACTION=false # Use mock responses to save costs
ENABLE_EMAIL_SENDING=false  # Don't send real emails
```

### Staging (`.env.staging`)

```bash
NODE_ENV=staging
PORT=3000
LOG_LEVEL=info
ENABLE_SCRAPING=true
ENABLE_LLM_EXTRACTION=true
ENABLE_EMAIL_SENDING=true
```

### Production (`.env.production`)

```bash
NODE_ENV=production
PORT=3000
LOG_LEVEL=warn
ENABLE_SCRAPING=true
ENABLE_LLM_EXTRACTION=true
ENABLE_EMAIL_SENDING=true
```

## Performance Testing

### Load Testing with Artillery

```bash
npm install -g artillery

# Run load test
artillery quick --count 100 --num 10 http://localhost:3000/api/v1/health
```

### Database Query Performance

```sql
-- Enable query timing
\timing

-- Test content item query
EXPLAIN ANALYZE
SELECT * FROM content_items
WHERE brewery_id = 'brewery_1'
  AND publication_date >= NOW() - INTERVAL '7 days'
  AND is_duplicate = false
ORDER BY publication_date DESC;
```

## Backup and Restore

### Backup PostgreSQL

```bash
# Backup to file
docker exec brewery-postgres pg_dump -U postgres brewery_digest > backup.sql

# Backup to compressed file
docker exec brewery-postgres pg_dump -U postgres -Fc brewery_digest > backup.dump
```

### Restore PostgreSQL

```bash
# Restore from SQL file
docker exec -i brewery-postgres psql -U postgres brewery_digest < backup.sql

# Restore from dump file
docker exec -i brewery-postgres pg_restore -U postgres -d brewery_digest backup.dump
```

### Backup MinIO

```bash
# Sync to local backup
mc mirror local/brewery-assets ./minio-backup/

# Sync to S3 (for production)
mc mirror local/brewery-assets s3/brewery-backup/
```

## Useful Commands

```bash
# View all Docker logs
docker compose -f docker/docker-compose.yml logs -f

# Stop all services
docker compose -f docker/docker-compose.yml down

# Remove volumes (WARNING: Deletes all data)
docker compose -f docker/docker-compose.yml down -v

# Rebuild containers
docker compose -f docker/docker-compose.yml up --build

# Check container resource usage
docker stats

# Clean up unused Docker resources
docker system prune -a

# View Prisma migrations
npx prisma migrate status

# Format Prisma schema
npx prisma format

# Validate Prisma schema
npx prisma validate

# Pull schema from database
npx prisma db pull

# Push schema to database (dev only)
npx prisma db push
```

## Next Steps

After completing the quickstart:

1. **Review API Documentation**: Explore OpenAPI spec at `specs/001-brewery-digest/contracts/openapi.yaml`
2. **Review Job Contracts**: Understand BullMQ jobs at `specs/001-brewery-digest/contracts/jobs.md`
3. **Review Data Model**: Study Prisma schema at `specs/001-brewery-digest/data-model.md`
4. **Implement Features**: Follow tasks in `specs/001-brewery-digest/tasks.md` (generated by `/speckit.tasks`)
5. **Run Tests**: Ensure all tests pass with `npm test`
6. **Configure Monitoring**: Set up Prometheus metrics and logging
7. **Deploy to Staging**: Follow deployment guide in `docs/deployment.md`

## Resources

- **NestJS Documentation**: https://docs.nestjs.com
- **Prisma Documentation**: https://www.prisma.io/docs
- **BullMQ Documentation**: https://docs.bullmq.io
- **Playwright Documentation**: https://playwright.dev
- **OpenAPI Specification**: https://swagger.io/specification/
- **Docker Compose Reference**: https://docs.docker.com/compose/

## Support

For issues or questions:
- **GitHub Issues**: Create an issue with `[quickstart]` prefix
- **Team Chat**: #brewery-digest-dev channel
- **Documentation**: Check `specs/001-brewery-digest/` folder
