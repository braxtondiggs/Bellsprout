import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../../common/database/prisma.service';
import { LoggerService } from '../../../common/services/logger.service';
import { QueueName } from '../../../common/queues/queue.config';

@Injectable()
export class RSSScrapingScheduler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    @InjectQueue(QueueName.COLLECT) private readonly collectQueue: Queue,
  ) {
    this.logger.setContext(RSSScrapingScheduler.name);
  }

  @Cron('0 */4 * * *', {
    name: 'rss-scraping',
    timeZone: 'UTC',
  })
  async scheduleRSSFetching() {
    this.logger.log('Starting scheduled RSS feed fetching');

    try {
      const breweries = await this.prisma.brewery.findMany({
        where: {
          rssFeedUrl: { not: null },
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          rssFeedUrl: true,
        },
      });

      for (const brewery of breweries) {
        await this.collectQueue.add('fetch-rss', {
          breweryId: brewery.id,
          rssFeedUrl: brewery.rssFeedUrl,
        });
      }

      this.logger.log(`Scheduled ${breweries.length} RSS fetching jobs`);
    } catch (error) {
      this.logger.error(
        'Failed to schedule RSS fetching jobs',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
