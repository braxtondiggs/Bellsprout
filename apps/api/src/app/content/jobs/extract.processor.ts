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
      this.logger.error(
        `Error processing ${job.name} job`,
        error instanceof Error ? error.stack : String(error)
      );
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

    this.logger.log(
      `Extracting email content for content item ${contentItemId}`
    );

    try {
      let processedHtml = html;
      const processedText = text;
      const ocrResults: any[] = [];

      // Step 1: Process images with OCR if present
      if (attachments && attachments.length > 0) {
        this.logger.log(
          `Processing ${attachments.length} image attachments with OCR`
        );

        // Filter for images only
        const imageBuffers = attachments
          .filter((att) => att.contentType.startsWith('image/'))
          .map((att) => att.content);

        if (imageBuffers.length > 0) {
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

          this.logger.log(
            `OCR extracted text from ${imageBuffers.length} images`
          );
        }
      }

      // Use OCR-enhanced HTML if available, otherwise fallback to plain text
      const contentForLLM = processedHtml || processedText;

      // Step 2: Extract structured data with LLM
      this.logger.log(
        `Running LLM extraction for content item ${contentItemId}`
      );

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
        this.logger.warn(
          `LLM extraction failed for ${contentItemId}: ${extractionResult.error}`
        );

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

      this.logger.log(`LLM extraction successful for ${contentItemId}`, {
        contentType: extractedData.contentType,
        confidence: extractedData.confidence,
        tokensUsed: extractionResult.tokensUsed,
        beerReleases: extractedData.beerReleases?.length || 0,
        events: extractedData.events?.length || 0,
        updates: extractedData.updates?.length || 0,
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

      this.logger.log(
        `Updated content item ${contentItemId} with complete extraction data`
      );

      // Step 4: Queue for deduplication
      await this.deduplicateQueue.add('check-duplicate', {
        contentItemId,
      });

      this.logger.log(`Queued content item ${contentItemId} for deduplication`);
    } catch (error) {
      this.logger.error(
        `Failed to extract email ${contentItemId}`,
        error instanceof Error ? error.stack : String(error)
      );
      throw error;
    }
  }
}
