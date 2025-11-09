import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Parser from 'rss-parser';
import { PrismaService } from '../../../common/database/prisma.service';
import { LoggerService } from '../../../common/services/logger.service';

interface RSSFeedItem {
  title: string;
  link: string;
  pubDate: Date;
  content: string;
  contentSnippet?: string;
  guid?: string;
  categories?: string[];
  isoDate?: string;
}

/**
 * RSS Feed Collector Service
 * Fetches and parses RSS feeds from brewery blogs and news sources
 *
 * Features:
 * - Parses standard RSS/Atom feeds
 * - Extracts title, content, publication date
 * - Handles various feed formats
 * - Rate limiting (configurable)
 */
@Injectable()
export class RSSCollectorService {
  private readonly parser: Parser;
  private readonly rateLimit: Map<string, Date> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext(RSSCollectorService.name);
    this.parser = new Parser({
      customFields: {
        item: [
          ['media:content', 'mediaContent'],
          ['content:encoded', 'contentEncoded'],
        ],
      },
    });
  }

  /**
   * Check if we can scrape this brewery based on rate limiting
   */
  private canScrape(breweryId: string): boolean {
    const lastScrape = this.rateLimit.get(breweryId);
    if (!lastScrape) return true;

    const hoursSinceLastScrape =
      (Date.now() - lastScrape.getTime()) / (1000 * 60 * 60);
    const rateLimitHours = this.config.get<number>(
      'RSS_RATE_LIMIT_HOURS',
      1,
    );

    return hoursSinceLastScrape >= rateLimitHours;
  }

  /**
   * Update rate limit for a brewery
   */
  private updateRateLimit(breweryId: string): void {
    this.rateLimit.set(breweryId, new Date());
  }

  /**
   * Fetch and parse RSS feed for a brewery
   */
  async fetchFeed(breweryId: string): Promise<RSSFeedItem[]> {
    if (!this.canScrape(breweryId)) {
      this.logger.warn(`Rate limit active for brewery ${breweryId}, skipping`);
      return [];
    }

    const brewery = await this.prisma.brewery.findUnique({
      where: { id: breweryId },
      select: { rssFeedUrl: true, name: true },
    });

    if (!brewery?.rssFeedUrl) {
      this.logger.warn(`No RSS URL found for brewery ${breweryId}`);
      return [];
    }

    try {
      this.logger.log(`Fetching RSS feed for brewery ${brewery.name}`);
      const feed = await this.parser.parseURL(brewery.rssFeedUrl);

      const items: RSSFeedItem[] = feed.items.map((item) => ({
        title: item.title || '',
        link: item.link || '',
        pubDate: item.isoDate ? new Date(item.isoDate) : new Date(),
        content: this.extractContent(item),
        contentSnippet: item.contentSnippet,
        guid: item.guid,
        categories: item.categories,
        isoDate: item.isoDate,
      }));

      this.updateRateLimit(breweryId);
      this.logger.log(
        `Fetched ${items.length} items from RSS feed for ${brewery.name}`,
      );

      return items;
    } catch (error) {
      this.logger.error(
        `Failed to fetch RSS feed for brewery ${breweryId}`,
        error instanceof Error ? error.stack : undefined,
      );
      return [];
    }
  }

  /**
   * Extract content from RSS item
   * Tries multiple content fields in order of preference
   */
  private extractContent(item: any): string {
    // Try content:encoded first (WordPress and similar)
    if (item['content:encoded']) {
      return item['content:encoded'];
    }

    // Try contentEncoded (custom field)
    if (item.contentEncoded) {
      return item.contentEncoded;
    }

    // Try content field
    if (item.content) {
      return item.content;
    }

    // Fall back to description
    if (item.description) {
      return item.description;
    }

    // Last resort: content snippet
    return item.contentSnippet || '';
  }

  /**
   * Fetch feeds for multiple breweries
   */
  async fetchMultipleFeeds(
    breweryIds: string[],
  ): Promise<Map<string, RSSFeedItem[]>> {
    const results = new Map<string, RSSFeedItem[]>();

    for (const breweryId of breweryIds) {
      const items = await this.fetchFeed(breweryId);
      if (items.length > 0) {
        results.set(breweryId, items);
      }
    }

    return results;
  }
}
