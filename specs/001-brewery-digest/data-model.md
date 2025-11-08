# Data Model: Brewery Newsletter Digest Application

**Feature Branch**: `001-brewery-digest`
**Created**: 2025-11-07
**Last Updated**: 2025-11-07

## Overview

This document defines the complete data model for the brewery newsletter digest application using Prisma ORM with PostgreSQL. The schema supports user authentication, brewery management, content aggregation from multiple sources, duplicate detection, and personalized digest generation.

## Technology Stack

- **Database**: PostgreSQL 16+
- **ORM**: Prisma 5.x
- **Node.js**: 20 LTS
- **TypeScript**: 5.x

## Core Entities

### User
Represents an account holder who subscribes to brewery digests.

**Attributes**:
- `id`: Unique identifier (CUID)
- `email`: User's email address (unique, indexed)
- `passwordHash`: Bcrypt hashed password
- `firstName`: User's first name
- `lastName`: User's last name
- `emailVerified`: Email verification status
- `emailVerificationToken`: Token for email verification
- `passwordResetToken`: Token for password reset
- `passwordResetExpiry`: Expiration time for reset token
- `subscriptionStatus`: Active, paused, or cancelled
- `digestDeliveryDay`: Day of week for digest delivery (0-6, Sunday-Saturday)
- `contentTypePreferences`: JSON array of content types to include
- `digestFormat`: Brief or detailed view
- `createdAt`: Account creation timestamp
- `updatedAt`: Last modification timestamp

**Relationships**:
- Has many `UserBrewerySubscription`
- Has many `Digest`

### Brewery
Represents a craft brewery with content sources.

**Attributes**:
- `id`: Unique identifier (CUID)
- `name`: Brewery name (indexed)
- `slug`: URL-friendly identifier (unique)
- `description`: Brief description
- `logoUrl`: URL to brewery logo (stored in MinIO/S3)
- `city`: City location (indexed)
- `state`: State/province (indexed)
- `region`: NYC or DC (enum, indexed)
- `websiteUrl`: Brewery website
- `emailDomain`: Domain for newsletter identification
- `instagramHandle`: Instagram username
- `facebookHandle`: Facebook page handle
- `rssFeedUrl`: RSS feed URL
- `isActive`: Whether brewery is actively monitored
- `createdAt`: Record creation timestamp
- `updatedAt`: Last modification timestamp

**Relationships**:
- Has many `ContentItem`
- Has many `UserBrewerySubscription`

### ContentItem
Represents extracted information from a brewery source.

**Attributes**:
- `id`: Unique identifier (CUID)
- `breweryId`: Foreign key to Brewery (indexed)
- `type`: Content type (release, event, update) - enum
- `sourceType`: Source type (email, instagram, facebook, rss) - enum
- `sourceUrl`: Original content URL
- `rawContent`: Original HTML/text content
- `extractedData`: JSON structured data (beer names, event details, etc.)
- `publicationDate`: Content publication date (indexed for partitioning)
- `minhashSignature`: Bytes for duplicate detection (128-byte)
- `isDuplicate`: Boolean flag for duplicate content
- `duplicateOfId`: Foreign key to original ContentItem if duplicate
- `confidenceScore`: LLM extraction confidence (0.0-1.0)
- `createdAt`: Record creation timestamp
- `updatedAt`: Last modification timestamp

**Relationships**:
- Belongs to `Brewery`
- Self-referential: duplicate relationship
- Included in many `Digest` (through DigestContent)

### Digest
Represents a generated weekly summary for a user.

**Attributes**:
- `id`: Unique identifier (CUID)
- `userId`: Foreign key to User (indexed)
- `generatedAt`: Digest generation timestamp
- `deliveryDate`: Scheduled delivery date
- `sentAt`: Actual send timestamp
- `deliveryStatus`: Pending, sent, failed, bounced (enum)
- `emailSubject`: Email subject line
- `emailHtml`: Rendered email HTML
- `openedAt`: First open timestamp (email tracking)
- `createdAt`: Record creation timestamp
- `updatedAt`: Last modification timestamp

**Relationships**:
- Belongs to `User`
- Has many `ContentItem` (through DigestContent)

### UserBrewerySubscription
Junction table representing user's selected breweries.

