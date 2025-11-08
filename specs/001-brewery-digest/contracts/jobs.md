# BullMQ Job Contracts: Brewery Newsletter Digest Application

**Feature Branch**: `001-brewery-digest`
**Created**: 2025-11-07
**Last Updated**: 2025-11-07

## Overview

This document defines all BullMQ job types, payloads, processing stages, retry policies, and priority tiers for the 4-stage content processing pipeline: Collection → Extraction → Deduplication → Digest Generation.

## Technology Stack

- **Queue System**: BullMQ 5.x
- **Storage**: Redis 7+
- **Concurrency**: Configurable per queue
- **Monitoring**: Bull Board UI

## Queue Architecture

### 4-Stage Pipeline

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  COLLECT    │────▶│  EXTRACT    │────▶│ DEDUPLICATE │────▶│   DIGEST    │
│  Queue      │     │  Queue      │     │  Queue      │     │   Queue     │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

**Flow**:
1. **Collection**: Scrape/fetch content from email, Instagram, Facebook, RSS
2. **Extraction**: Process raw content with LLM to extract structured data
3. **Deduplication**: Identify and mark duplicate content using MinHash + cosine similarity
4. **Digest**: Generate personalized weekly digests for active users

### Queue Configuration

```typescript
export const QUEUES = {
  COLLECT: 'content-collection',
  EXTRACT: 'content-extraction',
  DEDUPLICATE: 'content-deduplication',
  DIGEST: 'digest-generation',
} as const;

export const QUEUE_CONFIG = {
  [QUEUES.COLLECT]: {
    concurrency: 5,
    limiter: {
      max: 60,        // Max 60 jobs
      duration: 60000 // Per 60 seconds
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000   // 5s, 10s, 20s
      },
      removeOnComplete: 1000,
      removeOnFail: 5000
    }
  },
  [QUEUES.EXTRACT]: {
    concurrency: 10,
    defaultJobOptions: {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 2000   // 2s, 4s, 8s, 16s, 32s
      },
      removeOnComplete: 1000,
      removeOnFail: 5000
    }
  },
  [QUEUES.DEDUPLICATE]: {
    concurrency: 3,
    defaultJobOptions: {
      attempts: 2,
      backoff: {
        type: 'fixed',
        delay: 1000   // 1s
      },
      removeOnComplete: 500,
      removeOnFail: 2000
    }
  },
  [QUEUES.DIGEST]: {
    concurrency: 2,
    limiter: {
      max: 100,       // Max 100 digests
      duration: 60000 // Per 60 seconds (Mailgun rate limit)
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 10000  // 10s, 20s, 40s
      },
      removeOnComplete: 100,
      removeOnFail: 1000
    }
  }
};
```

## Priority Tiers

```typescript
export enum JobPriority {
  REALTIME = 1,     // Email webhooks (process within minutes)
  SCHEDULED = 2,    // Scraping jobs (process within hours)
  BATCH = 3,        // Digest generation (overnight batch)
  BACKFILL = 4,     // Historical data (low priority, no SLA)
}
```

## Collection Queue Jobs

### 1. collect:email-newsletter

**Description**: Process incoming brewery newsletter from email webhook (FR-006)

**Payload Schema**:
```typescript
interface EmailNewsletterJob {
  breweryId: string;
  email: {
    from: string;
    subject: string;
    html: string;
    text: string;
    receivedAt: string; // ISO 8601
    messageId: string;
  };
}
```

**Priority**: `JobPriority.REALTIME` (1)

**Retry Policy**: 3 attempts, exponential backoff (5s, 10s, 20s)

**Processing Steps**:
1. Validate brewery ID exists
2. Extract content using `mailparser`
3. Store raw content in database
4. Emit job to extraction queue
5. Mark email as processed

**Success Output**: Creates `ContentItem` record with raw content

**Failure Handling**:
- Unknown brewery: Store in `failed_jobs`, alert admin
- Malformed email: Log error, skip processing
- Database error: Retry with backoff

**Example**:
```typescript
await collectQueue.add('email-newsletter', {
  breweryId: 'cm1abc123',
  email: {
    from: 'newsletter@otherhalfbrewing.com',
    subject: 'New Release: Hazy IPA',
    html: '<html>...</html>',
    text: 'Plain text version...',
    receivedAt: '2025-01-07T10:00:00Z',
    messageId: 'msg_123456'
  }
}, { priority: JobPriority.REALTIME });
```

