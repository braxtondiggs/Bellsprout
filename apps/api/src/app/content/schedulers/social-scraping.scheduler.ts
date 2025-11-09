import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../../common/database/prisma.service';
import { LoggerService } from '../../../common/services/logger.service';
import { QueueName } from '../../../common/queues/queue.config';

@Injectable()
export class SocialScrapingScheduler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    @InjectQueue(QueueName.COLLECT) private readonly collectQueue: Queue,
  ) {
    this.logger.setContext(SocialScrapingScheduler.name);
  }

  @Cron('0 */6 * * *', {
    name: 'social-scraping',
    timeZone: 'UTC',
  })
  async scheduleSocialScraping() {
    this.logger.log('Starting scheduled social media scraping');

    try {
      const instagramBreweries = await this.prisma.brewery.findMany({
        where: {
          instagramHandle: { not: null },
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          instagramHandle: true,
        },
      });

      const facebookBreweries = await this.prisma.brewery.findMany({
        where: {
          facebookHandle: { not: null },
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          facebookHandle: true,
        },
      });

      for (const brewery of instagramBreweries) {
        await this.collectQueue.add('scrape-instagram', {
          breweryId: brewery.id,
          instagramHandle: brewery.instagramHandle,
        });
      }

      for (const brewery of facebookBreweries) {
        await this.collectQueue.add('scrape-facebook', {
          breweryId: brewery.id,
          facebookHandle: brewery.facebookHandle,
        });
      }

      this.logger.log(
        `Scheduled ${instagramBreweries.length} Instagram and ${facebookBreweries.length} Facebook scraping jobs`,
      );
    } catch (error) {
      this.logger.error(
        'Failed to schedule social scraping jobs',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
