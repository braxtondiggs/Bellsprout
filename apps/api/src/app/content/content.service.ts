import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { LoggerService } from '../../common/services/logger.service';
import { ContentType, SourceType, Prisma } from '@prisma/client';
import { CreateContentItemDto } from './dto/create-content-item.dto';

/**
 * Content Service
 * Base service for content management and retrieval
 */
@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService
  ) {
    this.logger.setContext(ContentService.name);
  }

  /**
   * Create a new content item
   */
  async create(data: CreateContentItemDto) {
    this.logger.log(`Creating content item for brewery ${data.breweryId}`);

    return this.prisma.contentItem.create({
      data: {
        breweryId: data.breweryId,
        type: data.type,
        sourceType: data.sourceType,
        sourceUrl: data.sourceUrl,
        rawContent: data.rawContent,
        extractedData: data.extractedData || {},
        publicationDate: data.publicationDate,
        confidenceScore: data.confidenceScore,
      },
    });
  }

  /**
   * Find content items by brewery
   */
  async findByBrewery(
    breweryId: string,
    options?: {
      limit?: number;
      offset?: number;
      type?: ContentType;
      startDate?: Date;
      endDate?: Date;
    }
  ) {
    const where: Prisma.ContentItemWhereInput = {
      breweryId,
      isDuplicate: false, // Only non-duplicate items
    };

    if (options?.type) {
      where.type = options.type;
    }

    if (options?.startDate || options?.endDate) {
      where.publicationDate = {};
      if (options.startDate) {
        where.publicationDate.gte = options.startDate;
      }
      if (options.endDate) {
        where.publicationDate.lte = options.endDate;
      }
    }

    return this.prisma.contentItem.findMany({
      where,
      orderBy: { publicationDate: 'desc' },
      take: options?.limit || 50,
      skip: options?.offset || 0,
      include: {
        brewery: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });
  }

  /**
   * Find content items for digest generation
   * Gets non-duplicate content from the last N days for specific breweries
   */
  async findForDigest(breweryIds: string[], daysBack = 7) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    return this.prisma.contentItem.findMany({
      where: {
        breweryId: { in: breweryIds },
        publicationDate: { gte: startDate },
        isDuplicate: false,
      },
      orderBy: [
        { breweryId: 'asc' },
        { type: 'asc' },
        { publicationDate: 'desc' },
      ],
      include: {
        brewery: {
          select: {
            id: true,
            name: true,
            slug: true,
            logoUrl: true,
          },
        },
      },
    });
  }

  /**
   * Mark content item as duplicate
   */
  async markAsDuplicate(contentItemId: string, duplicateOfId: string) {
    this.logger.log(
      `Marking content ${contentItemId} as duplicate of ${duplicateOfId}`
    );

    return this.prisma.contentItem.update({
      where: { id: contentItemId },
      data: {
        isDuplicate: true,
        duplicateOfId,
      },
    });
  }

  /**
   * Get content statistics for a brewery
   */
  async getBreweryStats(breweryId: string) {
    const [total, byType, bySource] = await Promise.all([
      this.prisma.contentItem.count({
        where: { breweryId, isDuplicate: false },
      }),
      this.prisma.contentItem.groupBy({
        by: ['type'],
        where: { breweryId, isDuplicate: false },
        _count: true,
      }),
      this.prisma.contentItem.groupBy({
        by: ['sourceType'],
        where: { breweryId, isDuplicate: false },
        _count: true,
      }),
    ]);

    return {
      total,
      byType: Object.fromEntries(
        byType.map((item) => [item.type, item._count])
      ),
      bySource: Object.fromEntries(
        bySource.map((item) => [item.sourceType, item._count])
      ),
    };
  }
}
