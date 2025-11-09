import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { LoggerService } from '../../common/services/logger.service';
import { ResendInboundPayload } from './dto/resend-inbound.dto';

@Injectable()
export class InboundEmailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext(InboundEmailService.name);
  }

  /**
   * Process inbound email from Resend webhook
   * This replaces the EmailPollerService (T024-T028) with webhook-based approach
   */
  async processInboundEmail(payload: ResendInboundPayload): Promise<void> {
    this.logger.log(`Received inbound email from: ${payload.from}, subject: ${payload.subject}`);

    try {
      // Identify brewery from sender email (same logic as T026)
      const brewery = await this.identifyBrewery(payload.from);

      if (!brewery) {
        this.logger.warn(`Could not identify brewery from email: ${payload.from}`);
        // TODO: Store in unknown senders table for manual review
        return;
      }

      this.logger.log(`Identified brewery: ${brewery.name} (${brewery.id})`);

      // Extract images from email HTML and attachments (same as T025)
      const images = this.extractImages(payload);

      // TODO: Queue for content processing (same as T027 - process-email job)
      // This will be implemented when QueueService is created in Phase 3
      // await this.queueService.addJob('collect', 'process-email', {
      //   breweryId: brewery.id,
      //   source: 'email',
      //   html: payload.html,
      //   text: payload.text,
      //   subject: payload.subject,
      //   images,
      //   receivedAt: new Date(),
      // });

      this.logger.log(`Received email from ${brewery.name} - queuing not yet implemented`);
    } catch (error) {
      this.logger.error(
        `Failed to process inbound email from ${payload.from}`,
        error instanceof Error ? error.stack : undefined,
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
      if (domain.includes(brewerySlug) || fromEmail.toLowerCase().includes(brewerySlug)) {
        // Auto-create mapping for future
        try {
          await this.prisma.emailBreweryMapping.create({
            data: {
              breweryId: brewery.id,
              emailAddress: fromEmail.toLowerCase(),
            },
          });

          this.logger.log(`Auto-created email mapping: ${fromEmail} → ${brewery.name}`);
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
   * Extract images from email HTML and attachments
   * Maps to T025: Implement email image extraction
   */
  private extractImages(payload: ResendInboundPayload): string[] {
    const images: string[] = [];

    // Extract inline images from HTML
    if (payload.html) {
      const imgRegex = /<img[^>]+src="([^">]+)"/g;
      let match;
      while ((match = imgRegex.exec(payload.html)) !== null) {
        images.push(match[1]);
      }
    }

    // Extract image attachments
    if (payload.attachments) {
      for (const attachment of payload.attachments) {
        if (attachment.contentType.startsWith('image/')) {
          // Store base64 encoded image
          images.push(`data:${attachment.contentType};base64,${attachment.content}`);
        }
      }
    }

    this.logger.log(`Extracted ${images.length} images from email`);
    return images;
  }
}
