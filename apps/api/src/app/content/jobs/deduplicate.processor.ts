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
    private readonly deduplicationService: DeduplicationService
  ) {
    super();
    this.logger.setContext(DeduplicateProcessor.name);
  }

  async process(job: Job): Promise<void> {
    const startTime = Date.now();

    this.logger.logJobStart(job.name, job.id, {
      contentItemId: job.data.contentItemId,
      attempt: job.attemptsMade + 1,
    });

    try {
      switch (job.name) {
        case 'check-duplicate':
          await this.checkDuplicate(job);
          break;
        default:
          this.logger.warn(`Unknown job type: ${job.name}`);
      }

      const duration = Date.now() - startTime;
      this.logger.logJobComplete(job.name, job.id, duration, {
        contentItemId: job.data.contentItemId,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.logJobFailed(job.name, job.id, error as Error, {
        contentItemId: job.data.contentItemId,
        attempt: job.attemptsMade + 1,
        duration,
      });
      throw error; // Re-throw to trigger retry
    }
  }

  /**
   * Check if content item is a duplicate
   */
  private async checkDuplicate(job: Job<CheckDuplicateJobData>) {
    const { contentItemId } = job.data;
    const startTime = Date.now();

    this.logger.logBusinessEvent('deduplication-started', {
      contentItemId,
    });

    try {
      const result = await this.deduplicationService.checkDuplicate(
        contentItemId
      );

      if (result.isDuplicate && result.duplicateOf) {
        // Mark as duplicate
        await this.deduplicationService.markAsDuplicate(
          contentItemId,
          result.duplicateOf,
          result.similarity!
        );

        this.logger.logBusinessEvent('duplicate-detected', {
          contentItemId,
          duplicateOf: result.duplicateOf,
          similarity: result.similarity!.toFixed(2),
          candidatesChecked: result.candidatesChecked,
        });
      } else {
        this.logger.logBusinessEvent('deduplication-complete', {
          contentItemId,
          isDuplicate: false,
          candidatesChecked: result.candidatesChecked,
          duration: Date.now() - startTime,
        });
      }

      // Update job progress
      await job.updateProgress({
        isDuplicate: result.isDuplicate,
        candidatesChecked: result.candidatesChecked,
        similarity: result.similarity,
      });
    } catch (error) {
      this.logger.logError('deduplication-check', error as Error, {
        contentItemId,
        duration: Date.now() - startTime,
      });
      throw error;
    }
  }
}
