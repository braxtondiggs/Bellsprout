import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { LoggerService } from '../../common/services/logger.service';
import { DigestFilterDto, DigestResponseDto } from './dto/digest-response.dto';

/**
 * Digest Service
 * Handles CRUD operations for digest records
 */
@Injectable()
export class DigestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService
  ) {
    this.logger.setContext(DigestService.name);
  }

  /**
   * Create a new digest record
   */
  async create(data: {
    userId: string;
    deliveryDate: Date;
    emailSubject: string;
    emailHtml: string;
  }) {
    return await this.prisma.digest.create({
      data: {
        userId: data.userId,
        deliveryDate: data.deliveryDate,
        emailSubject: data.emailSubject,
        emailHtml: data.emailHtml,
        deliveryStatus: 'pending',
      },
    });
  }

  /**
   * Find digests with optional filtering
   */
  async findMany(filter: DigestFilterDto): Promise<DigestResponseDto[]> {
    const {
      userId,
      deliveryStatus,
      startDate,
      endDate,
      limit = 10,
      offset = 0,
    } = filter;

    const digests = await this.prisma.digest.findMany({
      where: {
        ...(userId && { userId }),
        ...(deliveryStatus && { deliveryStatus }),
        ...(startDate && {
          deliveryDate: {
            gte: startDate,
          },
        }),
        ...(endDate && {
          deliveryDate: {
            lte: endDate,
          },
        }),
      },
      include: {
        _count: {
          select: {
            digestContent: true,
          },
        },
        digestContent: {
          include: {
            contentItem: {
              select: {
                breweryId: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      skip: offset,
    });

    return digests.map((digest) => {
      // Calculate unique brewery count from digest content
      const uniqueBreweryIds = new Set(
        digest.digestContent.map((dc) => dc.contentItem.breweryId)
      );

      return {
        id: digest.id,
        userId: digest.userId,
        deliveryStatus: digest.deliveryStatus as 'pending' | 'sent' | 'failed',
        deliveryDate: digest.deliveryDate,
        contentItemsCount: digest._count.digestContent,
        breweriesCount: uniqueBreweryIds.size,
        generatedAt: digest.generatedAt,
        sentAt: digest.sentAt,
        createdAt: digest.createdAt,
      };
    });
  }

  /**
   * Find digest by ID
   */
  async findOne(id: string) {
    return await this.prisma.digest.findUnique({
      where: { id },
      include: {
        digestContent: {
          include: {
            contentItem: {
              include: {
                brewery: true,
              },
            },
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  /**
   * Update digest delivery status
   */
  async updateDeliveryStatus(
    id: string,
    status: 'pending' | 'sent' | 'failed',
    deliveryDate?: Date
  ) {
    return await this.prisma.digest.update({
      where: { id },
      data: {
        deliveryStatus: status,
        ...(deliveryDate && { deliveryDate }),
      },
    });
  }

  /**
   * Link content items to digest
   */
  async addContent(digestId: string, contentItemIds: string[]) {
    await this.prisma.digestContent.createMany({
      data: contentItemIds.map((contentItemId) => ({
        digestId,
        contentItemId,
      })),
      skipDuplicates: true,
    });

    this.logger.log(
      `Added ${contentItemIds.length} content items to digest ${digestId}`
    );
  }

  /**
   * Get user's digest history
   */
  async getUserDigests(userId: string, limit = 10, offset = 0) {
    return await this.findMany({
      userId,
      limit,
      offset,
    });
  }

  /**
   * Update email HTML for digest
   */
  async updateEmailHtml(id: string, emailHtml: string) {
    return await this.prisma.digest.update({
      where: { id },
      data: { emailHtml },
    });
  }
}
