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
    @InjectQueue(QueueName.EXTRACT) private readonly extractQueue: Queue
  ) {
    super();
    this.logger.setContext(CollectProcessor.name);
  }

  async process(job: Job): Promise<void> {
    const startTime = Date.now();

    this.logger.logJobStart(job.name, job.id, {
      breweryId: job.data.breweryId,
      attempt: job.attemptsMade + 1,
    });

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

      const duration = Date.now() - startTime;
      this.logger.logJobComplete(job.name, job.id, duration, {
        breweryId: job.data.breweryId,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.logJobFailed(job.name, job.id, error as Error, {
        breweryId: job.data.breweryId,
        attempt: job.attemptsMade + 1,
        duration,
      });
      throw error; // Re-throw to trigger retry
    }
  }

  /**
   * Process email newsletter
   */
  private async processEmail(job: Job<ProcessEmailJobData>) {
    const { breweryId, messageId, subject, html, text, date, attachments } =
      job.data;

    this.logger.logBusinessEvent('email-received', {
      breweryId,
      messageId,
      subject,
      from: job.data.from,
      hasImages: attachments.length > 0,
      attachmentCount: attachments.length,
    });

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

    this.logger.logBusinessEvent('content-stored', {
      contentItemId: contentItem.id,
      breweryId,
      sourceType: 'email',
      hasAttachments: attachments.length > 0,
    });

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

    this.logger.logBusinessEvent('extraction-queued', {
      contentItemId: contentItem.id,
      breweryId,
      sourceType: 'email',
    });
  }

  /**
   * Scrape Instagram posts
   */
  private async scrapeInstagram(job: Job<ScrapeInstagramJobData>) {
    const { breweryId, instagramHandle } = job.data;
    const startTime = Date.now();

    this.logger.logBusinessEvent('instagram-scrape-started', {
      breweryId,
      instagramHandle,
    });

    // Scrape posts using Instagram collector
    const posts = await this.instagramCollector.scrapeBrewery(breweryId);
    const scrapeDuration = Date.now() - startTime;

    this.logger.logPerformance('instagram-scrape', scrapeDuration, {
      breweryId,
      postsFound: posts.length,
    });

    if (posts.length === 0) {
      this.logger.logBusinessEvent('instagram-no-posts', {
        breweryId,
        instagramHandle,
      });
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

      this.logger.logBusinessEvent('content-stored', {
        contentItemId: contentItem.id,
        breweryId,
        sourceType: 'instagram',
        postType: post.type,
        imageCount: post.images.length,
      });

      // Queue for extraction
      await this.extractQueue.add('extract-social', {
        contentItemId: contentItem.id,
        breweryId,
        sourceType: 'instagram',
        content: post.caption,
        images: post.images,
      });
    }

    this.logger.logBusinessEvent('instagram-scrape-complete', {
      breweryId,
      postsProcessed: posts.length,
      duration: Date.now() - startTime,
    });
  }

  /**
   * Scrape Facebook posts
   */
  private async scrapeFacebook(job: Job<ScrapeFacebookJobData>) {
    const { breweryId, facebookHandle } = job.data;
    const startTime = Date.now();

    this.logger.logBusinessEvent('facebook-scrape-started', {
      breweryId,
      facebookHandle,
    });

    const posts = await this.facebookCollector.scrapeBrewery(breweryId);

    this.logger.logPerformance('facebook-scrape', Date.now() - startTime, {
      breweryId,
      postsFound: posts.length,
    });

    if (posts.length === 0) {
      this.logger.logBusinessEvent('facebook-no-posts', {
        breweryId,
        facebookHandle,
      });
      return;
    }

    for (const post of posts) {
      const contentItem = await this.contentService.create({
        breweryId,
        type: 'update' as any,
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

      this.logger.logBusinessEvent('content-stored', {
        contentItemId: contentItem.id,
        breweryId,
        sourceType: 'facebook',
        imageCount: post.images.length,
      });

      await this.extractQueue.add('extract-social', {
        contentItemId: contentItem.id,
        breweryId,
        sourceType: 'facebook',
        content: post.content,
        images: post.images,
      });
    }

    this.logger.logBusinessEvent('facebook-scrape-complete', {
      breweryId,
      postsProcessed: posts.length,
      duration: Date.now() - startTime,
    });
  }

  /**
   * Fetch RSS feed items
   */
  private async fetchRSS(job: Job<FetchRSSJobData>) {
    const { breweryId, rssFeedUrl } = job.data;
    const startTime = Date.now();

    this.logger.logBusinessEvent('rss-fetch-started', {
      breweryId,
      rssFeedUrl,
    });

    const items = await this.rssCollector.fetchFeed(breweryId);

    this.logger.logPerformance('rss-fetch', Date.now() - startTime, {
      breweryId,
      itemsFound: items.length,
    });

    if (items.length === 0) {
      this.logger.logBusinessEvent('rss-no-items', { breweryId, rssFeedUrl });
      return;
    }

    for (const item of items) {
      const contentItem = await this.contentService.create({
        breweryId,
        type: 'update' as any,
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

      this.logger.logBusinessEvent('content-stored', {
        contentItemId: contentItem.id,
        breweryId,
        sourceType: 'rss',
        title: item.title,
      });

      await this.extractQueue.add('extract-rss', {
        contentItemId: contentItem.id,
        breweryId,
        sourceType: 'rss',
        title: item.title,
        content: item.content,
        link: item.link,
      });
    }

    this.logger.logBusinessEvent('rss-fetch-complete', {
      breweryId,
      itemsProcessed: items.length,
      duration: Date.now() - startTime,
    });
  }
}