**Attributes**:
- `id`: Unique identifier (CUID)
- `userId`: Foreign key to User (composite unique index)
- `breweryId`: Foreign key to Brewery (composite unique index)
- `subscribedAt`: Subscription timestamp
- `isActive`: Whether subscription is active
- `createdAt`: Record creation timestamp
- `updatedAt`: Last modification timestamp

**Relationships**:
- Belongs to `User`
- Belongs to `Brewery`

### DigestContent
Junction table linking digests to content items.

**Attributes**:
- `id`: Unique identifier (CUID)
- `digestId`: Foreign key to Digest (composite unique index)
- `contentItemId`: Foreign key to ContentItem (composite unique index)
- `sortOrder`: Display order in digest

**Relationships**:
- Belongs to `Digest`
- Belongs to `ContentItem`

## Prisma Schema

```prisma
// prisma/schema.prisma

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [pgcrypto]
}

// ============================================================================
// ENUMS
// ============================================================================

enum SubscriptionStatus {
  active
  paused
  cancelled
}

enum DigestFormat {
  brief
  detailed
}

enum ContentType {
  release
  event
  update
}

enum SourceType {
  email
  instagram
  facebook
  rss
}

enum Region {
  NYC
  DC
}

enum DeliveryStatus {
  pending
  sent
  failed
  bounced
}

// ============================================================================
// USER DOMAIN
// ============================================================================

model User {
  id                      String             @id @default(cuid())
  email                   String             @unique
  passwordHash            String
  firstName               String?
  lastName                String?
  emailVerified           Boolean            @default(false)
  emailVerificationToken  String?            @unique
  passwordResetToken      String?            @unique
  passwordResetExpiry     DateTime?
  subscriptionStatus      SubscriptionStatus @default(active)
  digestDeliveryDay       Int                @default(0) // 0=Sunday, 6=Saturday
  contentTypePreferences  ContentType[]      @default([release, event, update])
  digestFormat            DigestFormat       @default(detailed)
  createdAt               DateTime           @default(now())
  updatedAt               DateTime           @updatedAt

  // Relationships
  brewerySubscriptions UserBrewerySubscription[]
  digests              Digest[]

  @@index([email])
  @@index([emailVerified])
  @@index([subscriptionStatus])
  @@map("users")
}

// ============================================================================
// BREWERY DOMAIN
// ============================================================================

model Brewery {
  id              String   @id @default(cuid())
  name            String
  slug            String   @unique
  description     String?  @db.Text
  logoUrl         String?
  city            String
  state           String
  region          Region
  websiteUrl      String?
  emailDomain     String?
  instagramHandle String?
  facebookHandle  String?
  rssFeedUrl      String?
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  // Relationships
  contentItems         ContentItem[]
  userSubscriptions    UserBrewerySubscription[]

  @@index([name])
  @@index([city, state])
  @@index([region])
  @@index([slug])
  @@index([isActive])
  @@map("breweries")
}

model UserBrewerySubscription {
  id           String   @id @default(cuid())
  userId       String
  breweryId    String
  subscribedAt DateTime @default(now())
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  // Relationships
  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  brewery Brewery @relation(fields: [breweryId], references: [id], onDelete: Cascade)

  @@unique([userId, breweryId])
  @@index([userId])
  @@index([breweryId])
  @@index([isActive])
  @@map("user_brewery_subscriptions")
}

// ============================================================================
// CONTENT DOMAIN
// ============================================================================

model ContentItem {
  id               String      @id @default(cuid())
  breweryId        String
  type             ContentType
  sourceType       SourceType
  sourceUrl        String?     @db.Text
  rawContent       String      @db.Text
  extractedData    Json        @default("{}")
  publicationDate  DateTime    @db.Date
  minhashSignature Bytes?
  isDuplicate      Boolean     @default(false)
  duplicateOfId    String?
  confidenceScore  Float?
  createdAt        DateTime    @default(now())
  updatedAt        DateTime    @updatedAt

  // Relationships
  brewery       Brewery         @relation(fields: [breweryId], references: [id], onDelete: Cascade)
  duplicateOf   ContentItem?    @relation("ContentDuplicates", fields: [duplicateOfId], references: [id])
  duplicates    ContentItem[]   @relation("ContentDuplicates")
  digestContent DigestContent[]

  @@index([breweryId, publicationDate])
  @@index([publicationDate])
  @@index([type])
  @@index([sourceType])
  @@index([isDuplicate])
  @@index([minhashSignature])
  @@map("content_items")
}

// ============================================================================
// DIGEST DOMAIN
// ============================================================================

model Digest {
  id             String         @id @default(cuid())
  userId         String
  generatedAt    DateTime       @default(now())
  deliveryDate   DateTime
  sentAt         DateTime?
  deliveryStatus DeliveryStatus @default(pending)
  emailSubject   String
  emailHtml      String         @db.Text
  openedAt       DateTime?
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt

  // Relationships
  user          User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  digestContent DigestContent[]

  @@index([userId])
  @@index([deliveryDate])
  @@index([deliveryStatus])
  @@index([sentAt])
  @@map("digests")
}

model DigestContent {
  id            String @id @default(cuid())
  digestId      String
  contentItemId String
  sortOrder     Int    @default(0)

  // Relationships
  digest      Digest      @relation(fields: [digestId], references: [id], onDelete: Cascade)
  contentItem ContentItem @relation(fields: [contentItemId], references: [id], onDelete: Cascade)

  @@unique([digestId, contentItemId])
  @@index([digestId])
  @@index([contentItemId])
  @@map("digest_content")
}

// ============================================================================
// UTILITY MODELS
// ============================================================================

model FailedJob {
  id           String   @id @default(cuid())
  queueName    String
  jobName      String
  jobData      Json
  error        String   @db.Text
  stackTrace   String?  @db.Text
  attemptsMade Int
  createdAt    DateTime @default(now())

  @@index([queueName])
  @@index([jobName])
  @@index([createdAt])
  @@map("failed_jobs")
}

model EmailBreweryMapping {
  id           String   @id @default(cuid())
  emailAddress String   @unique
  breweryId    String
  createdAt    DateTime @default(now())

  brewery Brewery @relation(fields: [breweryId], references: [id], onDelete: Cascade)

  @@index([emailAddress])
  @@map("email_brewery_mappings")
}

// Note: Add this relation to Brewery model
// model Brewery {
//   ...
//   emailMappings EmailBreweryMapping[]
// }
```