---

### 2. collect:scrape-instagram

**Description**: Scrape Instagram posts from brewery profile (FR-006)

**Payload Schema**:
```typescript
interface ScrapeInstagramJob {
  breweryId: string;
  instagramHandle: string;
  lastScrapedAt?: string; // ISO 8601
}
```

**Priority**: `JobPriority.SCHEDULED` (2)

**Retry Policy**: 3 attempts, exponential backoff (5s, 10s, 20s)

**Processing Steps**:
1. Launch Playwright browser
2. Navigate to `https://www.instagram.com/{handle}/`
3. Intercept GraphQL API responses
4. Extract posts from last 7 days
5. Create `ContentItem` records for each post
6. Emit extraction jobs for each post
7. Update `lastScrapedAt` timestamp

**Rate Limiting**: 1 request per brewery per hour (enforced by BullMQ limiter)

**Success Output**: Creates multiple `ContentItem` records

**Failure Handling**:
- Instagram blocking: Exponential backoff, alert admin after 3 failures
- Handle not found: Mark brewery as inactive, skip future scraping
- Network timeout: Retry with increased timeout

**Example**:
```typescript
await collectQueue.add('scrape-instagram', {
  breweryId: 'cm1abc123',
  instagramHandle: 'otherhalfnyc',
  lastScrapedAt: '2025-01-06T10:00:00Z'
}, {
  priority: JobPriority.SCHEDULED,
  delay: Math.random() * 3600000 // Random delay 0-1 hour (stagger requests)
});
```

---

### 3. collect:scrape-facebook

**Description**: Scrape Facebook posts from brewery page (FR-006)

**Payload Schema**:
```typescript
interface ScrapeFacebookJob {
  breweryId: string;
  facebookHandle: string;
  lastScrapedAt?: string; // ISO 8601
}
```

**Priority**: `JobPriority.SCHEDULED` (2)

**Retry Policy**: 3 attempts, exponential backoff (5s, 10s, 20s)

**Processing Steps**:
1. Launch Playwright browser
2. Navigate to `https://www.facebook.com/{handle}/`
3. Parse HTML for recent posts
4. Extract posts from last 7 days
5. Create `ContentItem` records
6. Emit extraction jobs

**Rate Limiting**: 1 request per brewery per hour

**Success Output**: Creates multiple `ContentItem` records

**Failure Handling**: Similar to Instagram scraping

**Example**:
```typescript
await collectQueue.add('scrape-facebook', {
  breweryId: 'cm1abc123',
  facebookHandle: 'otherhalfbrewing',
  lastScrapedAt: '2025-01-06T10:00:00Z'
}, { priority: JobPriority.SCHEDULED });
```

---

### 4. collect:fetch-rss

**Description**: Fetch and parse brewery RSS feed (FR-006)

**Payload Schema**:
```typescript
interface FetchRSSJob {
  breweryId: string;
  rssFeedUrl: string;
  lastFetchedAt?: string; // ISO 8601
}
```

**Priority**: `JobPriority.SCHEDULED` (2)

**Retry Policy**: 3 attempts, exponential backoff (5s, 10s, 20s)

**Processing Steps**:
1. Fetch RSS feed via HTTP
2. Parse XML using `rss-parser`
3. Filter items from last 7 days
4. Create `ContentItem` records
5. Emit extraction jobs

**Rate Limiting**: Minimum 15 minutes between fetches per feed

**Success Output**: Creates multiple `ContentItem` records

**Failure Handling**:
- Feed not found (404): Mark feed as inactive
- Invalid XML: Log error, alert admin
- Network timeout: Retry

**Example**:
```typescript
await collectQueue.add('fetch-rss', {
  breweryId: 'cm1abc123',
  rssFeedUrl: 'https://sixpoint.com/feed/',
  lastFetchedAt: '2025-01-06T10:00:00Z'
}, { priority: JobPriority.SCHEDULED });
```

---

## Extraction Queue Jobs

### 5. extract:content-item

**Description**: Extract structured data from raw content using LLM (FR-007, FR-008)

