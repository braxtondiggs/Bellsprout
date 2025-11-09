import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { LoggerService } from '../../common/services/logger.service';

export interface BounceEvent {
  email: string;
  bounceType: 'hard' | 'soft';
  reason?: string;
  timestamp: Date;
}

/**
 * Bounce Handler Service
 * Manages email bounce tracking and subscription pausing
 *
 * Rules:
 * - Hard bounce: Immediate pause
 * - Soft bounce: Log for future tracking (TODO: implement counter when schema is updated)
 *
 * NOTE: Full bounce tracking requires additional fields in User model:
 * - emailBounceCount: Int
 * - lastEmailBounce: DateTime
 */
@Injectable()
export class BounceHandlerService {
  private readonly SOFT_BOUNCE_THRESHOLD = 3;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext(BounceHandlerService.name);
  }

  /**
   * Handle email bounce event
   */
  async handleBounce(event: BounceEvent): Promise<void> {
    const { email, bounceType, reason } = event;

    this.logger.warn(
      `Processing ${bounceType} bounce for ${email}: ${reason || 'Unknown reason'}`,
    );

    try {
      // Find user by email
      const user = await this.prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          subscriptionStatus: true,
        },
      });

      if (!user) {
        this.logger.warn(`User not found for bounced email: ${email}`);
        return;
      }

      if (bounceType === 'hard') {
        // Hard bounce: Pause immediately
        await this.pauseUserSubscription(user.id, email, 'Hard bounce');
      } else {
        // Soft bounce: For now, just log it
        // TODO: Implement bounce counter when schema is updated
        this.logger.warn(`Soft bounce for ${email} - bounce tracking not yet implemented`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to handle bounce for ${email}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * Pause user's digest subscription
   */
  private async pauseUserSubscription(
    userId: string,
    email: string,
    reason: string,
  ): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          subscriptionStatus: 'paused',
        },
      });

      this.logger.warn(
        `Paused digest subscription for ${email} - Reason: ${reason}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to pause subscription for ${email}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * Reset bounce counter (called on successful delivery)
   */
  async resetBounceCounter(email: string): Promise<void> {
    // TODO: Implement when bounce counter fields are added to User model
    this.logger.debug(`Would reset bounce counter for ${email} (not yet implemented)`);
  }

  /**
   * Get bounce statistics for a user
   */
  async getUserBounceStats(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        subscriptionStatus: true,
      },
    });

    if (!user) {
      return null;
    }

    return {
      email: user.email,
      bounceCount: 0, // TODO: Implement when schema is updated
      lastBounce: null, // TODO: Implement when schema is updated
      isPaused: user.subscriptionStatus === 'paused',
      isNearThreshold: false,
    };
  }
}