## Extended Extracted Data Schemas

### Beer Release Schema (extractedData JSON)

```typescript
interface BeerReleaseData {
  beers: Array<{
    name: string;
    style: BeerStyle;
    abv?: number;
    ibu?: number;
    releaseDate?: string; // ISO 8601
    description?: string;
    availability?: 'draft' | 'cans' | 'bottles' | 'limited';
  }>;
}

enum BeerStyle {
  IPA = 'IPA',
  HAZY_IPA = 'Hazy IPA',
  DOUBLE_IPA = 'Double IPA',
  PALE_ALE = 'Pale Ale',
  STOUT = 'Stout',
  IMPERIAL_STOUT = 'Imperial Stout',
  PORTER = 'Porter',
  LAGER = 'Lager',
  PILSNER = 'Pilsner',
  SOUR = 'Sour',
  GOSE = 'Gose',
  SAISON = 'Saison',
  WHEAT = 'Wheat',
  AMBER = 'Amber',
  BROWN_ALE = 'Brown Ale',
  OTHER = 'Other',
}
```

### Event Schema (extractedData JSON)

```typescript
interface EventData {
  events: Array<{
    name: string;
    date: string; // ISO 8601
    endDate?: string; // ISO 8601 for multi-day events
    time?: string;
    location?: string;
    description?: string;
    type: EventType;
    ticketUrl?: string;
    isFree?: boolean;
  }>;
}

enum EventType {
  TASTING = 'tasting',
  RELEASE = 'release',
  TOUR = 'tour',
  FESTIVAL = 'festival',
  FOOD_PAIRING = 'food_pairing',
  LIVE_MUSIC = 'live_music',
  TRIVIA = 'trivia',
  OTHER = 'other',
}
```

### General Update Schema (extractedData JSON)

```typescript
interface UpdateData {
  updates: Array<{
    summary: string;
    category: UpdateCategory;
    effectiveDate?: string; // ISO 8601
  }>;
}

enum UpdateCategory {
  HOURS = 'hours',
  MENU = 'menu',
  LOCATION = 'location',
  ANNOUNCEMENT = 'announcement',
  COLLABORATION = 'collaboration',
  AWARDS = 'awards',
  OTHER = 'other',
}
```

