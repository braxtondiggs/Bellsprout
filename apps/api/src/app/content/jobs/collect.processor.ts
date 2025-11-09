import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { LoggerService } from '../../../common/services/logger.service';
import { ContentService } from '../content.service';
import { PrismaService } from '../../../common/database/prisma.service';
import { QueueName } from '../../../common/queues/queue.config';
import { SourceType } from '@prisma/client';
import { InstagramCollectorService } from '../collectors/instagram.collector';
import { FacebookCollectorService } from '../collectors/facebook.collector';
import { RSSCollectorService } from '../collectors/rss.collector';

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
    private readonly prisma: PrismaService,
    private readonly instagramCollector: InstagramCollectorService,
    private readonly facebookCollector: FacebookCollectorService,
    private readonly rssCollector: RSSCollectorService,
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

    // Fetch brewery name for LLM context
    const brewery = await this.prisma.brewery.findUnique({
      where: { id: breweryId },
      select: { name: true },
    });

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
      breweryId,
      breweryName: brewery?.name,
      subject,
      from: job.data.from,
      date,
      html,
      text,
      attachments,
    });

    this.logger.log(`Queued email ${messageId} for extraction`);
  }

  /**
   * Scrape Instagram posts
   */
  private async scrapeInstagram(job: Job<ScrapeInstagramJobData>) {
    const { breweryId } = job.data;

    // Scrape posts using Instagram collector
    const posts = await this.instagramCollector.scrapeBrewery(breweryId);

    if (posts.length === 0) {
      this.logger.log(`No Instagram posts found for brewery ${breweryId}`);
      return;
    }

    // Store each post as a content item
    for (const post of posts) {
      const contentItem = await this.contentService.create({
        breweryId,
        type: 'update' as any, // Will be categorized by LLM
        sourceType: SourceType.instagram,
        sourceUrl: post.url,
        rawContent: post.caption,
        publicationDate: post.timestamp,
        extractedData: {
          postType: post.type,
          imageCount: post.images.length,
          images: post.images,
        },
      });

      this.logger.log(`Created content item ${contentItem.id} from Instagram post`);

      // Queue for extraction
      await this.extractQueue.add('extract-social', {
        contentItemId: contentItem.id,
        breweryId,
        sourceType: 'instagram',
        content: post.caption,
        images: post.images,
      });
    }

    this.logger.log(`Processed ${posts.length} Instagram posts for brewery ${breweryId}`);
  }

  /**
   * Scrape Facebook posts
   */
  private async scrapeFacebook(job: Job<ScrapeFacebookJobData>) {
    const { breweryId } = job.data;

    // Scrape posts using Facebook collector
    const posts = await this.facebookCollector.scrapeBrewery(breweryId);

    if (posts.length === 0) {
      this.logger.log(`No Facebook posts found for brewery ${breweryId}`);
      return;
    }

    // Store each post as a content item
    for (const post of posts) {
      const contentItem = await this.contentService.create({
        breweryId,
        type: 'update' as any, // Will be categorized by LLM
        sourceType: SourceType.facebook,
        sourceUrl: post.url,
        rawContent: post.content,
        publicationDate: post.timestamp,
        extractedData: {
          postType: post.type,
          imageCount: post.images.length,
          images: post.images,
        },
      });

      this.logger.log(`Created content item ${contentItem.id} from Facebook post`);

      // Queue for extraction
      await this.extractQueue.add('extract-social', {
        contentItemId: contentItem.id,
        breweryId,
        sourceType: 'facebook',
        content: post.content,
        images: post.images,
      });
    }

    this.logger.log(`Processed ${posts.length} Facebook posts for brewery ${breweryId}`);
  }

  /**
   * Fetch RSS feed items
   */
  private async fetchRSS(job: Job<FetchRSSJobData>) {
    const { breweryId } = job.data;

    // Fetch RSS feed items using RSS collector
    const items = await this.rssCollector.fetchFeed(breweryId);

    if (items.length === 0) {
      this.logger.log(`No RSS items found for brewery ${breweryId}`);
      return;
    }

    // Store each RSS item as a content item
    for (const item of items) {
      const contentItem = await this.contentService.create({
        breweryId,
        type: 'update' as any, // Will be categorized by LLM
        sourceType: SourceType.rss,
        sourceUrl: item.link,
        rawContent: item.content,
        publicationDate: item.pubDate,
        extractedData: {
          title: item.title,
          guid: item.guid,
          categories: item.categories,
        },
      });

      this.logger.log(`Created content item ${contentItem.id} from RSS item`);

      // Queue for extraction
      await this.extractQueue.add('extract-rss', {
        contentItemId: contentItem.id,
        breweryId,
        sourceType: 'rss',
        title: item.title,
        content: item.content,
        link: item.link,
      });
    }

    this.logger.log(`Processed ${items.length} RSS items for brewery ${breweryId}`);
  }
}
