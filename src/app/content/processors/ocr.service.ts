import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { createWorker, Worker, RecognizeResult } from 'tesseract.js';
import sharp from 'sharp';
import * as cheerio from 'cheerio';
import { LoggerService } from '../../../common/services/logger.service';

export interface OCRResult {
  text: string;
  confidence: number;
  words: Array<{
    text: string;
    confidence: number;
    bbox: {
      x0: number;
      y0: number;
      x1: number;
      y1: number;
    };
  }>;
}

/**
 * OCR Service
 * Handles Optical Character Recognition for extracting text from images
 *
 * Features:
 * - Tesseract.js integration
 * - Image preprocessing (grayscale, contrast, resize)
 * - Text extraction with confidence scores
 * - HTML injection (replace img tags with extracted text)
 */
@Injectable()
export class OCRService implements OnModuleInit, OnModuleDestroy {
  private worker: Worker | null = null;
  private isInitialized = false;

  constructor(private readonly logger: LoggerService) {
    this.logger.setContext(OCRService.name);
  }

  async onModuleInit() {
    this.logger.log('Initializing Tesseract OCR worker...');
    try {
      await this.initializeWorker();
      this.logger.log('Tesseract OCR worker initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Tesseract worker', error instanceof Error ? error.stack : String(error));
    }
  }

  async onModuleDestroy() {
    if (this.worker) {
      this.logger.log('Terminating Tesseract worker');
      await this.worker.terminate();
      this.worker = null;
    }
  }

