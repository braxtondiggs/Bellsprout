import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../../common/services/logger.service';
import { DigestService } from '../digests.service';
import { EmailService } from '../../email/email.service';
import { QueueName } from '../../../common/queues/queue.config';

interface SendDigestJobData {
  digestId: string;
  userId: string;
}

/**
 * Digest Delivery Queue Processor
 * Handles sending digest emails to users
 *
 * Jobs:
 * - send-digest: Send a generated digest via email
 */
@Processor(QueueName.DIGEST, {
  concurrency: 2, // Process 2 email sending jobs concurrently
})
@Injectable()
export class DigestDeliveryProcessor extends WorkerHost {
  constructor(
    private readonly logger: LoggerService,
    private readonly digestService: DigestService,
    private readonly emailService: EmailService
  ) {
    super();
    this.logger.setContext(DigestDeliveryProcessor.name);
  }

  async process(job: Job): Promise<void> {
    const startTime = Date.now();

    this.logger.logJobStart(job.name, job.id, {
      digestId: job.data.digestId,
      userId: job.data.userId,
      attempt: job.attemptsMade + 1,
    });

    try {
      switch (job.name) {
        case 'send-digest':
          await this.sendDigest(job);
          break;
        default:
          this.logger.warn(`Unknown job type: ${job.name}`);
      }

      const duration = Date.now() - startTime;
      this.logger.logJobComplete(job.name, job.id, duration, {
        digestId: job.data.digestId,
        userId: job.data.userId,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.logJobFailed(job.name, job.id, error as Error, {
        digestId: job.data.digestId,
        userId: job.data.userId,
        attempt: job.attemptsMade + 1,
        duration,
      });
      throw error; // Re-throw to trigger retry
    }
  }

  /**
   * Send digest email to user
   */
  private async sendDigest(job: Job<SendDigestJobData>) {
    const { digestId, userId } = job.data;
    const startTime = Date.now();

    this.logger.logBusinessEvent('digest-delivery-started', {
      digestId,
      userId,
    });

    try {
      // Fetch digest with user info
      const digest = await this.digestService.findOne(digestId);

      if (!digest) {
        throw new Error(`Digest ${digestId} not found`);
      }

      if (digest.userId !== userId) {
        throw new Error(`Digest ${digestId} does not belong to user ${userId}`);
      }

      if (!digest.emailHtml) {
        throw new Error(`Digest ${digestId} has no email HTML`);
      }

      // Send email via Resend
      const sendStartTime = Date.now();
      await this.emailService.sendDigestEmail(
        digest.user.email,
        digest.emailSubject,
        digest.emailHtml
      );

      const sendDuration = Date.now() - sendStartTime;

      this.logger.logExternalCall(
        'resend',
        'send-digest-email',
        sendDuration,
        true,
        {
          digestId,
          userId,
          recipientEmail: digest.user.email,
          emailSize: digest.emailHtml.length,
        }
      );

      // Update delivery status
      await this.digestService.updateDeliveryStatus(
        digestId,
        'sent',
        new Date()
      );

      this.logger.logBusinessEvent('digest-sent', {
        digestId,
        userId,
        recipientEmail: digest.user.email,
        emailSize: digest.emailHtml.length,
        duration: Date.now() - startTime,
      });

      await job.updateProgress({
        status: 'sent',
        email: digest.user.email,
      });
    } catch (error) {
      this.logger.logBusinessEvent('digest-send-failed', {
        digestId,
        userId,
        error: (error as Error).message,
        duration: Date.now() - startTime,
      });

      // Update delivery status to failed
      try {
        await this.digestService.updateDeliveryStatus(digestId, 'failed');
      } catch (updateError) {
        this.logger.logError('digest-status-update', updateError as Error, {
          digestId,
          targetStatus: 'failed',
        });
      }

      throw error;
    }
  }
}
