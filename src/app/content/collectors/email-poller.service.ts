import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as imaps from 'imap-simple';
import { simpleParser, ParsedMail, Attachment } from 'mailparser';
import { convert } from 'html-to-text';
import TurndownService from 'turndown';
import { LoggerService } from '../../../common/services/logger.service';
import { PrismaService } from '../../../common/database/prisma.service';
import { QueueName } from '../../../common/queues/queue.config';

interface EmailCollectionJob {
  messageId: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  date: Date;
  attachments: Array<{
    filename: string;
    contentType: string;
    size: number;
    content: Buffer;
  }>;
}

/**
 * Email Poller Service
 * Connects to IMAP server and polls for brewery newsletters
 *
 * Features:
 * - IMAP connection with Gmail
 * - Email parsing (HTML, text, images)
 * - Brewery sender identification
 * - Queue job creation for processing
 */
@Injectable()
export class EmailPollerService implements OnModuleInit {
  private connection: any;
  private readonly turndownService: TurndownService;
  private isPolling = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    @InjectQueue(QueueName.COLLECT) private readonly collectQueue: Queue,
  ) {
    this.logger.setContext(EmailPollerService.name);
    this.turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
    });
  }

  async onModuleInit() {
    const enabled = this.config.get('ENABLE_EMAIL_COLLECTION', false);
    if (enabled) {
      this.logger.log('Email collection enabled - will connect on first poll');
    } else {
      this.logger.warn('Email collection disabled via config');
    }
  }

  /**
   * Connect to IMAP server
   */
  private async connect() {
    if (this.connection) {
      return this.connection;
    }

    const config = {
      imap: {
        user: this.config.get('IMAP_USER')!,
        password: this.config.get('IMAP_PASSWORD')!,
        host: this.config.get('IMAP_HOST', 'imap.gmail.com'),
        port: this.config.get('IMAP_PORT', 993),
        tls: this.config.get('IMAP_TLS', true),
        authTimeout: 10000,
      },
    };

    this.logger.log(`Connecting to IMAP server: ${config.imap.host}`);
    this.connection = await imaps.connect(config);
    this.logger.log('Successfully connected to IMAP server');

    return this.connection;
  }

  /**
   * Poll for new emails
   * Runs every 2 minutes (configurable via CRON_EMAIL_POLLING)
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async pollEmails() {
    if (this.isPolling) {
      this.logger.warn('Email polling already in progress, skipping');
      return;
    }

    if (!this.config.get('ENABLE_EMAIL_COLLECTION', false)) {
      return;
    }

    this.isPolling = true;

    try {
      await this.connect();
      await this.connection.openBox('INBOX');

      // Search for unread emails from the last 7 days
      const searchCriteria = [
        'UNSEEN',
        ['SINCE', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)],
      ];

      const fetchOptions = {
        bodies: ['HEADER', 'TEXT', ''],
        markSeen: true,
      };

      const messages = await this.connection.search(searchCriteria, fetchOptions);
      this.logger.log(`Found ${messages.length} new emails`);

      for (const message of messages) {
        await this.processEmail(message);
      }
    } catch (error) {
      this.logger.error('Error polling emails', error instanceof Error ? error.stack : String(error));
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Process a single email message
   */
  private async processEmail(message: any) {
    try {
      const all = message.parts.find((part: any) => part.which === '');
      const parsed = await simpleParser(all.body);

      const from = this.extractEmailAddress(parsed.from?.text || '');
      const breweryId = await this.identifyBrewery(from);

      if (!breweryId) {
        this.logger.debug(`Email from ${from} does not match any brewery, skipping`);
        return;
      }

      this.logger.log(`Processing email from brewery ${breweryId}: ${parsed.subject}`);

      // Extract images from email
      const images = this.extractImages(parsed);

      // Create job for collection queue
      const jobData: EmailCollectionJob = {
        messageId: parsed.messageId || `email-${Date.now()}`,
        from,
        subject: parsed.subject || 'No Subject',
        html: parsed.html || '',
        text: parsed.text || this.htmlToText(parsed.html || ''),
        date: parsed.date || new Date(),
        attachments: images,
      };

      await this.collectQueue.add('process-email', {
        breweryId,
        ...jobData,
      });

      this.logger.log(`Queued email for processing: ${jobData.messageId}`);
    } catch (error) {
      this.logger.error('Error processing email', error instanceof Error ? error.stack : String(error));
    }
  }

  /**
   * Identify brewery from email sender
   */
  private async identifyBrewery(emailAddress: string): Promise<string | null> {
    // Check if we have a mapping for this email address
    const mapping = await this.prisma.emailBreweryMapping.findUnique({
      where: { emailAddress },
    });

    if (mapping) {
      return mapping.breweryId;
    }

    // Try to match by domain
    const domain = emailAddress.split('@')[1];
    if (domain) {
      const brewery = await this.prisma.brewery.findFirst({
        where: { emailDomain: domain },
      });

      if (brewery) {
        // Create mapping for future lookups
        await this.prisma.emailBreweryMapping.create({
          data: {
            emailAddress,
            breweryId: brewery.id,
          },
        });

        return brewery.id;
      }
    }

    return null;
  }

  /**
   * Extract images from email (inline and attachments)
   */
  private extractImages(parsed: ParsedMail): Array<{
    filename: string;
    contentType: string;
    size: number;
    content: Buffer;
  }> {
    const images: Array<{
      filename: string;
      contentType: string;
      size: number;
      content: Buffer;
    }> = [];

    if (!parsed.attachments) {
      return images;
    }

    for (const attachment of parsed.attachments) {
      // Only process image attachments
      if (attachment.contentType.startsWith('image/')) {
        images.push({
          filename: attachment.filename || `image-${Date.now()}.jpg`,
          contentType: attachment.contentType,
          size: attachment.size,
          content: attachment.content,
        });
      }
    }

    return images;
  }

  /**
   * Convert HTML to plain text
   */
  private htmlToText(html: string): string {
    return convert(html, {
      wordwrap: 130,
      selectors: [
        { selector: 'a', options: { ignoreHref: true } },
        { selector: 'img', format: 'skip' },
      ],
    });
  }

  /**
   * Extract email address from "Name <email>" format
   */
  private extractEmailAddress(from: string): string {
    const match = from.match(/<(.+?)>/);
    return match ? match[1] : from;
  }

  /**
   * Close IMAP connection
   */
  async onModuleDestroy() {
    if (this.connection) {
      this.logger.log('Closing IMAP connection');
      await this.connection.end();
    }
  }
}