  /**
   * Initialize Tesseract worker
   */
  private async initializeWorker() {
    this.worker = await createWorker('eng', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          // Only log progress every 20%
          if (m.progress && Math.floor(m.progress * 100) % 20 === 0) {
            this.logger.debug(`OCR Progress: ${Math.floor(m.progress * 100)}%`);
          }
        }
      },
    });
    this.isInitialized = true;
  }

  /**
   * Preprocess image for better OCR results
   * - Convert to grayscale
   * - Increase contrast
   * - Resize to optimal size
   * - Sharpen
   */
  async preprocessImage(imageBuffer: Buffer): Promise<Buffer> {
    this.logger.debug('Preprocessing image for OCR');

    try {
      const processedImage = await sharp(imageBuffer)
        // Convert to grayscale
        .grayscale()
        // Increase contrast
        .normalize()
        // Resize if too large (max 2000px width while maintaining aspect ratio)
        .resize(2000, null, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        // Sharpen for better text recognition
        .sharpen()
        // Convert to PNG for Tesseract
        .png()
        .toBuffer();

      this.logger.debug('Image preprocessing complete');
      return processedImage;
    } catch (error) {
      this.logger.error('Error preprocessing image', error instanceof Error ? error.stack : String(error));
      throw error;
    }
  }

  /**
   * Extract text from image using OCR
   */
  async extractText(imageBuffer: Buffer): Promise<OCRResult> {
    if (!this.isInitialized || !this.worker) {
      this.logger.warn('Tesseract worker not initialized, initializing now...');
      await this.initializeWorker();
    }

    try {
      this.logger.log('Starting OCR text extraction');

      // Preprocess image
      const preprocessedImage = await this.preprocessImage(imageBuffer);

      // Run OCR
      const result: RecognizeResult = await this.worker!.recognize(preprocessedImage);

      const ocrResult: OCRResult = {
        text: result.data.text.trim(),
        confidence: result.data.confidence / 100, // Convert to 0-1 scale
        words: result.data.words.map(word => ({
          text: word.text,
          confidence: word.confidence / 100,
          bbox: {
            x0: word.bbox.x0,
            y0: word.bbox.y0,
            x1: word.bbox.x1,
            y1: word.bbox.y1,
          },
        })),
      };

      this.logger.log(`OCR extracted ${ocrResult.words.length} words with ${(ocrResult.confidence * 100).toFixed(1)}% confidence`);

      return ocrResult;
    } catch (error) {
      this.logger.error('Error during OCR extraction', error instanceof Error ? error.stack : String(error));
      throw error;
    }
  }

  /**
   * Extract text from multiple images
   */
  async extractTextFromImages(images: Buffer[]): Promise<OCRResult[]> {
    this.logger.log(`Extracting text from ${images.length} images`);

    const results: OCRResult[] = [];

    for (let i = 0; i < images.length; i++) {
      try {
        this.logger.debug(`Processing image ${i + 1}/${images.length}`);
        const result = await this.extractText(images[i]);
        results.push(result);
      } catch (error) {
        this.logger.error(`Failed to process image ${i + 1}`, error instanceof Error ? error.stack : String(error));
        // Continue with other images
        results.push({
          text: '',
          confidence: 0,
          words: [],
        });
      }
    }

    return results;
  }

  /**
   * Inject OCR text into HTML by replacing img tags
   * This allows the LLM to "see" the text from images
   */
  async injectOCRIntoHTML(html: string, imageBuffers: Buffer[]): Promise<string> {
    if (!html || imageBuffers.length === 0) {
      return html;
    }

    this.logger.log(`Injecting OCR text into HTML for ${imageBuffers.length} images`);

    try {
      // Extract text from all images
      const ocrResults = await this.extractTextFromImages(imageBuffers);

      // Parse HTML
      const $ = cheerio.load(html);
      const images = $('img');

      this.logger.debug(`Found ${images.length} img tags in HTML`);

      // Replace each image with a text block containing the OCR result
      images.each((index, element) => {
        if (index < ocrResults.length) {
          const ocrResult = ocrResults[index];
          const $img = $(element);
          const alt = $img.attr('alt') || 'Image';

          // Create a replacement div with the OCR text
          const replacement = `
            <div class="ocr-extracted-text" data-original-alt="${alt}" data-confidence="${(ocrResult.confidence * 100).toFixed(1)}">
              <p><em>[Image: ${alt}]</em></p>
              <p>${ocrResult.text || '[No text detected in image]'}</p>
            </div>
          `;

          $img.replaceWith(replacement);
        }
      });

      const modifiedHtml = $.html();
      this.logger.log('OCR text injection complete');

      return modifiedHtml;
    } catch (error) {
      this.logger.error('Error injecting OCR into HTML', error instanceof Error ? error.stack : String(error));
      // Return original HTML if OCR fails
      return html;
    }
  }

  /**
   * Get image metadata (dimensions, format, size)
   */
  async getImageMetadata(imageBuffer: Buffer) {
    try {
      const metadata = await sharp(imageBuffer).metadata();
      return {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        size: imageBuffer.length,
      };
    } catch (error) {
      this.logger.error('Error getting image metadata', error instanceof Error ? error.stack : String(error));
      return null;
    }
  }

  /**
   * Check if image is likely to contain text
   * Returns a confidence score (0-1) based on image characteristics
   */
  async containsText(imageBuffer: Buffer): Promise<number> {
    try {
      const metadata = await this.getImageMetadata(imageBuffer);

      if (!metadata) {
        return 0;
      }

      // Heuristics for text detection:
      // 1. Images with sufficient resolution
      const hasGoodResolution = metadata.width && metadata.height &&
                                metadata.width > 100 && metadata.height > 100;

      // 2. Not too large (likely photos rather than graphics with text)
      const reasonableSize = metadata.width && metadata.width < 3000;

      // Simple scoring
      let score = 0;
      if (hasGoodResolution) score += 0.5;
      if (reasonableSize) score += 0.3;
      if (metadata.format === 'png') score += 0.2; // PNG often used for graphics with text

      return Math.min(score, 1.0);
    } catch (error) {
      this.logger.error('Error checking if image contains text', error instanceof Error ? error.stack : String(error));
      return 0.5; // Default: assume might contain text
    }
  }
}
