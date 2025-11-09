import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../../common/services/logger.service';
import { DeduplicationService } from '../processors/deduplication.service';
import { QueueName } from '../../../common/queues/queue.config';

interface CheckDuplicateJobData {
  contentItemId: string;
}

/**
 * Deduplication Queue Processor
 * Handles duplicate detection for content items
 *
 * Jobs:
 * - check-duplicate: Check if content is a duplicate
 *
 * Pipeline: Collect → Extract → Deduplicate → (ready for digest)
 */
@Processor(QueueName.DEDUPLICATE, {
  concurrency: 3, // Process 3 deduplication jobs concurrently
})
@Injectable()
export class DeduplicateProcessor extends WorkerHost {
  constructor(
    private readonly logger: LoggerService,
    private readonly deduplicationService: DeduplicationService,
  ) {
    super();
    this.logger.setContext(DeduplicateProcessor.name);
  }

  async process(job: Job): Promise<void> {
    this.logger.log(`Processing ${job.name} job: ${job.id}`);

    try {
      switch (job.name) {
        case 'check-duplicate':
          await this.checkDuplicate(job);
          break;
        default:
          this.logger.warn(`Unknown job type: ${job.name}`);
      }
    } catch (error) {
      this.logger.error(
        `Error processing ${job.name} job`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error; // Re-throw to trigger retry
    }
  }

  /**
   * Check if content item is a duplicate
   */
  private async checkDuplicate(job: Job<CheckDuplicateJobData>) {
    const { contentItemId } = job.data;

    this.logger.log(`Checking for duplicates: ${contentItemId}`);

    try {
      const result =
        await this.deduplicationService.checkDuplicate(contentItemId);

      if (result.isDuplicate && result.duplicateOf) {
        // Mark as duplicate
        await this.deduplicationService.markAsDuplicate(
          contentItemId,
          result.duplicateOf,
          result.similarity!,
        );

        this.logger.log(
          `Content ${contentItemId} is a duplicate of ${result.duplicateOf} (similarity: ${result.similarity!.toFixed(2)})`,
        );
      } else {
        this.logger.log(
          `Content ${contentItemId} is unique (checked ${result.candidatesChecked} candidates)`,
        );
      }

      // Update job progress
      await job.updateProgress({
        isDuplicate: result.isDuplicate,
        candidatesChecked: result.candidatesChecked,
        similarity: result.similarity,
      });
    } catch (error) {
      this.logger.error(
        `Failed to check duplicate for ${contentItemId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }
}
