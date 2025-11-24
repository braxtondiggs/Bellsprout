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
 * - Hard bounce: Immediate pause and increment counter
 * - Soft bounce: Increment counter, pause after 3 consecutive bounces
 * - Successful delivery: Reset bounce counter to 0
 */
@Injectable()
export class BounceHandlerService {
  private readonly SOFT_BOUNCE_THRESHOLD = 3;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService
  ) {
    this.logger.setContext(BounceHandlerService.name);
  }

  /**
   * Handle email bounce event
   */
  async handleBounce(event: BounceEvent): Promise<void> {
    const { email, bounceType, reason } = event;

    this.logger.warn(
      `Processing ${bounceType} bounce for ${email}: ${
        reason || 'Unknown reason'
      }`
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
        // Hard bounce: Pause immediately and record
        await this.pauseUserSubscription(user.id, email, 'hard-bounce');

        this.logger.warn(`Hard bounce for ${email} - subscription paused`);
      } else {
        // Soft bounce: Increment counter and pause if threshold reached
        const updatedUser = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            bounceCount: { increment: 1 },
            lastBounceAt: new Date(),
            lastBounceType: 'soft',
          },
          select: {
            bounceCount: true,
          },
        });

        this.logger.warn(
          `Soft bounce for ${email} - bounce count: ${updatedUser.bounceCount}/${this.SOFT_BOUNCE_THRESHOLD}`
        );

        // Pause subscription if threshold reached
        if (updatedUser.bounceCount >= this.SOFT_BOUNCE_THRESHOLD) {
          await this.pauseUserSubscription(
            user.id,
            email,
            'soft-bounce-threshold'
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to handle bounce for ${email}`,
        error instanceof Error ? error.stack : String(error)
      );
      throw error;
    }
  }

  /**
   * Reset bounce counter (called on successful delivery)
   */
  async resetBounceCounter(email: string): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { email },
        data: {
          bounceCount: 0,
          lastBounceAt: null,
          lastBounceType: null,
        },
      });

      this.logger.debug(`Reset bounce counter for ${email}`);
    } catch (error) {
      this.logger.warn(
        `Failed to reset bounce counter for ${email}`,
        error instanceof Error ? error.stack : undefined
      );
    }
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
        bounceCount: true,
        lastBounceAt: true,
        lastBounceType: true,
      },
    });

    if (!user) {
      return null;
    }

    return {
      email: user.email,
      bounceCount: user.bounceCount,
      lastBounce: user.lastBounceAt,
      lastBounceType: user.lastBounceType,
      isPaused: user.subscriptionStatus === 'paused',
      isNearThreshold: user.bounceCount >= this.SOFT_BOUNCE_THRESHOLD - 1,
    };
  }

  /**
   * TODO: expand pause handling (notify user, reason codes, audit trail).
   */
  private async pauseUserSubscription(
    userId: string,
    email: string,
    reason: string
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionStatus: 'paused',
        bounceCount: { increment: 1 },
        lastBounceAt: new Date(),
        lastBounceType: reason.includes('hard') ? 'hard' : 'soft',
      },
    });

    this.logger.warn(
      `Paused digest subscription for ${email} - Reason: ${reason}`
    );
  }
}
