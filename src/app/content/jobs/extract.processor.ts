import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { LoggerService } from '../../../common/services/logger.service';
import { OCRService } from '../processors/ocr.service';
import { QueueName } from '../../../common/queues/queue.config';
import { PrismaService } from '../../../common/database/prisma.service';

interface ExtractEmailJobData {
  contentItemId: string;
  html: string;
  text: string;
  attachments: Array<{
    filename: string;
    contentType: string;
    size: number;
    content: Buffer;
  }>;
}

/**
 * Extraction Queue Processor
 * Handles content extraction from collected items
 *
 * Jobs:
 * - extract-email: Process email content with OCR and prepare for LLM
 *
 * Pipeline: Collect → Extract → Deduplicate → Digest
 */
@Processor(QueueName.EXTRACT, {
  concurrency: 10, // Process 10 extraction jobs concurrently
})
@Injectable()
export class ExtractionProcessor extends WorkerHost {
  constructor(
    private readonly logger: LoggerService,
    private readonly ocrService: OCRService,
    private readonly prisma: PrismaService,
    @InjectQueue(QueueName.DEDUPLICATE) private readonly deduplicateQueue: Queue,
  ) {
    super();
    this.logger.setContext(ExtractionProcessor.name);
  }

  async process(job: Job): Promise<void> {
    this.logger.log(`Processing ${job.name} job: ${job.id}`);

    try {
      switch (job.name) {
        case 'extract-email':
          await this.extractEmail(job);
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
   * Extract content from email with OCR
   */
  private async extractEmail(job: Job<ExtractEmailJobData>) {
    const { contentItemId, html, text, attachments } = job.data;

    this.logger.log(`Extracting email content for content item ${contentItemId}`);

    try {
      let processedHtml = html;
      const ocrResults: any[] = [];

      // Process images with OCR if present
      if (attachments && attachments.length > 0) {
        this.logger.log(`Processing ${attachments.length} image attachments with OCR`);

        // Filter for images only
        const imageBuffers = attachments
          .filter(att => att.contentType.startsWith('image/'))
          .map(att => att.content);

        if (imageBuffers.length > 0) {
          // Inject OCR text into HTML
          processedHtml = await this.ocrService.injectOCRIntoHTML(html, imageBuffers);

          // Also extract individual OCR results for metadata
          const individualResults = await this.ocrService.extractTextFromImages(imageBuffers);

          individualResults.forEach((result, index) => {
            ocrResults.push({
              imageIndex: index,
              filename: attachments[index]?.filename,
              text: result.text,
              confidence: result.confidence,
              wordCount: result.words.length,
            });
          });

          this.logger.log(`OCR extracted text from ${imageBuffers.length} images`);
        }
      }

      // Update content item with processed HTML and OCR results
      await this.prisma.contentItem.update({
        where: { id: contentItemId },
        data: {
          rawContent: processedHtml || text, // Use OCR-enhanced HTML or fallback to text
          extractedData: {
            hasOCR: ocrResults.length > 0,
            ocrResults,
            originalHtmlLength: html.length,
            processedHtmlLength: processedHtml.length,
          },
        },
      });

      this.logger.log(`Updated content item ${contentItemId} with OCR-enhanced content`);

      // Queue for LLM extraction (will be implemented next)
      // For now, queue for deduplication
      await this.deduplicateQueue.add('check-duplicate', {
        contentItemId,
      });

      this.logger.log(`Queued content item ${contentItemId} for deduplication`);
    } catch (error) {
      this.logger.error(`Failed to extract email ${contentItemId}`, error instanceof Error ? error.stack : String(error));
      throw error;
    }
  }
}
