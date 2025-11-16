import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { LoggerService } from '../../../common/services/logger.service';
import { OCRService } from '../processors/ocr.service';
import { LLMExtractionService } from '../processors/llm-extraction.service';
import { QueueName } from '../../../common/queues/queue.config';
import { PrismaService } from '../../../common/database/prisma.service';

interface ExtractEmailJobData {
  contentItemId: string;
  breweryId: string;
  breweryName?: string;
  html: string;
  text: string;
  subject?: string;
  from?: string;
  date?: Date;
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
    private readonly llmService: LLMExtractionService,
    private readonly prisma: PrismaService,
    @InjectQueue(QueueName.DEDUPLICATE) private readonly deduplicateQueue: Queue
  ) {
    super();
    this.logger.setContext(ExtractionProcessor.name);
  }

  async process(job: Job): Promise<void> {
    const startTime = Date.now();

    this.logger.logJobStart(job.name, job.id, {
      contentItemId: job.data.contentItemId,
      breweryId: job.data.breweryId,
      attempt: job.attemptsMade + 1,
    });

    try {
      switch (job.name) {
        case 'extract-email':
          await this.extractEmail(job);
          break;
        default:
          this.logger.warn(`Unknown job type: ${job.name}`);
      }

      const duration = Date.now() - startTime;
      this.logger.logJobComplete(job.name, job.id, duration, {
        contentItemId: job.data.contentItemId,
        breweryId: job.data.breweryId,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.logJobFailed(job.name, job.id, error as Error, {
        contentItemId: job.data.contentItemId,
        breweryId: job.data.breweryId,
        attempt: job.attemptsMade + 1,
        duration,
      });
      throw error; // Re-throw to trigger retry
    }
  }

  /**
   * Extract content from email with OCR and LLM
   */
  private async extractEmail(job: Job<ExtractEmailJobData>) {
    const {
      contentItemId,
      breweryId,
      breweryName,
      html,
      text,
      subject,
      from,
      date,
      attachments,
    } = job.data;

    this.logger.logBusinessEvent('extraction-started', {
      contentItemId,
      breweryId,
      sourceType: 'email',
      hasAttachments: attachments.length > 0,
      attachmentCount: attachments.length,
    });

    try {
      let processedHtml = html;
      const processedText = text;
      const ocrResults: any[] = [];

      // Step 1: Process images with OCR if present
      if (attachments && attachments.length > 0) {
        // Filter for images only
        const imageBuffers = attachments
          .filter((att) => att.contentType.startsWith('image/'))
          .map((att) => att.content);

        if (imageBuffers.length > 0) {
          const ocrStartTime = Date.now();

          this.logger.logBusinessEvent('ocr-started', {
            contentItemId,
            breweryId,
            imageCount: imageBuffers.length,
          });

          // Inject OCR text into HTML
          processedHtml = await this.ocrService.injectOCRIntoHTML(
            html,
            imageBuffers
          );

          // Also extract individual OCR results for metadata
          const individualResults = await this.ocrService.extractTextFromImages(
            imageBuffers
          );

          individualResults.forEach((result, index) => {
            ocrResults.push({
              imageIndex: index,
              filename: attachments[index]?.filename,
              text: result.text,
              confidence: result.confidence,
              wordCount: result.words.length,
            });
          });

          const avgConfidence =
            ocrResults.reduce((sum, r) => sum + r.confidence, 0) /
            ocrResults.length;
          const totalWords = ocrResults.reduce(
            (sum, r) => sum + r.wordCount,
            0
          );

          this.logger.logPerformance(
            'ocr-extraction',
            Date.now() - ocrStartTime,
            {
              contentItemId,
              breweryId,
              imagesProcessed: imageBuffers.length,
              totalWords,
              avgConfidence: avgConfidence.toFixed(2),
            }
          );
        }
      }

      // Use OCR-enhanced HTML if available, otherwise fallback to plain text
      const contentForLLM = processedHtml || processedText;

      // Step 2: Extract structured data with LLM
      // Note: LLM extraction logging is handled by llmService itself

      const extractionResult = await this.llmService.extractContent({
        content: contentForLLM,
        breweryName,
        sourceType: 'EMAIL',
        metadata: {
          subject,
          from,
          date: date?.toISOString(),
        },
      });

      if (!extractionResult.success) {
        this.logger.logBusinessEvent('extraction-failed', {
          contentItemId,
          breweryId,
          reason: 'llm-extraction-failed',
          error: extractionResult.error,
        });

        // Store the error but continue with partial data
        await this.prisma.contentItem.update({
          where: { id: contentItemId },
          data: {
            rawContent: contentForLLM,
            extractedData: {
              hasOCR: ocrResults.length > 0,
              ocrResults,
              llmExtraction: {
                success: false,
                error: extractionResult.error,
              },
            },
          },
        });

        // Still queue for deduplication
        await this.deduplicateQueue.add('check-duplicate', {
          contentItemId,
        });

        return;
      }

      const extractedData = extractionResult.data!;

      this.logger.logBusinessEvent('extraction-complete', {
        contentItemId,
        breweryId,
        contentType: extractedData.contentType,
        confidence: extractedData.confidence,
        tokensUsed: extractionResult.tokensUsed,
        beerReleaseCount: extractedData.beerReleases?.length || 0,
        eventCount: extractedData.events?.length || 0,
        updateCount: extractedData.updates?.length || 0,
        hasOCR: ocrResults.length > 0,
      });

      // Step 3: Update content item with all extracted data
      await this.prisma.contentItem.update({
        where: { id: contentItemId },
        data: {
          rawContent: contentForLLM,
          extractedData: {
            hasOCR: ocrResults.length > 0,
            ocrResults,
            llmExtraction: {
              success: true,
              tokensUsed: extractionResult.tokensUsed,
              contentType: extractedData.contentType,
              confidence: extractedData.confidence,
              beerReleases: extractedData.beerReleases,
              events: extractedData.events,
              updates: extractedData.updates,
              summary: extractedData.summary,
              tags: extractedData.tags,
              callToAction: extractedData.callToAction,
            },
          },
        },
      });

      // Step 4: Queue for deduplication
      await this.deduplicateQueue.add('check-duplicate', {
        contentItemId,
      });

      this.logger.logBusinessEvent('deduplication-queued', {
        contentItemId,
        breweryId,
      });
    } catch (error) {
      this.logger.logError('email-extraction', error as Error, {
        contentItemId,
        breweryId,
        hasAttachments: attachments.length > 0,
      });
      throw error;
    }
  }
}
