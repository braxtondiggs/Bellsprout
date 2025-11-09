import {
  Injectable,
  NotFoundException,
  ConflictException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { LoggerService } from '../../common/services/logger.service';
import { EmailService } from '../email/email.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { SubscriptionStatus } from '@prisma/client';
import { randomBytes } from 'crypto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    @Inject(forwardRef(() => EmailService))
    private readonly emailService: EmailService,
  ) {
    this.logger.setContext(UsersService.name);
  }

  /**
   * Get user profile by ID
   */
  async getUserProfile(userId: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        emailVerified: true,
        subscriptionStatus: true,
        digestDeliveryDay: true,
        digestFormat: true,
        contentTypePreferences: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /**
   * Update user profile
   */
  async updateProfile(
    userId: string,
    updateUserDto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: updateUserDto,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        emailVerified: true,
        subscriptionStatus: true,
        digestDeliveryDay: true,
        digestFormat: true,
        contentTypePreferences: true,
        createdAt: true,
      },
    });

    this.logger.log(`User profile updated: ${user.email}`);

    return user;
  }

  /**
   * Request email change with verification
   */
  async changeEmail(userId: string, newEmail: string): Promise<{ message: string }> {
    // Check if new email is already in use
    const existingUser = await this.prisma.user.findUnique({
      where: { email: newEmail.toLowerCase() },
    });

    if (existingUser) {
      throw new ConflictException('Email already in use');
    }

    // Generate new verification token
    const emailVerificationToken = randomBytes(32).toString('hex');

    // Get user's name before update
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });

    // Update user with new email (unverified) and token
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        email: newEmail.toLowerCase(),
        emailVerified: false,
        emailVerificationToken,
      },
    });

    this.logger.log(`Email change requested for user ${userId} to ${newEmail}`);

    // Send verification email to new address
    if (user) {
      const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'User';
      try {
        await this.emailService.sendVerificationEmail(
          newEmail,
          fullName,
          emailVerificationToken,
        );
      } catch (error) {
        this.logger.error('Failed to send email change verification', error instanceof Error ? error.stack : undefined);
        // Don't fail the request if email fails
      }
    }

    return {
      message: 'Email updated. Please check your new email to verify it.',
    };
  }

  /**
   * Update subscription status
   */
  async updateSubscriptionStatus(
    userId: string,
    status: SubscriptionStatus,
  ): Promise<UserResponseDto> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionStatus: status,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        emailVerified: true,
        subscriptionStatus: true,
        digestDeliveryDay: true,
        digestFormat: true,
        contentTypePreferences: true,
        createdAt: true,
      },
    });

    this.logger.log(`User ${user.email} subscription status updated to ${status}`);

    return user;
  }

  /**
   * Subscribe to a brewery
   */
  async subscribeToBrewery(userId: string, breweryId: string): Promise<{ message: string }> {
    // Verify brewery exists
    const brewery = await this.prisma.brewery.findUnique({
      where: { id: breweryId },
    });

    if (!brewery) {
      throw new NotFoundException('Brewery not found');
    }

    // Check if already subscribed
    const existingSubscription = await this.prisma.userBrewerySubscription.findUnique({
      where: {
        userId_breweryId: {
          userId,
          breweryId,
        },
      },
    });

    if (existingSubscription) {
      throw new ConflictException('Already subscribed to this brewery');
    }

    // Create subscription
    await this.prisma.userBrewerySubscription.create({
      data: {
        userId,
        breweryId,
      },
    });

    this.logger.log(`User ${userId} subscribed to brewery ${brewery.name}`);

    return {
      message: `Successfully subscribed to ${brewery.name}`,
    };
  }

  /**
   * Unsubscribe from a brewery
   */
  async unsubscribeFromBrewery(userId: string, breweryId: string): Promise<{ message: string }> {
    // Verify subscription exists
    const subscription = await this.prisma.userBrewerySubscription.findUnique({
      where: {
        userId_breweryId: {
          userId,
          breweryId,
        },
      },
      include: {
        brewery: true,
      },
    });

    if (!subscription) {
      throw new NotFoundException('Not subscribed to this brewery');
    }

    // Delete subscription
    await this.prisma.userBrewerySubscription.delete({
      where: {
        userId_breweryId: {
          userId,
          breweryId,
        },
      },
    });

    this.logger.log(`User ${userId} unsubscribed from brewery ${subscription.brewery.name}`);

    return {
      message: `Successfully unsubscribed from ${subscription.brewery.name}`,
    };
  }

  /**
   * Get user's brewery subscriptions
   */
  async getUserBreweries(userId: string) {
    const subscriptions = await this.prisma.userBrewerySubscription.findMany({
      where: { userId },
      include: {
        brewery: {
          select: {
            id: true,
            name: true,
            city: true,
            state: true,
            region: true,
          },
        },
      },
      orderBy: {
        subscribedAt: 'desc',
      },
    });

    return subscriptions.map((sub) => ({
      ...sub.brewery,
      subscribedAt: sub.subscribedAt,
    }));
  }
}
