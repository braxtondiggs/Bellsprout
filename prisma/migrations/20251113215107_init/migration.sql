-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'paused', 'cancelled');

-- CreateEnum
CREATE TYPE "DigestFormat" AS ENUM ('brief', 'detailed');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('release', 'event', 'update');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('email', 'instagram', 'facebook', 'rss');

-- CreateEnum
CREATE TYPE "Region" AS ENUM ('NYC', 'DC');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('pending', 'sent', 'failed', 'bounced');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerificationToken" TEXT,
    "passwordResetToken" TEXT,
    "passwordResetExpiry" TIMESTAMP(3),
    "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'active',
    "digestDeliveryDay" INTEGER NOT NULL DEFAULT 0,
    "contentTypePreferences" "ContentType"[] DEFAULT ARRAY['release', 'event', 'update']::"ContentType"[],
    "digestFormat" "DigestFormat" NOT NULL DEFAULT 'detailed',
    "bounceCount" INTEGER NOT NULL DEFAULT 0,
    "lastBounceAt" TIMESTAMP(3),
    "lastBounceType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "breweries" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "logoUrl" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "region" "Region" NOT NULL,
    "websiteUrl" TEXT,
    "emailDomain" TEXT,
    "instagramHandle" TEXT,
    "facebookHandle" TEXT,
    "rssFeedUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "breweries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_brewery_subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "breweryId" TEXT NOT NULL,
    "subscribedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_brewery_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_items" (
    "id" TEXT NOT NULL,
    "breweryId" TEXT NOT NULL,
    "type" "ContentType" NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "sourceUrl" TEXT,
    "rawContent" TEXT NOT NULL,
    "extractedData" JSONB NOT NULL DEFAULT '{}',
    "publicationDate" DATE NOT NULL,
    "minhashSignature" BYTEA,
    "isDuplicate" BOOLEAN NOT NULL DEFAULT false,
    "duplicateOfId" TEXT,
    "confidenceScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveryDate" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "deliveryStatus" "DeliveryStatus" NOT NULL DEFAULT 'pending',
    "emailSubject" TEXT NOT NULL,
    "emailHtml" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "digests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digest_content" (
    "id" TEXT NOT NULL,
    "digestId" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "digest_content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "failed_jobs" (
    "id" TEXT NOT NULL,
    "queueName" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "jobData" JSONB NOT NULL,
    "error" TEXT NOT NULL,
    "stackTrace" TEXT,
    "attemptsMade" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "failed_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_brewery_mappings" (
    "id" TEXT NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "breweryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_brewery_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unknown_senders" (
    "id" TEXT NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "subject" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailPayload" JSONB NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "breweryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unknown_senders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_emailVerificationToken_key" ON "users"("emailVerificationToken");

-- CreateIndex
CREATE UNIQUE INDEX "users_passwordResetToken_key" ON "users"("passwordResetToken");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_emailVerified_idx" ON "users"("emailVerified");

-- CreateIndex
CREATE INDEX "users_subscriptionStatus_idx" ON "users"("subscriptionStatus");

-- CreateIndex
CREATE UNIQUE INDEX "breweries_slug_key" ON "breweries"("slug");

-- CreateIndex
CREATE INDEX "breweries_name_idx" ON "breweries"("name");

-- CreateIndex
CREATE INDEX "breweries_city_state_idx" ON "breweries"("city", "state");

-- CreateIndex
CREATE INDEX "breweries_region_idx" ON "breweries"("region");

-- CreateIndex
CREATE INDEX "breweries_slug_idx" ON "breweries"("slug");

-- CreateIndex
CREATE INDEX "breweries_isActive_idx" ON "breweries"("isActive");

-- CreateIndex
CREATE INDEX "user_brewery_subscriptions_userId_idx" ON "user_brewery_subscriptions"("userId");

-- CreateIndex
CREATE INDEX "user_brewery_subscriptions_breweryId_idx" ON "user_brewery_subscriptions"("breweryId");

-- CreateIndex
CREATE INDEX "user_brewery_subscriptions_isActive_idx" ON "user_brewery_subscriptions"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "user_brewery_subscriptions_userId_breweryId_key" ON "user_brewery_subscriptions"("userId", "breweryId");

-- CreateIndex
CREATE INDEX "content_items_breweryId_publicationDate_idx" ON "content_items"("breweryId", "publicationDate");

-- CreateIndex
CREATE INDEX "content_items_publicationDate_idx" ON "content_items"("publicationDate");

-- CreateIndex
CREATE INDEX "content_items_type_idx" ON "content_items"("type");

-- CreateIndex
CREATE INDEX "content_items_sourceType_idx" ON "content_items"("sourceType");

-- CreateIndex
CREATE INDEX "content_items_isDuplicate_idx" ON "content_items"("isDuplicate");

-- CreateIndex
CREATE INDEX "content_items_minhashSignature_idx" ON "content_items"("minhashSignature");

-- CreateIndex
CREATE INDEX "digests_userId_idx" ON "digests"("userId");

-- CreateIndex
CREATE INDEX "digests_deliveryDate_idx" ON "digests"("deliveryDate");

-- CreateIndex
CREATE INDEX "digests_deliveryStatus_idx" ON "digests"("deliveryStatus");

-- CreateIndex
CREATE INDEX "digests_sentAt_idx" ON "digests"("sentAt");

-- CreateIndex
CREATE INDEX "digest_content_digestId_idx" ON "digest_content"("digestId");

-- CreateIndex
CREATE INDEX "digest_content_contentItemId_idx" ON "digest_content"("contentItemId");

-- CreateIndex
CREATE UNIQUE INDEX "digest_content_digestId_contentItemId_key" ON "digest_content"("digestId", "contentItemId");

-- CreateIndex
CREATE INDEX "failed_jobs_queueName_idx" ON "failed_jobs"("queueName");

-- CreateIndex
CREATE INDEX "failed_jobs_jobName_idx" ON "failed_jobs"("jobName");

-- CreateIndex
CREATE INDEX "failed_jobs_createdAt_idx" ON "failed_jobs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "email_brewery_mappings_emailAddress_key" ON "email_brewery_mappings"("emailAddress");

-- CreateIndex
CREATE INDEX "email_brewery_mappings_emailAddress_idx" ON "email_brewery_mappings"("emailAddress");

-- CreateIndex
CREATE INDEX "unknown_senders_emailAddress_idx" ON "unknown_senders"("emailAddress");

-- CreateIndex
CREATE INDEX "unknown_senders_resolved_idx" ON "unknown_senders"("resolved");

-- CreateIndex
CREATE INDEX "unknown_senders_receivedAt_idx" ON "unknown_senders"("receivedAt");

-- AddForeignKey
ALTER TABLE "user_brewery_subscriptions" ADD CONSTRAINT "user_brewery_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_brewery_subscriptions" ADD CONSTRAINT "user_brewery_subscriptions_breweryId_fkey" FOREIGN KEY ("breweryId") REFERENCES "breweries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_breweryId_fkey" FOREIGN KEY ("breweryId") REFERENCES "breweries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "content_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digests" ADD CONSTRAINT "digests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digest_content" ADD CONSTRAINT "digest_content_digestId_fkey" FOREIGN KEY ("digestId") REFERENCES "digests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digest_content" ADD CONSTRAINT "digest_content_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_brewery_mappings" ADD CONSTRAINT "email_brewery_mappings_breweryId_fkey" FOREIGN KEY ("breweryId") REFERENCES "breweries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