**Payload Schema**:
```typescript
interface ExtractContentJob {
  contentItemId: string;
  breweryId: string;
  sourceType: 'email' | 'instagram' | 'facebook' | 'rss';
  rawContent: string;
  publicationDate: string; // ISO 8601
}
```

**Priority**: Inherited from collection job (1 for email, 2 for social/RSS)

**Retry Policy**: 5 attempts, exponential backoff (2s, 4s, 8s, 16s, 32s)

**Processing Steps**:
1. Truncate content if > 10,000 tokens
2. Call OpenAI GPT-4o-mini with extraction prompt
3. Parse JSON response
4. Validate extracted data with Zod schema
5. Update `ContentItem` with `extractedData` and `confidenceScore`
6. Emit deduplication job

**LLM Configuration**:
```typescript
const completion = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [
    { role: 'system', content: EXTRACTION_PROMPT },
    { role: 'user', content: rawContent }
  ],
  response_format: { type: 'json_object' },
  temperature: 0.1,
  max_tokens: 2000
});
```

**Success Output**: Updates `ContentItem.extractedData` and `confidenceScore`

**Failure Handling**:
- OpenAI API error: Retry with exponential backoff
- Invalid JSON: Log error, mark item for manual review
- Rate limit: Implement queue-based rate limiting
- Budget exceeded: Pause extraction, alert admin

**Example**:
```typescript
await extractQueue.add('content-item', {
  contentItemId: 'content_123',
  breweryId: 'cm1abc123',
  sourceType: 'email',
  rawContent: 'We are excited to announce...',
  publicationDate: '2025-01-07T10:00:00Z'
}, { priority: JobPriority.REALTIME });
```

---

## Deduplication Queue Jobs

### 6. deduplicate:content-item

**Description**: Detect and mark duplicate content using MinHash + cosine similarity (FR-009)

**Payload Schema**:
```typescript
interface DeduplicateJob {
  contentItemId: string;
}
```

**Priority**: `JobPriority.SCHEDULED` (2)

**Retry Policy**: 2 attempts, fixed backoff (1s)

**Processing Steps**:
1. Fetch content item from database
2. Generate MinHash signature (128 bytes)
3. Find candidate duplicates using Hamming distance query
4. Calculate cosine similarity for candidates
5. If similarity > 0.82 AND within ±3 days:
   - Mark item as duplicate
   - Link to original via `duplicateOfId`
6. Update `minhashSignature` field

**Database Query**:
```sql
SELECT *
FROM content_items
WHERE brewery_id = $breweryId
  AND id != $contentItemId
  AND type = $type
  AND publication_date BETWEEN $startDate AND $endDate
  AND hamming_distance(minhash_signature, $signature) < 64
LIMIT 20
```

**Success Output**: Updates `ContentItem.isDuplicate` and `duplicateOfId`

**Failure Handling**:
- Database timeout: Retry once
- No signature generated: Skip deduplication (continue without marking)

**Example**:
```typescript
await deduplicateQueue.add('content-item', {
  contentItemId: 'content_123'
}, { priority: JobPriority.SCHEDULED });
```

---

## Digest Queue Jobs

### 7. digest:generate-user-digest

**Description**: Generate personalized digest for a single user (FR-010, FR-011)

**Payload Schema**:
```typescript
interface GenerateDigestJob {
  userId: string;
  deliveryDate: string; // ISO 8601
  isPreview?: boolean;  // If true, don't send email
}
```

**Priority**: `JobPriority.BATCH` (3)

**Retry Policy**: 3 attempts, exponential backoff (10s, 20s, 40s)

**Processing Steps**:
1. Fetch user with brewery subscriptions and preferences
2. Query content items:
   - From user's subscribed breweries
   - Published in last 7 days
   - Not marked as duplicates
   - Matching user's content type preferences
3. Group content by brewery
4. Render email template with MJML + Handlebars
5. If not preview:
   - Send email via Mailgun
   - Create `Digest` record
   - Link content items via `DigestContent`
6. Return digest details

