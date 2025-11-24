import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { LoggerService } from '../../../common/services/logger.service';
import { QueueName } from '../../../common/queues/queue.config';

/**
 * Digest Scheduler
 * Schedules weekly digest generation
 *
 * Schedule:
 * - Every Sunday at 8:00 AM UTC
 */
@Injectable()
export class DigestScheduler {
  constructor(
    private readonly logger: LoggerService,
    @InjectQueue(QueueName.DIGEST) private readonly digestQueue: Queue
  ) {
    this.logger.setContext(DigestScheduler.name);
  }

  /**
   * Weekly digest generation
   * Runs every Sunday at 8:00 AM UTC
   * Cron: 0 8 * * 0 (minute hour day month dayOfWeek)
   */
  @Cron('0 8 * * 0', {
    name: 'weekly-digest-generation',
    timeZone: 'UTC',
  })
  async scheduleWeeklyDigests() {
    this.logger.log('Starting weekly digest generation');

    try {
      // Queue digest generation for all users
      await this.digestQueue.add('generate-digest', {
        generateAll: true,
      });

      this.logger.log('Queued weekly digest generation job');
    } catch (error) {
      this.logger.error(
        'Failed to queue weekly digest generation',
        error instanceof Error ? error.stack : undefined
      );
    }
  }

  /**
   * Manual trigger for digest generation (for testing)
   */
  async triggerManualGeneration(userId?: string) {
    this.logger.log(
      userId
        ? `Manually triggering digest for user ${userId}`
        : 'Manually triggering digest for all users'
    );

    await this.digestQueue.add('generate-digest', {
      ...(userId ? { userId } : { generateAll: true }),
    });

    this.logger.log('Queued manual digest generation job');
  }
}
