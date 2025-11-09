import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { LoggerService } from '../../common/services/logger.service';
import { BreweryResponseDto } from './dto/brewery-response.dto';

@Injectable()
export class UserBrewerySubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext(UserBrewerySubscriptionService.name);
  }

  /**
   * Subscribe user to a brewery
   */
  async subscribe(userId: string, breweryId: string): Promise<void> {
    // Verify brewery exists
    const brewery = await this.prisma.brewery.findUnique({
      where: { id: breweryId },
    });

    if (!brewery) {
      throw new NotFoundException(`Brewery with ID ${breweryId} not found`);
    }

    // Check if already subscribed
    const existing = await this.prisma.userBrewerySubscription.findUnique({
      where: {
        userId_breweryId: {
          userId,
          breweryId,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `User is already subscribed to brewery ${breweryId}`,
      );
    }

    // Create subscription
    await this.prisma.userBrewerySubscription.create({
      data: {
        userId,
        breweryId,
      },
    });

    this.logger.log(`User ${userId} subscribed to brewery ${breweryId}`);
  }

  /**
   * Unsubscribe user from a brewery
   */
  async unsubscribe(userId: string, breweryId: string): Promise<void> {
    const subscription = await this.prisma.userBrewerySubscription.findUnique({
      where: {
        userId_breweryId: {
          userId,
          breweryId,
        },
      },
    });

    if (!subscription) {
      throw new NotFoundException(
        `User is not subscribed to brewery ${breweryId}`,
      );
    }

    await this.prisma.userBrewerySubscription.delete({
      where: {
        userId_breweryId: {
          userId,
          breweryId,
        },
      },
    });

    this.logger.log(`User ${userId} unsubscribed from brewery ${breweryId}`);
  }

  /**
   * Get all breweries a user is subscribed to
   */
  async getUserSubscriptions(userId: string): Promise<BreweryResponseDto[]> {
    const subscriptions = await this.prisma.userBrewerySubscription.findMany({
      where: { userId },
      include: {
        brewery: {
          include: {
            _count: {
              select: {
                userSubscriptions: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return subscriptions.map((sub) => ({
      id: sub.brewery.id,
      name: sub.brewery.name,
      city: sub.brewery.city,
      state: sub.brewery.state,
      region: sub.brewery.region,
      website: sub.brewery.websiteUrl || undefined,
      instagramHandle: sub.brewery.instagramHandle || undefined,
      facebookHandle: sub.brewery.facebookHandle || undefined,
      rssFeedUrl: sub.brewery.rssFeedUrl || undefined,
      logoUrl: sub.brewery.logoUrl || undefined,
      subscriberCount: sub.brewery._count.userSubscriptions,
      isSubscribed: true,
      createdAt: sub.brewery.createdAt,
      updatedAt: sub.brewery.updatedAt,
    }));
  }

  /**
   * Check if user is subscribed to a brewery
   */
  async isSubscribed(userId: string, breweryId: string): Promise<boolean> {
    const subscription = await this.prisma.userBrewerySubscription.findUnique({
      where: {
        userId_breweryId: {
          userId,
          breweryId,
        },
      },
    });

    return !!subscription;
  }

  /**
   * Get subscription count for a brewery
   */
  async getSubscriberCount(breweryId: string): Promise<number> {
    return await this.prisma.userBrewerySubscription.count({
      where: { breweryId },
    });
  }
}