**Content Query**:
```typescript
const contentItems = await prisma.contentItem.findMany({
  where: {
    breweryId: {
      in: user.brewerySubscriptions.map(sub => sub.breweryId)
    },
    publicationDate: {
      gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    },
    isDuplicate: false,
    type: {
      in: user.contentTypePreferences
    }
  },
  include: {
    brewery: {
      select: {
        name: true,
        logoUrl: true,
        city: true
      }
    }
  },
  orderBy: [
    { brewery: { name: 'asc' } },
    { publicationDate: 'desc' }
  ]
});
```

**Success Output**: Creates `Digest` record, sends email

**Failure Handling**:
- No content: Send "nothing new this week" email (FR-023)
- Email delivery failure: Retry 3 times, mark as failed
- Template rendering error: Log error, alert admin
- Mailgun rate limit: Queue with delay

**Example**:
```typescript
await digestQueue.add('generate-user-digest', {
  userId: 'user_123',
  deliveryDate: '2025-01-12T08:00:00Z',
  isPreview: false
}, { priority: JobPriority.BATCH });
```

---

### 8. digest:batch-generate

**Description**: Schedule digest generation for all active users

**Payload Schema**:
```typescript
interface BatchGenerateJob {
  deliveryDate: string; // ISO 8601
  deliveryDay: number;  // 0-6 (Sunday-Saturday)
}
```

**Priority**: `JobPriority.BATCH` (3)

**Retry Policy**: None (job cannot be retried)

**Processing Steps**:
1. Query all users with:
   - `subscriptionStatus = 'active'`
   - `digestDeliveryDay = {deliveryDay}`
2. For each user, emit `digest:generate-user-digest` job
3. Stagger job emissions to avoid rate limit spikes
4. Log batch summary (total users, jobs created)

**Success Output**: Emits N `generate-user-digest` jobs

**Failure Handling**:
- Query error: Log error, retry manually
- No users: Log info message

**Example**:
```typescript
await digestQueue.add('batch-generate', {
  deliveryDate: '2025-01-12T08:00:00Z',
  deliveryDay: 0 // Sunday
}, { priority: JobPriority.BATCH });
```

---

## Scheduled Jobs (Cron)

### Collection Schedule

```typescript
// Instagram collection: Every 6 hours
@Cron('0 */6 * * *')
async scheduleInstagramCollection() {
  const breweries = await prisma.brewery.findMany({
    where: { instagramHandle: { not: null }, isActive: true }
  });

  for (const brewery of breweries) {
    await collectQueue.add('scrape-instagram', {
      breweryId: brewery.id,
      instagramHandle: brewery.instagramHandle,
      lastScrapedAt: brewery.lastScrapedAt?.toISOString()
    }, {
      priority: JobPriority.SCHEDULED,
      delay: Math.random() * 3600000 // Stagger over 1 hour
    });
  }
}

// Facebook collection: Every 6 hours (offset from Instagram)
@Cron('0 3,9,15,21 * * *')
async scheduleFacebookCollection() {
  // Similar to Instagram
}

// RSS collection: Every 2 hours
@Cron('0 */2 * * *')
async scheduleRSSCollection() {
  // Similar to Instagram
}
```

### Digest Schedule

```typescript
// Generate digests every Sunday at 8am
@Cron('0 8 * * 0')
async scheduleSundayDigests() {
  await digestQueue.add('batch-generate', {
    deliveryDate: new Date().toISOString(),
    deliveryDay: 0
  }, { priority: JobPriority.BATCH });
}

// Repeat for each day of week...
@Cron('0 8 * * 1') // Monday
@Cron('0 8 * * 2') // Tuesday
// ... etc
```

## Job Monitoring

### Metrics to Track

1. **Queue Depth**: Number of jobs waiting in each queue
2. **Processing Time**: Average time per job type
3. **Failure Rate**: Percentage of failed jobs per queue
4. **Dead Letter Queue Size**: Failed jobs after max retries
5. **Throughput**: Jobs processed per second

### Health Checks