## PostgreSQL Partitioning Setup

### Monthly Partitioning for content_items

The `content_items` table uses monthly partitioning on `publication_date` for query performance and efficient data retention.

**Migration Script**:

```sql
-- prisma/migrations/20250107_partition_content_items/migration.sql

-- Step 1: Convert existing table to partitioned table
BEGIN;

-- Create new partitioned table
CREATE TABLE content_items_partitioned (
  LIKE content_items INCLUDING ALL
) PARTITION BY RANGE (publication_date);

-- Copy existing data
INSERT INTO content_items_partitioned SELECT * FROM content_items;

-- Rename tables
ALTER TABLE content_items RENAME TO content_items_backup;
ALTER TABLE content_items_partitioned RENAME TO content_items;

-- Update foreign key constraints
ALTER TABLE digest_content DROP CONSTRAINT digest_content_contentItemId_fkey;
ALTER TABLE digest_content ADD CONSTRAINT digest_content_contentItemId_fkey
  FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON DELETE CASCADE;

COMMIT;

-- Step 2: Create initial partitions (current month + 3 months ahead)
CREATE TABLE content_items_2025_01 PARTITION OF content_items
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE TABLE content_items_2025_02 PARTITION OF content_items
  FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

CREATE TABLE content_items_2025_03 PARTITION OF content_items
  FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');

CREATE TABLE content_items_2025_04 PARTITION OF content_items
  FOR VALUES FROM ('2025-04-01') TO ('2025-05-01');

-- Step 3: Create default partition for unmatched data
CREATE TABLE content_items_default PARTITION OF content_items DEFAULT;

-- Step 4: Create indexes on partitioned table (automatically inherited)
-- These are already created by Prisma migration, but verify:
CREATE INDEX IF NOT EXISTS idx_content_items_brewery_date
  ON content_items (brewery_id, publication_date);
CREATE INDEX IF NOT EXISTS idx_content_items_publication_date
  ON content_items (publication_date);
CREATE INDEX IF NOT EXISTS idx_content_items_type
  ON content_items (type);
CREATE INDEX IF NOT EXISTS idx_content_items_minhash
  ON content_items (minhash_signature);

-- Step 5: Add hamming distance function for MinHash comparison
CREATE OR REPLACE FUNCTION hamming_distance(a bytea, b bytea)
RETURNS integer AS $$
DECLARE
  result integer := 0;
  i integer;
BEGIN
  IF length(a) != length(b) THEN
    RAISE EXCEPTION 'Bytea lengths must match';
  END IF;

  FOR i IN 0..length(a)-1 LOOP
    result := result + bit_count(get_byte(a, i) # get_byte(b, i));
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Helper function to count set bits
CREATE OR REPLACE FUNCTION bit_count(byte integer)
RETURNS integer AS $$
BEGIN
  RETURN (
    (byte & 1) +
    ((byte >> 1) & 1) +
    ((byte >> 2) & 1) +
    ((byte >> 3) & 1) +
    ((byte >> 4) & 1) +
    ((byte >> 5) & 1) +
    ((byte >> 6) & 1) +
    ((byte >> 7) & 1)
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Verify partitioning is working
SELECT tablename, schemaname
FROM pg_tables
WHERE tablename LIKE 'content_items%'
ORDER BY tablename;
```

### Automated Partition Management

Partitions are automatically created and dropped by the application (see `PartitionService` in implementation). Retention policy: 12 months.

## Database Indexes

### Performance-Critical Indexes

