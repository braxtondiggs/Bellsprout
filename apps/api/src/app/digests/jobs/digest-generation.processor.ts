import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { LoggerService } from '../../../common/services/logger.service';
import { DigestGeneratorService } from '../services/digest-generator.service';
import { QueueName } from '../../../common/queues/queue.config';

interface GenerateDigestJobData {
  userId?: string; // If specified, generate for specific user
  generateAll?: boolean; // If true, generate for all users
}

/**
 * Digest Generation Queue Processor
 * Handles digest generation jobs
 *
 * Jobs:
 * - generate-digest: Generate digest for one or all users
 * - send-digest: Queue sending of generated digest (handled separately)
 */
@Processor(QueueName.DIGEST, {
  concurrency: 2, // Process 2 digest generation jobs concurrently
})
@Injectable()
export class DigestGenerationProcessor extends WorkerHost {
  constructor(
    private readonly logger: LoggerService,
    private readonly digestGenerator: DigestGeneratorService,
    @InjectQueue(QueueName.DIGEST) private readonly digestQueue: Queue
  ) {
    super();
    this.logger.setContext(DigestGenerationProcessor.name);
  }

  async process(job: Job): Promise<void> {
    const startTime = Date.now();

    this.logger.logJobStart(job.name, job.id, {
      userId: job.data.userId,
      generateAll: job.data.generateAll,
      attempt: job.attemptsMade + 1,
    });

    try {
      switch (job.name) {
        case 'generate-digest':
          await this.generateDigest(job);
          break;
        default:
          this.logger.warn(`Unknown job type: ${job.name}`);
      }

      const duration = Date.now() - startTime;
      this.logger.logJobComplete(job.name, job.id, duration, {
        userId: job.data.userId,
        generateAll: job.data.generateAll,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.logJobFailed(job.name, job.id, error as Error, {
        userId: job.data.userId,
        generateAll: job.data.generateAll,
        attempt: job.attemptsMade + 1,
        duration,
      });
      throw error; // Re-throw to trigger retry
    }
  }

  /**
   * Generate digest(s)
   */
  private async generateDigest(job: Job<GenerateDigestJobData>) {
    const { userId, generateAll } = job.data;
    const startTime = Date.now();

    if (generateAll) {
      this.logger.logBusinessEvent('digest-generation-all-started', {
        jobId: job.id,
      });

      const results = await this.digestGenerator.generateAllDigests();

      // Queue sending jobs for non-empty digests
      let queuedCount = 0;
      for (const result of results) {
        if (!result.isEmpty) {
          await this.digestQueue.add('send-digest', {
            digestId: result.digestId,
            userId: result.userId,
          });
          queuedCount++;
        }
      }

      this.logger.logBusinessEvent('digest-generation-all-complete', {
        totalUsers: results.length,
        digestsQueued: queuedCount,
        emptyDigests: results.filter((r) => r.isEmpty).length,
        duration: Date.now() - startTime,
      });

      await job.updateProgress({
        total: results.length,
        successful: results.filter((r) => !r.isEmpty).length,
        empty: results.filter((r) => r.isEmpty).length,
      });
    } else if (userId) {
      this.logger.logBusinessEvent('digest-generation-started', {
        userId,
        jobId: job.id,
      });

      const result = await this.digestGenerator.generateDigestForUser(userId);

      if (!result.isEmpty) {
        // Queue for sending
        await this.digestQueue.add('send-digest', {
          digestId: result.digestId,
          userId: result.userId,
        });

        this.logger.logBusinessEvent('digest-generation-complete', {
          userId,
          digestId: result.digestId,
          contentItemCount: result.contentItemCount,
          breweryCount: result.breweryCount,
          queued: true,
          duration: Date.now() - startTime,
        });
      } else {
        this.logger.logBusinessEvent('digest-generation-empty', {
          userId,
          digestId: result.digestId,
          reason: 'no-content',
          duration: Date.now() - startTime,
        });
      }

      await job.updateProgress({
        digestId: result.digestId,
        isEmpty: result.isEmpty,
        contentItems: result.contentItemCount,
        breweries: result.breweryCount,
      });
    } else {
      throw new Error('Either userId or generateAll must be specified');
    }
  }
}
