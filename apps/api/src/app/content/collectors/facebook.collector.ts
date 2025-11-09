import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { chromium, Browser, Page } from 'playwright';
import { PrismaService } from '../../../common/database/prisma.service';
import { LoggerService } from '../../../common/services/logger.service';

interface FacebookPost {
  url: string;
  content: string;
  timestamp: Date;
  images: string[];
  type: 'text' | 'photo' | 'video' | 'link';
}

/**
 * Facebook Collector Service
 * Scrapes Facebook posts from brewery pages using Playwright
 *
 * Features:
 * - Headless browser scraping with anti-detection
 * - Rate limiting (1 request/hour per brewery)
 * - Image extraction from posts
 * - Content and timestamp extraction
 */
@Injectable()
export class FacebookCollectorService {
  private browser: Browser | null = null;
  private readonly rateLimit: Map<string, Date> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext(FacebookCollectorService.name);
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
      'FACEBOOK_RATE_LIMIT_HOURS',
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
   * Scrape Facebook posts from a brewery's page
   */
  async scrapeBrewery(breweryId: string): Promise<FacebookPost[]> {
    // Check rate limit
    if (!this.canScrape(breweryId)) {
      this.logger.warn(
        `Rate limit active for brewery ${breweryId}, skipping`,
      );
      return [];
    }

    const brewery = await this.prisma.brewery.findUnique({
      where: { id: breweryId },
      select: { facebookHandle: true, name: true },
    });

    if (!brewery?.facebookHandle) {
      this.logger.warn(`No Facebook handle found for brewery ${breweryId}`);
      return [];
    }

    this.logger.log(`Scraping Facebook for ${brewery.name}`);

    const browser = await this.getBrowser();
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
    });

    const page = await context.newPage();

    try {
      const posts = await this.scrapePosts(page, brewery.facebookHandle);
      this.updateRateLimit(breweryId);

      this.logger.log(
        `Scraped ${posts.length} posts from ${brewery.name} Facebook`,
      );

      return posts;
    } catch (error) {
      this.logger.error(
        `Failed to scrape Facebook for ${brewery.name}`,
        error instanceof Error ? error.stack : undefined,
      );
      return [];
    } finally {
      await context.close();
    }
  }

  /**
   * Scrape posts from Facebook page
   */
  private async scrapePosts(
    page: Page,
    facebookUrl: string,
  ): Promise<FacebookPost[]> {
    // Navigate to page
    await page.goto(facebookUrl, { waitUntil: 'networkidle', timeout: 30000 });

    // Wait for posts to load
    await page
      .waitForSelector('[role="article"]', { timeout: 10000 })
      .catch(() => {
        this.logger.warn(`No posts found at ${facebookUrl}`);
      });

    // Scroll to load more posts
    await this.scrollPage(page, 3);

    // Extract post data
    const posts = await page.evaluate(() => {
      const postElements = document.querySelectorAll('[role="article"]');
      const results: any[] = [];

      postElements.forEach((element: Element, index: number) => {
        // Limit to last 10 posts
        if (index >= 10) return;

        // Extract text content
        const textElement = element.querySelector(
          '[data-ad-preview="message"]',
        );
        const content = textElement?.textContent?.trim() || '';

        // Extract images
        const images: string[] = [];
        const imgElements = element.querySelectorAll('img');
        imgElements.forEach((img: HTMLImageElement) => {
          if (img.src && !img.src.includes('emoji')) {
            images.push(img.src);
          }
        });

        // Extract post link
        const linkElement = element.querySelector('a[href*="/posts/"]');
        const url = linkElement
          ? `https://www.facebook.com${(linkElement as HTMLAnchorElement).pathname}`
          : '';

        if (content || images.length > 0) {
          results.push({
            url,
            content,
            images,
            type: images.length > 0 ? 'photo' : 'text',
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
   * Scroll page to load more content
   */
  private async scrollPage(page: Page, times: number): Promise<void> {
    for (let i = 0; i < times; i++) {
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await page.waitForTimeout(1000);
    }
  }

  /**
   * Scrape all breweries with Facebook pages
   */
  async scrapeAll(): Promise<void> {
    const breweries = await this.prisma.brewery.findMany({
      where: {
        facebookHandle: { not: null },
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        facebookHandle: true,
      },
    });

    this.logger.log(
      `Found ${breweries.length} breweries with Facebook pages`,
    );

    for (const brewery of breweries) {
      try {
        const posts = await this.scrapeBrewery(brewery.id);

        // TODO: Queue posts for processing
        // await this.queueService.addJob('collect', 'scrape-facebook', {
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
