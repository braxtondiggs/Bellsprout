import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ContentService } from './content.service';
import { EmailPollerService } from './collectors/email-poller.service';
import { OCRService } from './processors/ocr.service';
import { CollectProcessor } from './jobs/collect.processor';
import { ExtractionProcessor } from './jobs/extract.processor';
import { QueueName } from '../../common/queues/queue.config';

/**
 * Content Module
 * Handles content ingestion, processing, and storage
 *
 * Features:
 * - Email collection (IMAP)
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
    EmailPollerService,
    OCRService,
    CollectProcessor,
    ExtractionProcessor,
  ],
  exports: [ContentService],
})
export class ContentModule {}