```typescript
async getQueueHealth() {
  return {
    collect: {
      waiting: await collectQueue.getWaitingCount(),
      active: await collectQueue.getActiveCount(),
      failed: await collectQueue.getFailedCount(),
      completed: await collectQueue.getCompletedCount()
    },
    extract: {
      waiting: await extractQueue.getWaitingCount(),
      active: await extractQueue.getActiveCount(),
      failed: await extractQueue.getFailedCount(),
      completed: await extractQueue.getCompletedCount()
    },
    deduplicate: {
      waiting: await deduplicateQueue.getWaitingCount(),
      active: await deduplicateQueue.getActiveCount(),
      failed: await deduplicateQueue.getFailedCount(),
      completed: await deduplicateQueue.getCompletedCount()
    },
    digest: {
      waiting: await digestQueue.getWaitingCount(),
      active: await digestQueue.getActiveCount(),
      failed: await digestQueue.getFailedCount(),
      completed: await digestQueue.getCompletedCount()
    }
  };
}
```

### Alerting Thresholds

- Queue depth > 1000: Alert (backlog building)
- Failed jobs > 100 in 1 hour: Alert (systemic issue)
- Processing time > 2x average: Warning (performance degradation)
- Dead letter queue > 50: Alert (jobs failing after retries)

## Error Handling Patterns

### Transient Errors (Retry)
- Network timeouts
- Rate limit exceeded
- Database connection errors
- LLM API rate limits

### Permanent Errors (No Retry)
- Invalid job payload
- Brewery not found
- User account deleted
- Content malformed beyond recovery

### Dead Letter Queue Handler

```typescript
@OnQueueFailed()
async handleFailedJob(job: Job, error: Error) {
  if (job.attemptsMade >= job.opts.attempts) {
    // Job exhausted all retries
    await prisma.failedJob.create({
      data: {
        queueName: job.queueName,
        jobName: job.name,
        jobData: job.data,
        error: error.message,
        stackTrace: error.stack,
        attemptsMade: job.attemptsMade
      }
    });

    // Alert admin for critical jobs
    if (job.name === 'generate-user-digest') {
      await alertService.notify({
        type: 'job-failure',
        severity: 'high',
        job: job.name,
        userId: job.data.userId,
        error: error.message
      });
    }
  }
}
```

## Testing Strategy

### Unit Tests
- Test job payload validation
- Mock external dependencies (LLM, Playwright)
- Verify job emissions

### Integration Tests
- Test job processing with real Redis
- Verify job chaining (collect → extract → deduplicate)
- Test retry logic

### E2E Tests
- Test full pipeline with sample brewery content
- Verify digest generation end-to-end
- Test failure scenarios and recovery

## Performance Targets

| Job Type | Target Processing Time | Max Concurrency | Throughput |
|----------|----------------------|-----------------|------------|
| `collect:email-newsletter` | < 2 seconds | 10 | 300/min |
| `collect:scrape-instagram` | < 30 seconds | 5 | 10/min |
| `collect:scrape-facebook` | < 30 seconds | 5 | 10/min |
| `collect:fetch-rss` | < 5 seconds | 10 | 60/min |
| `extract:content-item` | < 5 seconds | 10 | 120/min |
| `deduplicate:content-item` | < 1 second | 3 | 180/min |
| `digest:generate-user-digest` | < 10 seconds | 2 | 12/min |

**Goal**: Process 1000 digests in 30 minutes = 33 digests/minute
- With 2 concurrent workers @ 10s/digest = 12 digests/minute
- **Result**: Achievable with 3 workers

## Redis Memory Management

### Job Data Size Limits
- Max payload size: 100KB per job
- Store references (IDs) instead of full content
- Use database for large data (raw HTML, images)

### Cleanup Policy
- Completed jobs: Keep 1000 most recent
- Failed jobs: Keep 5000 most recent
- TTL on completed jobs: 7 days
- TTL on failed jobs: 30 days

### Memory Estimation
- 1000 active jobs × 10KB = 10MB
- 1000 completed jobs × 5KB = 5MB
- Total Redis memory: < 50MB for queue data

## Migration from Cron Jobs

If migrating from simple cron jobs:

1. **Identify recurring tasks** → Convert to scheduled jobs
2. **Add job definitions** to appropriate queue
3. **Test retry logic** with mock failures
4. **Monitor queue depth** in production
5. **Adjust concurrency** based on load

## References

- [BullMQ Documentation](https://docs.bullmq.io/)
- [Bull Board UI](https://github.com/felixmosh/bull-board)
- [Redis Best Practices](https://redis.io/docs/management/optimization/)