```sql
-- User lookups (authentication)
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_email_verified ON users(email_verified);
CREATE INDEX idx_users_subscription_status ON users(subscription_status);

-- Brewery search and filtering
CREATE INDEX idx_breweries_name ON breweries(name);
CREATE INDEX idx_breweries_city_state ON breweries(city, state);
CREATE INDEX idx_breweries_region ON breweries(region);
CREATE INDEX idx_breweries_slug ON breweries(slug);
CREATE INDEX idx_breweries_active ON breweries(is_active);

-- Content item queries (most critical for performance)
CREATE INDEX idx_content_items_brewery_date ON content_items(brewery_id, publication_date);
CREATE INDEX idx_content_items_publication_date ON content_items(publication_date);
CREATE INDEX idx_content_items_type ON content_items(type);
CREATE INDEX idx_content_items_source_type ON content_items(source_type);
CREATE INDEX idx_content_items_is_duplicate ON content_items(is_duplicate);
CREATE INDEX idx_content_items_minhash_signature ON content_items(minhash_signature);

-- User brewery subscriptions
CREATE INDEX idx_user_brewery_subs_user_id ON user_brewery_subscriptions(user_id);
CREATE INDEX idx_user_brewery_subs_brewery_id ON user_brewery_subscriptions(brewery_id);
CREATE INDEX idx_user_brewery_subs_active ON user_brewery_subscriptions(is_active);

-- Digest queries
CREATE INDEX idx_digests_user_id ON digests(user_id);
CREATE INDEX idx_digests_delivery_date ON digests(delivery_date);
CREATE INDEX idx_digests_delivery_status ON digests(delivery_status);
CREATE INDEX idx_digests_sent_at ON digests(sent_at);

-- Digest content junction
CREATE INDEX idx_digest_content_digest_id ON digest_content(digest_id);
CREATE INDEX idx_digest_content_content_item_id ON digest_content(content_item_id);

-- Failed jobs monitoring
CREATE INDEX idx_failed_jobs_queue_name ON failed_jobs(queue_name);
CREATE INDEX idx_failed_jobs_job_name ON failed_jobs(job_name);
CREATE INDEX idx_failed_jobs_created_at ON failed_jobs(created_at);
```

## Migration Strategy

### Initial Setup

1. **Install Prisma**:
   ```bash
   npm install -D prisma
   npm install @prisma/client
   npx prisma init
   ```

2. **Configure Environment**:
   ```bash
   # .env
   DATABASE_URL="postgresql://user:password@localhost:5432/brewery_digest?schema=public"
   ```

3. **Create Initial Migration**:
   ```bash
   npx prisma migrate dev --name init
   ```

4. **Generate Prisma Client**:
   ```bash
   npx prisma generate
   ```

### Adding Partitioning

1. **Create Partitioning Migration**:
   ```bash
   npx prisma migrate create --name partition_content_items
   ```

2. **Add SQL from "PostgreSQL Partitioning Setup" section above**

3. **Apply Migration**:
   ```bash
   npx prisma migrate deploy
   ```

### Data Seeding

Create seed script for NYC/DC breweries:

