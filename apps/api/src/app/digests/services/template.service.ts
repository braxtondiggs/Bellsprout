import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../../../common/services/logger.service';
import * as Handlebars from 'handlebars';
import mjml2html from 'mjml';
import juice from 'juice';
import { minify } from 'html-minifier';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface DigestTemplateData {
  user: {
    firstName: string;
    lastName: string;
    email: string;
  };
  period: {
    start: Date;
    end: Date;
  };
  breweries: Array<{
    id: string;
    name: string;
    logoUrl?: string;
    releases: Array<{
      name: string;
      style?: string;
      abv?: number;
      ibu?: number;
      description?: string;
      releaseDate?: string;
      availability?: string;
      price?: string;
    }>;
    events: Array<{
      name: string;
      date: string;
      time?: string;
      location?: string;
      description?: string;
      eventType?: string;
      ticketUrl?: string;
      isFree?: boolean;
      rsvpRequired?: boolean;
    }>;
    updates: Array<{
      title: string;
      content: string;
      category?: string;
      urls?: string[];
    }>;
  }>;
  totalItems: number;
  preferencesUrl: string;
  unsubscribeUrl: string;
}

/**
 * Template Service
 * Handles email template rendering using MJML and Handlebars
 */
@Injectable()
export class TemplateService {
  private handlebars: typeof Handlebars;
  private templateCache: Map<string, HandlebarsTemplateDelegate> = new Map();

  constructor(
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext(TemplateService.name);
    this.handlebars = Handlebars.create();
    this.registerHelpers();
  }

  /**
   * Register Handlebars helpers
   */
  private registerHelpers() {
    // Format date helper
    this.handlebars.registerHelper('formatDate', (date: Date | string) => {
      if (!date) return '';
      const d = new Date(date);
      return d.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    });

    // Format short date helper
    this.handlebars.registerHelper('formatShortDate', (date: Date | string) => {
      if (!date) return '';
      const d = new Date(date);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
    });

    // Truncate text helper
    this.handlebars.registerHelper('truncate', (text: string, length: number) => {
      if (!text) return '';
      if (text.length <= length) return text;
      return text.substring(0, length) + '...';
    });

    // Uppercase helper
    this.handlebars.registerHelper('uppercase', (text: string) => {
      return text ? text.toUpperCase() : '';
    });

    // Conditional equality helper
    this.handlebars.registerHelper('eq', (a: any, b: any) => {
      return a === b;
    });

    // Has items helper
    this.handlebars.registerHelper('hasItems', (arr: any[]) => {
      return arr && arr.length > 0;
    });

    // Count total items across all categories
    this.handlebars.registerHelper('countItems', (brewery: any) => {
      const releases = brewery.releases?.length || 0;
      const events = brewery.events?.length || 0;
      const updates = brewery.updates?.length || 0;
      return releases + events + updates;
    });

    // Format ABV
    this.handlebars.registerHelper('formatAbv', (abv: number) => {
      if (!abv) return '';
      return `${abv.toFixed(1)}%`;
    });

    // Pluralize helper
    this.handlebars.registerHelper('pluralize', (count: number, singular: string, plural: string) => {
      return count === 1 ? singular : plural;
    });
  }

  /**
   * Load and compile MJML template
   */
  private async loadTemplate(templateName: string): Promise<HandlebarsTemplateDelegate> {
    // Check cache
    const cached = this.templateCache.get(templateName);
    if (cached) {
      return cached;
    }

    // Load template file
    const templatePath = path.join(
      __dirname,
      '..',
      'templates',
      `${templateName}.mjml`,
    );

    this.logger.debug(`Loading template: ${templatePath}`);

    const mjmlContent = await fs.readFile(templatePath, 'utf-8');

    // Convert MJML to HTML
    const { html, errors } = mjml2html(mjmlContent, {
      validationLevel: 'soft',
      filePath: templatePath,
    });

    if (errors && errors.length > 0) {
      this.logger.warn(`MJML conversion warnings for ${templateName}:`, errors);
    }

    // Compile with Handlebars
    const template = this.handlebars.compile(html);

    // Cache the compiled template
    this.templateCache.set(templateName, template);

    return template;
  }

  /**
   * Load Handlebars partial
   */
  async loadPartial(partialName: string): Promise<void> {
    const partialPath = path.join(
      __dirname,
      '..',
      'partials',
      `${partialName}.hbs`,
    );

    this.logger.debug(`Loading partial: ${partialPath}`);

    const partialContent = await fs.readFile(partialPath, 'utf-8');
    this.handlebars.registerPartial(partialName, partialContent);
  }

  /**
   * Render digest email template
   */
  async renderDigest(data: DigestTemplateData): Promise<string> {
    try {
      // Load main template
      const template = await this.loadTemplate('digest');

      // Load partials (if they exist)
      try {
        await this.loadPartial('beer-release');
        await this.loadPartial('event');
        await this.loadPartial('update');
      } catch (error) {
        this.logger.debug('Partials not found, skipping');
      }

      // Render template with data
      let html = template(data);

      // Inline CSS
      html = juice(html, {
        preserveMediaQueries: true,
        preserveFontFaces: true,
        removeStyleTags: false,
      });

      // Minify HTML
      html = minify(html, {
        collapseWhitespace: true,
        removeComments: true,
        minifyCSS: true,
        minifyJS: true,
      });

      this.logger.log('Digest template rendered successfully');

      return html;
    } catch (error) {
      this.logger.error(
        'Failed to render digest template',
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * Clear template cache (useful for development/testing)
   */
  clearCache(): void {
    this.templateCache.clear();
    this.logger.log('Template cache cleared');
  }
}
