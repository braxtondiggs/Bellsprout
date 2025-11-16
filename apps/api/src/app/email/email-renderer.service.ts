import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { chromium, Browser, Page } from 'playwright';
import { LoggerService } from '../../common/services/logger.service';
import { MinioService } from '../../common/storage/minio.service';

@Injectable()
export class EmailRendererService implements OnModuleInit, OnModuleDestroy {
  private browser: Browser | null = null;

  constructor(
    private readonly logger: LoggerService,
    private readonly minio: MinioService
  ) {
    this.logger.setContext(EmailRendererService.name);
  }

  async onModuleInit() {
    const startTime = Date.now();

    try {
      this.logger.logBusinessEvent('playwright-browser-init-started', {});

      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });

      this.logger.logPerformance(
        'playwright-browser-init',
        Date.now() - startTime,
        { success: true }
      );
    } catch (error) {
      this.logger.logError('playwright-browser-init', error as Error, {
        duration: Date.now() - startTime,
      });
      throw error;
    }
  }

  async onModuleDestroy() {
    if (this.browser) {
      await this.browser.close();
      this.logger.log('Playwright browser closed');
    }
  }

  /**
   * Render HTML email as an image and store in MinIO
   * Returns the MinIO URL of the rendered screenshot
   */
  async renderEmailToImage(
    html: string,
    breweryId: string,
    emailSubject: string
  ): Promise<string> {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    let page: Page | null = null;

    try {
      this.logger.log(`Rendering email to image: ${emailSubject}`);

      // Create a new page
      page = await this.browser.newPage();

      // Set viewport to a reasonable email width
      await page.setViewportSize({
        width: 800,
        height: 600,
      });

      // Set the HTML content
      await page.setContent(html, {
        waitUntil: 'networkidle',
        timeout: 30000,
      });

      // Take a full-page screenshot
      const screenshot = await page.screenshot({
        type: 'png',
        fullPage: true,
      });

      // Generate filename
      const timestamp = Date.now();
      const sanitizedSubject = (emailSubject || 'no-subject')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .substring(0, 50);
      const filename = `${timestamp}-${sanitizedSubject}.png`;

      // Store in MinIO (use 'images' category for email renders)
      const key = this.minio.generateKey(breweryId, filename, 'images');
      const result = await this.minio.uploadBuffer(
        key,
        Buffer.from(screenshot),
        'image/png'
      );

      this.logger.log(`Rendered email stored in MinIO: ${key}`);
      return result.url;
    } catch (error) {
      this.logger.error(
        `Failed to render email: ${emailSubject}`,
        error instanceof Error ? error.stack : undefined
      );
      throw error;
    } finally {
      if (page) {
        await page.close();
      }
    }
  }

  /**
   * Render HTML email and return screenshot buffer for immediate processing
   * Use this when you want to OCR the image without storing it
   */
  async renderEmailToBuffer(html: string): Promise<Buffer> {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    let page: Page | null = null;

    try {
      page = await this.browser.newPage();

      await page.setViewportSize({
        width: 800,
        height: 600,
      });

      await page.setContent(html, {
        waitUntil: 'networkidle',
        timeout: 30000,
      });

      const screenshot = await page.screenshot({
        type: 'png',
        fullPage: true,
      });

      return Buffer.from(screenshot);
    } catch (error) {
      this.logger.error(
        'Failed to render email to buffer',
        error instanceof Error ? error.stack : undefined
      );
      throw error;
    } finally {
      if (page) {
        await page.close();
      }
    }
  }

  /**
   * Extract images from HTML and render each one separately
   * Useful for emails with multiple embedded images
   */
  async extractAndRenderImages(
    html: string,
    breweryId: string,
    emailSubject: string
  ): Promise<string[]> {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    const imageUrls: string[] = [];
    let page: Page | null = null;

    try {
      page = await this.browser.newPage();

      await page.setContent(html, {
        waitUntil: 'networkidle',
        timeout: 30000,
      });

      // Find all images in the HTML
      const images = await page.$$('img');

      this.logger.log(
        `Found ${images.length} images in email: ${emailSubject}`
      );

      for (let i = 0; i < images.length; i++) {
        try {
          const image = images[i];

          // Take screenshot of individual image
          const screenshot = await image.screenshot({
            type: 'png',
          });

          // Generate filename
          const timestamp = Date.now();
          const sanitizedSubject = (emailSubject || 'no-subject')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .substring(0, 40);
          const filename = `${timestamp}-${sanitizedSubject}-img-${i}.png`;

          // Store in MinIO (use 'images' category)
          const key = this.minio.generateKey(breweryId, filename, 'images');
          const result = await this.minio.uploadBuffer(
            key,
            Buffer.from(screenshot),
            'image/png'
          );

          imageUrls.push(result.url);
          this.logger.log(`Extracted image ${i + 1}/${images.length}: ${key}`);
        } catch (error) {
          this.logger.warn(
            `Failed to extract image ${i + 1}: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`
          );
        }
      }

      return imageUrls;
    } catch (error) {
      this.logger.error(
        `Failed to extract images from email: ${emailSubject}`,
        error instanceof Error ? error.stack : undefined
      );
      throw error;
    } finally {
      if (page) {
        await page.close();
      }
    }
  }
}