```typescript
// prisma/seed.ts
import { PrismaClient, Region } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // NYC Breweries
  const nycBreweries = [
    {
      name: 'Other Half Brewing',
      slug: 'other-half-brewing',
      city: 'Brooklyn',
      state: 'NY',
      region: Region.NYC,
      websiteUrl: 'https://otherhalfbrewing.com',
      instagramHandle: 'otherhalfnyc',
      emailDomain: 'otherhalfbrewing.com',
    },
    {
      name: 'Torch & Crown Brewing',
      slug: 'torch-crown-brewing',
      city: 'Manhattan',
      state: 'NY',
      region: Region.NYC,
      websiteUrl: 'https://torchandcrownbrewing.com',
      instagramHandle: 'torchandcrown',
    },
    {
      name: 'Sixpoint Brewery',
      slug: 'sixpoint-brewery',
      city: 'Brooklyn',
      state: 'NY',
      region: Region.NYC,
      websiteUrl: 'https://sixpoint.com',
      instagramHandle: 'sixpoint',
      rssFeedUrl: 'https://sixpoint.com/feed/',
    },
    // Add more NYC breweries...
  ];

  // DC Breweries
  const dcBreweries = [
    {
      name: 'Right Proper Brewing',
      slug: 'right-proper-brewing',
      city: 'Washington',
      state: 'DC',
      region: Region.DC,
      websiteUrl: 'https://rightproperbrewing.com',
      instagramHandle: 'rightproperdc',
      emailDomain: 'rightproperbrewing.com',
    },
    {
      name: 'Bluejacket',
      slug: 'bluejacket',
      city: 'Washington',
      state: 'DC',
      region: Region.DC,
      websiteUrl: 'https://bluejacketdc.com',
      instagramHandle: 'bluejacketdc',
    },
    // Add more DC breweries...
  ];

  for (const brewery of [...nycBreweries, ...dcBreweries]) {
    await prisma.brewery.upsert({
      where: { slug: brewery.slug },
      update: brewery,
      create: brewery,
    });
  }

  console.log('Seeded breweries:', nycBreweries.length + dcBreweries.length);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

**Run Seed**:
```bash
npx prisma db seed
```

### Schema Evolution

For schema changes:

1. **Update `schema.prisma`**
2. **Create Migration**:
   ```bash
   npx prisma migrate dev --name descriptive_name
   ```
3. **Review Generated SQL**
4. **Apply to Production**:
   ```bash
   npx prisma migrate deploy
   ```

## Data Retention Policy

- **Content Items**: 12 months (via partition dropping)
- **Digests**: Keep indefinitely (user reference)
- **Failed Jobs**: 30 days (cleanup via cron)
- **User Data**: Keep until account deletion (GDPR compliance)

## Performance Considerations

1. **Query Patterns**:
   - Most queries filter by `publication_date` (enable partition pruning)
   - User digest generation queries join User → UserBrewerySubscription → ContentItem
   - Duplicate detection queries use `minhashSignature` index

2. **Connection Pooling**:
   ```typescript
   // Prisma connection pool config
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
     // connection_limit = 10 (set in DATABASE_URL)
   }
   ```

3. **Query Optimization**:
   - Use `select` to limit returned fields
   - Batch queries with `findMany` instead of multiple `findUnique`
   - Use transactions for atomic operations

## Backup Strategy

1. **Daily Backups**:
   ```bash
   pg_dump -Fc brewery_digest > backup_$(date +%Y%m%d).dump
   ```

2. **Retention**: Keep 7 daily, 4 weekly, 12 monthly backups

3. **Point-in-Time Recovery**: Enable PostgreSQL WAL archiving

## Prisma Client Usage Examples

### Creating a User

```typescript
const user = await prisma.user.create({
  data: {
    email: 'user@example.com',
    passwordHash: await bcrypt.hash('password', 10),
    firstName: 'John',
    lastName: 'Doe',
  },
});
```

### Subscribing to Breweries

```typescript
await prisma.userBrewerySubscription.createMany({
  data: breweryIds.map(breweryId => ({
    userId: user.id,
    breweryId,
  })),
});
```

### Querying Content for Digest

```typescript
const contentItems = await prisma.contentItem.findMany({
  where: {
    breweryId: {
      in: user.brewerySubscriptions.map(sub => sub.breweryId),
    },
    publicationDate: {
      gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    },
    isDuplicate: false,
    type: {
      in: user.contentTypePreferences,
    },
  },
  include: {
    brewery: {
      select: {
        name: true,
        logoUrl: true,
        city: true,
      },
    },
  },
  orderBy: [
    { brewery: { name: 'asc' } },
    { publicationDate: 'desc' },
  ],
});
```

### Creating a Digest

```typescript
const digest = await prisma.digest.create({
  data: {
    userId: user.id,
    deliveryDate: nextDeliveryDate,
    emailSubject: `Your Weekly Brewery Digest - ${formatDate(new Date())}`,
    emailHtml: renderedHtml,
    digestContent: {
      create: contentItems.map((item, index) => ({
        contentItemId: item.id,
        sortOrder: index,
      })),
    },
  },
});
```

## Monitoring Queries

### Partition Health

```sql
-- List all partitions with row counts
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
  (SELECT count(*) FROM content_items WHERE tableoid = (schemaname||'.'||tablename)::regclass) as row_count
FROM pg_tables
WHERE tablename LIKE 'content_items_%'
ORDER BY tablename DESC;
```

### Slow Queries

```sql
-- Enable pg_stat_statements extension
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- View slowest queries
SELECT
  query,
  calls,
  total_exec_time,
  mean_exec_time,
  max_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

### Index Usage

```sql
-- Check index usage
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan ASC;
```

## References

- [Prisma Documentation](https://www.prisma.io/docs)
- [PostgreSQL Partitioning](https://www.postgresql.org/docs/current/ddl-partitioning.html)
- [PostgreSQL Indexing Best Practices](https://www.postgresql.org/docs/current/indexes.html)
