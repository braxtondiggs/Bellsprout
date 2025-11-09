import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { chromium, Browser, Page } from 'playwright';
import { PrismaService } from '../../../common/database/prisma.service';
import { LoggerService } from '../../../common/services/logger.service';

interface InstagramPost {
  url: string;
  caption: string;
  timestamp: Date;
  images: string[];
  type: 'image' | 'carousel' | 'video';
}

/**
 * Instagram Collector Service
 * Scrapes Instagram posts from brewery accounts using Playwright
 *
 * Features:
 * - Headless browser scraping with anti-detection
 * - Rate limiting (1 request/hour per brewery)
 * - Image extraction from posts
 * - Caption and timestamp extraction
 */
@Injectable()
export class InstagramCollectorService {
  private browser: Browser | null = null;
  private readonly rateLimit: Map<string, Date> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext(InstagramCollectorService.name);
  }

  /**
   * Initialize browser instance
   */
  private async getBrowser(): Promise<Browser> {
    if (!this.browser || !this.browser.isConnected()) {
      this.logger.log('Launching Chromium browser');
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });
    }
    return this.browser;
  }

  /**
   * Check if rate limit allows scraping for this brewery
   */
  private canScrape(breweryId: string): boolean {
    const lastScrape = this.rateLimit.get(breweryId);
    if (!lastScrape) {
      return true;
    }

    const hoursSinceLastScrape =
      (Date.now() - lastScrape.getTime()) / (1000 * 60 * 60);

    const rateLimitHours = this.config.get<number>(
      'INSTAGRAM_RATE_LIMIT_HOURS',
      1,
    );

    return hoursSinceLastScrape >= rateLimitHours;
  }

  /**
   * Update rate limit for brewery
   */
  private updateRateLimit(breweryId: string): void {
    this.rateLimit.set(breweryId, new Date());
  }

  /**
   * Scrape Instagram posts from a brewery's account
   */
  async scrapeBrewery(breweryId: string): Promise<InstagramPost[]> {
    // Check rate limit
    if (!this.canScrape(breweryId)) {
      this.logger.warn(
        `Rate limit active for brewery ${breweryId}, skipping`,
      );
      return [];
    }

    const brewery = await this.prisma.brewery.findUnique({
      where: { id: breweryId },
      select: { instagramHandle: true, name: true },
    });

    if (!brewery?.instagramHandle) {
      this.logger.warn(
        `No Instagram handle found for brewery ${breweryId}`,
      );
      return [];
    }

    this.logger.log(
      `Scraping Instagram for ${brewery.name} (@${brewery.instagramHandle})`,
    );

    const browser = await this.getBrowser();
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
    });

    const page = await context.newPage();

    try {
      const posts = await this.scrapePosts(page, brewery.instagramHandle);
      this.updateRateLimit(breweryId);

      this.logger.log(
        `Scraped ${posts.length} posts from @${brewery.instagramHandle}`,
      );

      return posts;
    } catch (error) {
      this.logger.error(
        `Failed to scrape Instagram for ${brewery.name}`,
        error instanceof Error ? error.stack : undefined,
      );
      return [];
    } finally {
      await context.close();
    }
  }

  /**
   * Scrape posts from Instagram profile page
   */
  private async scrapePosts(
    page: Page,
    handle: string,
  ): Promise<InstagramPost[]> {
    const url = `https://www.instagram.com/${handle}/`;

    // Navigate to profile
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    // Wait for posts to load
    await page.waitForSelector('article', { timeout: 10000 }).catch(() => {
      this.logger.warn(`No posts found for @${handle}`);
    });

    // Extract post data
    const posts = await page.evaluate(() => {
      const postElements = document.querySelectorAll(
        'article a[href*="/p/"]',
      );
      const results: any[] = [];

      postElements.forEach((element: Element, index: number) => {
        // Limit to last 12 posts (Instagram typically shows 12 on initial load)
        if (index >= 12) return;

        const link = element as HTMLAnchorElement;
        const img = element.querySelector('img');

        if (link && img) {
          results.push({
            url: `https://www.instagram.com${link.pathname}`,
            caption: img.alt || '',
            images: [img.src],
            type: 'image' as const,
          });
        }
      });

      return results;
    });

    // Add timestamps (estimate based on order, newest first)
    const now = Date.now();
    const postsWithTimestamps = posts.map((post, index) => ({
      ...post,
      timestamp: new Date(now - index * 24 * 60 * 60 * 1000), // Estimate: 1 day apart
    }));

    return postsWithTimestamps;
  }

  /**
   * Scrape all breweries with Instagram handles
   */
  async scrapeAll(): Promise<void> {
    const breweries = await this.prisma.brewery.findMany({
      where: {
        instagramHandle: { not: null },
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        instagramHandle: true,
      },
    });

    this.logger.log(
      `Found ${breweries.length} breweries with Instagram handles`,
    );

    for (const brewery of breweries) {
      try {
        const posts = await this.scrapeBrewery(brewery.id);

        // TODO: Queue posts for processing
        // await this.queueService.addJob('collect', 'scrape-instagram', {
        //   breweryId: brewery.id,
        //   posts,
        // });

        this.logger.log(
          `Scraped ${posts.length} posts from ${brewery.name}`,
        );
      } catch (error) {
        this.logger.error(
          `Error scraping ${brewery.name}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
  }

  /**
   * Close browser on module destroy
   */
  async onModuleDestroy() {
    if (this.browser) {
      this.logger.log('Closing browser');
      await this.browser.close();
    }
  }
}
