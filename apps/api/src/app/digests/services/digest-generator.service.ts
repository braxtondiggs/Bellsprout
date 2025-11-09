import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { LoggerService } from '../../../common/services/logger.service';
import { ConfigService } from '@nestjs/config';
import { TemplateService, DigestTemplateData } from './template.service';
import { DigestService } from '../digests.service';

export interface GenerateDigestResult {
  digestId: string;
  userId: string;
  contentItemCount: number;
  breweryCount: number;
  isEmpty: boolean;
}

/**
 * Digest Generator Service
 * Core business logic for generating personalized weekly digests
 */
@Injectable()
export class DigestGeneratorService {
  private readonly digestPeriodDays = 7; // Weekly digest

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly config: ConfigService,
    private readonly templateService: TemplateService,
    private readonly digestService: DigestService,
  ) {
    this.logger.setContext(DigestGeneratorService.name);
  }

  /**
   * Generate digest for a specific user
   */
  async generateDigestForUser(userId: string): Promise<GenerateDigestResult> {
    this.logger.log(`Generating digest for user ${userId}`);

    try {
      // Calculate period (last 7 days)
      const periodEnd = new Date();
      const periodStart = new Date();
      periodStart.setDate(periodStart.getDate() - this.digestPeriodDays);

      // Fetch user with subscriptions
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          brewerySubscriptions: {
            where: { isActive: true },
            select: {
              brewery: {
                select: {
                  id: true,
                  name: true,
                  logoUrl: true,
                },
              },
            },
          },
        },
      });

      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      if (user.brewerySubscriptions.length === 0) {
        this.logger.log(`User ${userId} has no brewery subscriptions, skipping digest`);
        return {
          digestId: '',
          userId,
          contentItemCount: 0,
          breweryCount: 0,
          isEmpty: true,
        };
      }

      const breweryIds = user.brewerySubscriptions.map((sub) => sub.brewery.id);

      // Fetch content items from subscribed breweries
      const contentItems = await this.fetchContent(breweryIds, periodStart, periodEnd);

      if (contentItems.length === 0) {
        this.logger.log(`No content found for user ${userId} in the period`);
        return {
          digestId: '',
          userId,
          contentItemCount: 0,
          breweryCount: 0,
          isEmpty: true,
        };
      }

      // Group content by brewery
      const breweriesData = await this.groupContentByBrewery(contentItems);

      // Build template data
      const baseUrl = this.config.get<string>('APP_BASE_URL', 'http://localhost:3000');
      const templateData: DigestTemplateData = {
        user: {
          firstName: user.firstName || 'Craft Beer Enthusiast',
          lastName: user.lastName || '',
          email: user.email,
        },
        period: {
          start: periodStart,
          end: periodEnd,
        },
        breweries: breweriesData,
        totalItems: contentItems.length,
        preferencesUrl: `${baseUrl}/account/preferences`,
        unsubscribeUrl: `${baseUrl}/account/unsubscribe?token=${userId}`,
      };

      // Render template
      const renderedHtml = await this.templateService.renderDigest(templateData);

      // Format email subject
      const formatDate = (date: Date) => {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      };
      const emailSubject = `🍺 Your Brewery Digest: ${formatDate(periodStart)} - ${formatDate(periodEnd)}`;

      // Create digest record
      const digest = await this.digestService.create({
        userId,
        deliveryDate: new Date(), // Schedule for now (processor will handle actual send)
        emailSubject,
        emailHtml: renderedHtml,
      });

      // Link content items to digest
      const contentItemIds = contentItems.map((item) => item.id);
      await this.digestService.addContent(digest.id, contentItemIds);

      this.logger.log(
        `Generated digest ${digest.id} for user ${userId} with ${contentItems.length} items from ${breweriesData.length} breweries`,
      );

      return {
        digestId: digest.id,
        userId,
        contentItemCount: contentItems.length,
        breweryCount: breweriesData.length,
        isEmpty: false,
      };
    } catch (error) {
      this.logger.error(
        `Failed to generate digest for user ${userId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * Fetch content items for specified breweries within date range
   */
  private async fetchContent(
    breweryIds: string[],
    startDate: Date,
    endDate: Date,
  ) {
    return await this.prisma.contentItem.findMany({
      where: {
        breweryId: { in: breweryIds },
        publicationDate: {
          gte: startDate,
          lte: endDate,
        },
        isDuplicate: false, // Exclude duplicates
      },
      include: {
        brewery: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
          },
        },
      },
      orderBy: {
        publicationDate: 'desc',
      },
    });
  }

  /**
   * Group content items by brewery and categorize by type
   */
  private async groupContentByBrewery(contentItems: any[]) {
    const breweryMap = new Map<
      string,
      {
        id: string;
        name: string;
        logoUrl?: string;
        releases: any[];
        events: any[];
        updates: any[];
      }
    >();

    for (const item of contentItems) {
      const breweryId = item.brewery.id;

      if (!breweryMap.has(breweryId)) {
        breweryMap.set(breweryId, {
          id: item.brewery.id,
          name: item.brewery.name,
          logoUrl: item.brewery.logoUrl,
          releases: [],
          events: [],
          updates: [],
        });
      }

      const brewery = breweryMap.get(breweryId)!;

      // Extract LLM data
      const llmData = this.extractLLMData(item);

      if (!llmData) continue;

      // Categorize based on content type
      if (llmData.contentType === 'release' && llmData.beerReleases) {
        brewery.releases.push(...llmData.beerReleases);
      }

      if (llmData.events) {
        brewery.events.push(...llmData.events);
      }

      if (llmData.contentType === 'update' && llmData.updates) {
        brewery.updates.push(...llmData.updates);
      }
    }

    // Convert map to array and filter out breweries with no content
    return Array.from(breweryMap.values()).filter(
      (brewery) =>
        brewery.releases.length > 0 ||
        brewery.events.length > 0 ||
        brewery.updates.length > 0,
    );
  }

  /**
   * Extract LLM extraction data from content item
   */
  private extractLLMData(contentItem: any): any {
    if (
      !contentItem.extractedData ||
      typeof contentItem.extractedData !== 'object'
    ) {
      return null;
    }

    const data = contentItem.extractedData as any;

    if (!data.llmExtraction || !data.llmExtraction.success) {
      return null;
    }

    return data.llmExtraction;
  }

  /**
   * Generate digests for all active users
   */
  async generateAllDigests(): Promise<GenerateDigestResult[]> {
    this.logger.log('Generating digests for all active users');

    // Find all active users
    const users = await this.prisma.user.findMany({
      where: {
        subscriptionStatus: 'active',
      },
      select: {
        id: true,
      },
    });

    this.logger.log(`Found ${users.length} active users`);

    const results: GenerateDigestResult[] = [];

    for (const user of users) {
      try {
        const result = await this.generateDigestForUser(user.id);
        results.push(result);
      } catch (error) {
        this.logger.error(
          `Failed to generate digest for user ${user.id}`,
          error instanceof Error ? error.stack : String(error),
        );
        // Continue with other users
      }
    }

    const successful = results.filter((r) => !r.isEmpty).length;
    this.logger.log(
      `Generated ${successful} digests (${results.length - successful} users had no content)`,
    );

    return results;
  }
}
