import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { LoggerService } from '../../../common/services/logger.service';
import { ContentService } from '../content.service';
import { QueueName } from '../../../common/queues/queue.config';
import { SourceType } from '@prisma/client';

interface ProcessEmailJobData {
  breweryId: string;
  messageId: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  date: Date;
  attachments: Array<{
    filename: string;
    contentType: string;
    size: number;
    content: Buffer;
  }>;
}

interface ScrapeInstagramJobData {
  breweryId: string;
  instagramHandle: string;
}

interface ScrapeFacebookJobData {
  breweryId: string;
  facebookHandle: string;
}

interface FetchRSSJobData {
  breweryId: string;
  rssFeedUrl: string;
}

/**
 * Collection Queue Processor
 * Handles jobs for collecting content from various sources
 *
 * Jobs:
 * - process-email: Process incoming email newsletters
 * - scrape-instagram: Scrape Instagram posts
 * - scrape-facebook: Scrape Facebook posts
 * - fetch-rss: Fetch RSS feed items
 */
@Processor(QueueName.COLLECT, {
  concurrency: 5, // Process 5 collection jobs concurrently
})
@Injectable()
export class CollectProcessor extends WorkerHost {
  constructor(
    private readonly logger: LoggerService,
    private readonly contentService: ContentService,
    @InjectQueue(QueueName.EXTRACT) private readonly extractQueue: Queue,
  ) {
    super();
    this.logger.setContext(CollectProcessor.name);
  }

  async process(job: Job): Promise<void> {
    this.logger.log(`Processing ${job.name} job: ${job.id}`);

    try {
      switch (job.name) {
        case 'process-email':
          await this.processEmail(job);
          break;
        case 'scrape-instagram':
          await this.scrapeInstagram(job);
          break;
        case 'scrape-facebook':
          await this.scrapeFacebook(job);
          break;
        case 'fetch-rss':
          await this.fetchRSS(job);
          break;
        default:
          this.logger.warn(`Unknown job type: ${job.name}`);
      }
    } catch (error) {
      this.logger.error(`Error processing ${job.name} job`, error instanceof Error ? error.stack : String(error));
      throw error; // Re-throw to trigger retry
    }
  }

  /**
   * Process email newsletter
   */
  private async processEmail(job: Job<ProcessEmailJobData>) {
    const { breweryId, messageId, subject, html, text, date, attachments } = job.data;

    this.logger.log(`Processing email for brewery ${breweryId}: ${subject}`);

    // Store raw email content
    const contentItem = await this.contentService.create({
      breweryId,
      type: 'update' as any, // Will be categorized by LLM
      sourceType: SourceType.email,
      sourceUrl: `mailto:${job.data.from}`,
      rawContent: html || text,
      publicationDate: new Date(date),
      extractedData: {
        messageId,
        subject,
        from: job.data.from,
        hasImages: attachments.length > 0,
        imageCount: attachments.length,
      },
    });

    this.logger.log(`Created content item ${contentItem.id} for email`);

    // Queue for extraction
    await this.extractQueue.add('extract-email', {
      contentItemId: contentItem.id,
      html,
      text,
      attachments,
    });

    this.logger.log(`Queued email ${messageId} for extraction`);
  }

  /**
   * Scrape Instagram posts (placeholder - will be implemented with Playwright)
   */
  private async scrapeInstagram(job: Job<ScrapeInstagramJobData>) {
    const { breweryId, instagramHandle } = job.data;
    this.logger.log(`Scraping Instagram for brewery ${breweryId}: @${instagramHandle}`);

    // TODO: Implement Instagram scraping with Playwright
    this.logger.warn('Instagram scraping not yet implemented');
  }

  /**
   * Scrape Facebook posts (placeholder - will be implemented with Playwright)
   */
  private async scrapeFacebook(job: Job<ScrapeFacebookJobData>) {
    const { breweryId, facebookHandle } = job.data;
    this.logger.log(`Scraping Facebook for brewery ${breweryId}: ${facebookHandle}`);

    // TODO: Implement Facebook scraping with Playwright
    this.logger.warn('Facebook scraping not yet implemented');
  }

  /**
   * Fetch RSS feed (placeholder - will be implemented with rss-parser)
   */
  private async fetchRSS(job: Job<FetchRSSJobData>) {
    const { breweryId, rssFeedUrl } = job.data;
    this.logger.log(`Fetching RSS feed for brewery ${breweryId}: ${rssFeedUrl}`);

    // TODO: Implement RSS parsing
    this.logger.warn('RSS parsing not yet implemented');
  }
}
