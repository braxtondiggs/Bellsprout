import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ContentService } from './content.service';
import { InstagramCollectorService } from './collectors/instagram.collector';
import { FacebookCollectorService } from './collectors/facebook.collector';
import { RSSCollectorService } from './collectors/rss.collector';
import { OCRService } from './processors/ocr.service';
import { LLMExtractionService } from './processors/llm-extraction.service';
import { DeduplicationService } from './processors/deduplication.service';
import { PartitionService } from './services/partition.service';
import { FailedJobService } from './services/failed-job.service';
import { CollectProcessor } from './jobs/collect.processor';
import { ExtractionProcessor } from './jobs/extract.processor';
import { DeduplicateProcessor } from './jobs/deduplicate.processor';
import { DLQProcessor } from './jobs/dlq.processor';
import { SocialScrapingScheduler } from './schedulers/social-scraping.scheduler';
import { RSSScrapingScheduler } from './schedulers/rss-scraping.scheduler';
import { QueueName } from '../../common/queues/queue.config';

/**
 * Content Module
 * Handles content ingestion, processing, and storage
 *
 * Features:
 * - Email collection (Resend webhook)
 * - Social media scraping (Instagram, Facebook)
 * - RSS feed parsing
 * - LLM-powered content extraction
 * - Duplicate detection
 */
@Module({
  imports: [
    // Register queues for content processing
    BullModule.registerQueue(
      { name: QueueName.COLLECT },
      { name: QueueName.EXTRACT },
      { name: QueueName.DEDUPLICATE },
    ),
  ],
  providers: [
    ContentService,
    InstagramCollectorService,
    FacebookCollectorService,
    RSSCollectorService,
    OCRService,
    LLMExtractionService,
    DeduplicationService,
    PartitionService,
    FailedJobService,
    CollectProcessor,
    ExtractionProcessor,
    DeduplicateProcessor,
    DLQProcessor,
    SocialScrapingScheduler,
    RSSScrapingScheduler,
  ],
  exports: [ContentService],
})
export class ContentModule {}
