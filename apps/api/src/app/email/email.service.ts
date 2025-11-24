import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as Handlebars from 'handlebars';
import { LoggerService } from '../../common/services/logger.service';

@Injectable()
export class EmailService {
  private resend: Resend;
  private fromEmail: string;
  private baseUrl: string;
  private templates: Map<string, HandlebarsTemplateDelegate> = new Map();

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService
  ) {
    this.logger.setContext(EmailService.name);

    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      this.logger.warn(
        'RESEND_API_KEY not configured - email sending disabled'
      );
    }

    this.resend = new Resend(apiKey);
    this.fromEmail = this.configService.get<string>(
      'RESEND_FROM_EMAIL',
      'noreply@brewdigest.com'
    );
    this.baseUrl = this.configService.get<string>(
      'APP_BASE_URL',
      'http://localhost:3000'
    );

    this.loadTemplates();
  }

  /**
   * Load and compile Handlebars templates
   */
  private loadTemplates() {
    const templateNames = ['verify-email', 'reset-password', 'no-content'];
    const templatesDir = join(__dirname, 'templates');

    for (const name of templateNames) {
      try {
        const templatePath = join(templatesDir, `${name}.hbs`);
        const templateSource = readFileSync(templatePath, 'utf-8');
        this.templates.set(name, Handlebars.compile(templateSource));
        this.logger.log(`Loaded email template: ${name}`);
      } catch (error) {
        this.logger.warn(
          `Could not load template ${name}: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );
      }
    }
  }

  /**
   * Send email verification link
   */
  async sendVerificationEmail(
    to: string,
    name: string,
    verificationToken: string
  ): Promise<void> {
    const template = this.templates.get('verify-email');
    if (!template) {
      throw new Error('Verification email template not found');
    }

    const verificationUrl = `${this.baseUrl}/auth/verify-email?token=${verificationToken}`;

    const html = template({
      name,
      verificationUrl,
      currentYear: new Date().getFullYear(),
    });

    try {
      await this.resend.emails.send({
        from: this.fromEmail,
        to,
        subject: 'Verify your email address',
        html,
      });

      this.logger.log(`Verification email sent to ${to}`);
    } catch (error) {
      this.logger.error(
        `Failed to send verification email to ${to}`,
        error instanceof Error ? error.stack : undefined
      );
      throw error;
    }
  }

  /**
   * Send password reset link
   */
  async sendPasswordResetEmail(
    to: string,
    name: string,
    resetToken: string
  ): Promise<void> {
    const template = this.templates.get('reset-password');
    if (!template) {
      throw new Error('Password reset email template not found');
    }

    const resetUrl = `${this.baseUrl}/auth/reset-password?token=${resetToken}`;

    const html = template({
      name,
      resetUrl,
      currentYear: new Date().getFullYear(),
    });

    try {
      await this.resend.emails.send({
        from: this.fromEmail,
        to,
        subject: 'Reset your password',
        html,
      });

      this.logger.log(`Password reset email sent to ${to}`);
    } catch (error) {
      this.logger.error(
        `Failed to send password reset email to ${to}`,
        error instanceof Error ? error.stack : undefined
      );
      throw error;
    }
  }

  /**
   * Send empty digest notification
   */
  async sendNoContentEmail(to: string, name: string): Promise<void> {
    const template = this.templates.get('no-content');
    if (!template) {
      throw new Error('No content email template not found');
    }

    const html = template({
      name,
      currentYear: new Date().getFullYear(),
    });

    try {
      await this.resend.emails.send({
        from: this.fromEmail,
        to,
        subject: 'No updates this week',
        html,
      });

      this.logger.log(`No content email sent to ${to}`);
    } catch (error) {
      this.logger.error(
        `Failed to send no content email to ${to}`,
        error instanceof Error ? error.stack : undefined
      );
      throw error;
    }
  }

  /**
   * Send digest email (will be used in Phase 6)
   */
  async sendDigestEmail(
    to: string,
    subject: string,
    html: string
  ): Promise<void> {
    try {
      await this.resend.emails.send({
        from: this.fromEmail,
        to,
        subject,
        html,
      });

      this.logger.log(`Digest email sent to ${to}`);
    } catch (error) {
      this.logger.error(
        `Failed to send digest email to ${to}`,
        error instanceof Error ? error.stack : undefined
      );
      throw error;
    }
  }

  /**
   * Send weekly digest
   */
  async sendDigest(params: {
    to: string;
    digestHtml: string;
    periodStart: Date;
    periodEnd: Date;
  }): Promise<void> {
    const { to, digestHtml, periodStart, periodEnd } = params;

    const formatDate = (date: Date) => {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
    };

    const subject = `🍺 Your Brewery Digest: ${formatDate(
      periodStart
    )} - ${formatDate(periodEnd)}`;

    try {
      const response = await this.resend.emails.send({
        from: this.fromEmail,
        to,
        subject,
        html: digestHtml,
      });

      this.logger.log(`Digest sent to ${to}, email ID: ${response.data?.id}`);

      return;
    } catch (error) {
      this.logger.error(
        `Failed to send digest to ${to}`,
        error instanceof Error ? error.stack : undefined
      );
      throw error;
    }
  }

  /**
   * Track email bounce
   */
  async trackBounce(email: string, bounceType: 'hard' | 'soft'): Promise<void> {
    this.logger.warn(`Email bounce detected: ${email} (${bounceType})`);
    // Bounce tracking will be implemented with webhook handler
  }
}
