import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../../common/services/logger.service';
import { FailedJobService } from '../services/failed-job.service';

/**
 * Dead Letter Queue (DLQ) Processor
 * Handles jobs that have exhausted all retry attempts
 *
 * This processor listens to the 'failed' event from BullMQ
 * and records permanently failed jobs in the database for later review
 */
@Injectable()
export class DLQProcessor extends WorkerHost {
  constructor(
    private readonly logger: LoggerService,
    private readonly failedJobService: FailedJobService,
  ) {
    super();
    this.logger.setContext(DLQProcessor.name);
  }

  async process(job: Job): Promise<void> {
    // This processor doesn't actually process jobs
    // It only listens to events via OnWorkerEvent decorators
    this.logger.debug(`DLQ processor active for job ${job.id}`);
  }

  /**
   * Handle jobs that have permanently failed after all retries
   */
  @OnWorkerEvent('failed')
  async onJobFailed(job: Job, error: Error): Promise<void> {
    // Only record if this is the final failure (no more retries)
    const maxAttempts = job.opts.attempts || 3;
    const currentAttempt = job.attemptsMade;

    if (currentAttempt >= maxAttempts) {
      this.logger.error(
        `Job permanently failed after ${currentAttempt} attempts: ${job.name} (${job.id})`,
        error.stack,
      );

      // Record in database
      await this.failedJobService.recordFailedJob({
        queueName: job.queueName,
        jobName: job.name,
        data: job.data,
        error: error.message,
        stackTrace: error.stack,
        attemptsMade: currentAttempt,
      });
    } else {
      this.logger.warn(
        `Job failed (attempt ${currentAttempt}/${maxAttempts}): ${job.name} (${job.id}) - will retry`,
      );
    }
  }

  /**
   * Log when jobs are completed successfully
   */
  @OnWorkerEvent('completed')
  async onJobCompleted(job: Job): Promise<void> {
    this.logger.debug(
      `Job completed: ${job.name} (${job.id})`,
    );
  }

  /**
   * Log when jobs are active
   */
  @OnWorkerEvent('active')
  async onJobActive(job: Job): Promise<void> {
    this.logger.debug(
      `Job started: ${job.name} (${job.id})`,
    );
  }

  /**
   * Log when jobs are stalled (taking too long)
   */
  @OnWorkerEvent('stalled')
  async onJobStalled(jobId: string): Promise<void> {
    this.logger.warn(`Job stalled: ${jobId}`);
  }
}
