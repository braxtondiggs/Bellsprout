import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { LoggerService } from '../../common/services/logger.service';
import { BreweryFilterDto } from './dto/brewery-filter.dto';
import { BreweryResponseDto } from './dto/brewery-response.dto';
import { PaginatedBreweryResponseDto } from './dto/paginated-brewery-response.dto';

@Injectable()
export class BreweriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext(BreweriesService.name);
  }

  /**
   * Get all breweries with optional filtering and pagination
   */
  async findAll(
    filter: BreweryFilterDto,
    userId?: string,
  ): Promise<PaginatedBreweryResponseDto> {
    const { page = 1, limit = 20, sortBy = 'name', sortOrder = 'asc', search, city, state, region } = filter;

    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};

    if (search) {
      where.name = {
        contains: search,
        mode: 'insensitive',
      };
    }

    if (city) {
      where.city = city;
    }

    if (state) {
      where.state = state;
    }

    if (region) {
      where.region = region;
    }

    // Execute query with pagination
    const [breweries, total] = await Promise.all([
      this.prisma.brewery.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
        include: {
          _count: {
            select: {
              userSubscriptions: true,
            },
          },
          ...(userId && {
            userSubscriptions: {
              where: {
                userId,
              },
              select: {
                id: true,
              },
            },
          }),
        },
      }),
      this.prisma.brewery.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    const data: BreweryResponseDto[] = breweries.map((brewery) => ({
      id: brewery.id,
      name: brewery.name,
      city: brewery.city,
      state: brewery.state,
      region: brewery.region,
      website: brewery.websiteUrl || undefined,
      instagramHandle: brewery.instagramHandle || undefined,
      facebookHandle: brewery.facebookHandle || undefined,
      rssFeedUrl: brewery.rssFeedUrl || undefined,
      logoUrl: brewery.logoUrl || undefined,
      subscriberCount: brewery._count.userSubscriptions,
      isSubscribed: userId ? (brewery.userSubscriptions as any)?.length > 0 : undefined,
      createdAt: brewery.createdAt,
      updatedAt: brewery.updatedAt,
    }));

    return {
      data,
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };
  }

  /**
   * Get a single brewery by ID
   */
  async findOne(id: string, userId?: string): Promise<BreweryResponseDto> {
    const brewery = await this.prisma.brewery.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            userSubscriptions: true,
          },
        },
        ...(userId && {
          userSubscriptions: {
            where: {
              userId,
            },
            select: {
              id: true,
            },
          },
        }),
      },
    });

    if (!brewery) {
      throw new NotFoundException(`Brewery with ID ${id} not found`);
    }

    return {
      id: brewery.id,
      name: brewery.name,
      city: brewery.city,
      state: brewery.state,
      region: brewery.region,
      website: brewery.websiteUrl || undefined,
      instagramHandle: brewery.instagramHandle || undefined,
      facebookHandle: brewery.facebookHandle || undefined,
      rssFeedUrl: brewery.rssFeedUrl || undefined,
      logoUrl: brewery.logoUrl || undefined,
      subscriberCount: brewery._count.userSubscriptions,
      isSubscribed: userId ? (brewery.userSubscriptions as any)?.length > 0 : undefined,
      createdAt: brewery.createdAt,
      updatedAt: brewery.updatedAt,
    };
  }

  /**
   * Search breweries by name, location, or region
   */
  async search(query: string, userId?: string): Promise<BreweryResponseDto[]> {
    const breweries = await this.prisma.brewery.findMany({
      where: {
        OR: [
          {
            name: {
              contains: query,
              mode: 'insensitive',
            },
          },
          {
            city: {
              contains: query,
              mode: 'insensitive',
            },
          },
        ],
      },
      take: 50, // Limit search results
      orderBy: {
        name: 'asc',
      },
      include: {
        _count: {
          select: {
            userSubscriptions: true,
          },
        },
        ...(userId && {
          userSubscriptions: {
            where: {
              userId,
            },
            select: {
              id: true,
            },
          },
        }),
      },
    });

    return breweries.map((brewery) => ({
      id: brewery.id,
      name: brewery.name,
      city: brewery.city,
      state: brewery.state,
      region: brewery.region,
      website: brewery.websiteUrl || undefined,
      instagramHandle: brewery.instagramHandle || undefined,
      facebookHandle: brewery.facebookHandle || undefined,
      rssFeedUrl: brewery.rssFeedUrl || undefined,
      logoUrl: brewery.logoUrl || undefined,
      subscriberCount: brewery._count.userSubscriptions,
      isSubscribed: userId ? (brewery.userSubscriptions as any)?.length > 0 : undefined,
      createdAt: brewery.createdAt,
      updatedAt: brewery.updatedAt,
    }));
  }
}
