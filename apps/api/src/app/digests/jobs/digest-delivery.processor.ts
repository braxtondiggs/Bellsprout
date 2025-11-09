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
    private readonly emailService: EmailService,
  ) {
    super();
    this.logger.setContext(DigestDeliveryProcessor.name);
  }

  async process(job: Job): Promise<void> {
    this.logger.log(`Processing ${job.name} job: ${job.id}`);

    try {
      switch (job.name) {
        case 'send-digest':
          await this.sendDigest(job);
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
   * Send digest email to user
   */
  private async sendDigest(job: Job<SendDigestJobData>) {
    const { digestId, userId } = job.data;

    this.logger.log(`Sending digest ${digestId} to user ${userId}`);

    try {
      // Fetch digest with user info
      const digest = await this.digestService.findOne(digestId);

      if (!digest) {
        throw new Error(`Digest ${digestId} not found`);
      }

      if (digest.userId !== userId) {
        throw new Error(
          `Digest ${digestId} does not belong to user ${userId}`,
        );
      }

      if (!digest.emailHtml) {
        throw new Error(`Digest ${digestId} has no email HTML`);
      }

      // Send email via Resend
      await this.emailService.sendDigestEmail(
        digest.user.email,
        digest.emailSubject,
        digest.emailHtml,
      );

      // Update delivery status
      await this.digestService.updateDeliveryStatus(
        digestId,
        'sent',
        new Date(),
      );

      this.logger.log(
        `Successfully sent digest ${digestId} to ${digest.user.email}`,
      );

      await job.updateProgress({
        status: 'sent',
        email: digest.user.email,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send digest ${digestId}`,
        error instanceof Error ? error.stack : String(error),
      );

      // Update delivery status to failed
      try {
        await this.digestService.updateDeliveryStatus(digestId, 'failed');
      } catch (updateError) {
        this.logger.error(
          `Failed to update digest status to failed`,
          updateError instanceof Error ? updateError.stack : String(updateError),
        );
      }

      throw error;
    }
  }
}
