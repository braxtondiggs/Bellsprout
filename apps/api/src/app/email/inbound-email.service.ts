import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../common/database/prisma.service';
import { LoggerService } from '../../common/services/logger.service';
import { MinioService } from '../../common/storage/minio.service';
import { QueueName } from '../../common/queues/queue.config';
import { ResendInboundPayload } from './dto/resend-inbound.dto';

@Injectable()
export class InboundEmailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly minio: MinioService,
    @InjectQueue(QueueName.COLLECT) private readonly collectQueue: Queue
  ) {
    this.logger.setContext(InboundEmailService.name);
  }

  /**
   * Process inbound email from Resend webhook
   * This replaces the EmailPollerService (T024-T028) with webhook-based approach
   */
  async processInboundEmail(payload: ResendInboundPayload): Promise<void> {
    this.logger.log(
      `Received inbound email from: ${payload.from}, subject: ${payload.subject}`
    );

    try {
      // Identify brewery from sender email (same logic as T026)
      const brewery = await this.identifyBrewery(payload.from);

      if (!brewery) {
        this.logger.warn(
          `Could not identify brewery from email: ${payload.from}`
        );

        // Store in unknown senders table for manual review
        await this.prisma.unknownSender.create({
          data: {
            emailAddress: payload.from,
            subject: payload.subject || null,
            emailPayload: payload as any,
          },
        });

        this.logger.log(
          `Stored unknown sender for manual review: ${payload.from}`
        );
        return;
      }

      this.logger.log(`Identified brewery: ${brewery.name} (${brewery.id})`);

      // Store complete email snapshot in MinIO for archival
      const emailSnapshotUrl = await this.storeEmailSnapshot(
        payload,
        brewery.id,
        brewery.name
      );

      // Extract images from email HTML and attachments (same as T025)
      // Now stores attachments in MinIO
      const images = await this.extractImages(payload, brewery.id);

      // Queue for content processing
      await this.collectQueue.add('process-email', {
        breweryId: brewery.id,
        messageId: payload.subject, // Using subject as messageId for now
        from: payload.from,
        subject: payload.subject,
        html: payload.html || '',
        text: payload.text || '',
        date: new Date(),
        attachments:
          payload.attachments?.map((att) => ({
            filename: att.filename,
            contentType: att.contentType,
            size: att.content.length,
            content: Buffer.from(att.content, 'base64'),
          })) || [],
      });

      this.logger.log(`Queued email from ${brewery.name} for processing`);
    } catch (error) {
      this.logger.error(
        `Failed to process inbound email from ${payload.from}`,
        error instanceof Error ? error.stack : undefined
      );
      throw error;
    }
  }

  /**
   * Identify brewery from sender email address
   * Maps to T026: Implement brewery sender identification logic
   */
  private async identifyBrewery(fromEmail: string) {
    // Extract domain from email
    const domain = fromEmail.toLowerCase().split('@')[1];

    // Look up brewery by email mapping
    const mapping = await this.prisma.emailBreweryMapping.findUnique({
      where: {
        emailAddress: fromEmail.toLowerCase(),
      },
      include: {
        brewery: true,
      },
    });

    if (mapping) {
      return mapping.brewery;
    }

    // Fallback: try to match by brewery name in email or domain
    // This is a simple heuristic - may need refinement
    const breweries = await this.prisma.brewery.findMany();

    for (const brewery of breweries) {
      const brewerySlug = brewery.name.toLowerCase().replace(/\s+/g, '');
      if (
        domain.includes(brewerySlug) ||
        fromEmail.toLowerCase().includes(brewerySlug)
      ) {
        // Auto-create mapping for future
        try {
          await this.prisma.emailBreweryMapping.create({
            data: {
              breweryId: brewery.id,
              emailAddress: fromEmail.toLowerCase(),
            },
          });

          this.logger.log(
            `Auto-created email mapping: ${fromEmail} → ${brewery.name}`
          );
        } catch (error) {
          // Ignore duplicate key errors
          this.logger.warn(`Could not create email mapping for ${fromEmail}`);
        }
        return brewery;
      }
    }

    return null;
  }

  /**
   * Store complete email snapshot in MinIO for archival and debugging
   * Format: {breweryId}/emails/{timestamp}-{subject}.json
   */
  private async storeEmailSnapshot(
    payload: ResendInboundPayload,
    breweryId: string,
    breweryName: string
  ): Promise<string> {
    try {
      // Create email snapshot object
      const emailSnapshot = {
        metadata: {
          breweryId,
          breweryName,
          from: payload.from,
          to: payload.to,
          subject: payload.subject,
          receivedAt: new Date().toISOString(),
        },
        content: {
          html: payload.html || null,
          text: payload.text || null,
        },
        attachments:
          payload.attachments?.map((att) => ({
            filename: att.filename,
            contentType: att.contentType,
            size: att.content.length,
            // Store attachment metadata only, actual files stored separately
          })) || [],
        headers: payload.headers || {},
      };

      // Generate filename: timestamp-sanitized-subject.json
      const timestamp = Date.now();
      const sanitizedSubject = (payload.subject || 'no-subject')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .substring(0, 50);
      const filename = `${timestamp}-${sanitizedSubject}.json`;

      // Store in MinIO: {breweryId}/emails/{filename}
      const key = `${breweryId}/emails/${filename}`;
      const buffer = Buffer.from(
        JSON.stringify(emailSnapshot, null, 2),
        'utf-8'
      );

      const result = await this.minio.uploadBuffer(
        key,
        buffer,
        'application/json'
      );

      this.logger.log(`Stored email snapshot in MinIO: ${key}`);
      return result.url;
    } catch (error) {
      this.logger.error(
        'Failed to store email snapshot in MinIO',
        error instanceof Error ? error.stack : undefined
      );
      // Don't throw - email processing should continue even if snapshot storage fails
      return '';
    }
  }

  /**
   * Extract images from email HTML and attachments
   * Maps to T025: Implement email image extraction
   * Now stores attachments in MinIO
   */
  private async extractImages(
    payload: ResendInboundPayload,
    breweryId: string
  ): Promise<string[]> {
    const images: string[] = [];

    // Extract inline images from HTML
    if (payload.html) {
      const imgRegex = /<img[^>]+src="([^">]+)"/g;
      let match;
      while ((match = imgRegex.exec(payload.html)) !== null) {
        images.push(match[1]);
      }
    }

    // Extract and store image attachments in MinIO
    if (payload.attachments) {
      for (const attachment of payload.attachments) {
        if (attachment.contentType.startsWith('image/')) {
          try {
            // Decode base64 attachment content
            const buffer = Buffer.from(attachment.content, 'base64');

            // Generate filename from attachment name or timestamp
            const filename = attachment.filename || `email-${Date.now()}.jpg`;

            // Generate MinIO key
            const key = this.minio.generateKey(breweryId, filename, 'images');

            // Upload to MinIO
            const result = await this.minio.uploadBuffer(
              key,
              buffer,
              attachment.contentType
            );

            images.push(result.url);
            this.logger.log(`Stored email attachment in MinIO: ${key}`);
          } catch (error) {
            this.logger.error(
              `Failed to store email attachment: ${attachment.filename}`,
              error instanceof Error ? error.stack : undefined
            );
          }
        }
      }
    }

    this.logger.log(`Extracted ${images.length} images from email`);
    return images;
  }
}
