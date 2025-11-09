import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../../common/services/logger.service';
import { PrismaService } from '../../../common/database/prisma.service';

export interface FailedJobData {
  queueName: string;
  jobName: string;
  data: any;
  error: string;
  stackTrace?: string;
  attemptsMade: number;
}

@Injectable()
export class FailedJobService {
  constructor(
    private readonly logger: LoggerService,
    private readonly prisma: PrismaService,
  ) {
    this.logger.setContext(FailedJobService.name);
  }

  /**
   * Record a failed job in the database
   */
  async recordFailedJob(failedJob: FailedJobData): Promise<void> {
    try {
      await this.prisma.failedJob.create({
        data: {
          queueName: failedJob.queueName,
          jobName: failedJob.jobName,
          jobData: failedJob.data,
          error: failedJob.error,
          stackTrace: failedJob.stackTrace,
          attemptsMade: failedJob.attemptsMade,
        },
      });

      this.logger.warn(
        `Recorded failed job: ${failedJob.queueName}/${failedJob.jobName}`,
      );
    } catch (error) {
      this.logger.error(
        'Failed to record failed job',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Get failed jobs with optional filtering
   */
  async getFailedJobs(options?: {
    queueName?: string;
    jobName?: string;
    limit?: number;
    offset?: number;
  }) {
    const { queueName, jobName, limit = 100, offset = 0 } = options || {};

    return await this.prisma.failedJob.findMany({
      where: {
        ...(queueName && { queueName }),
        ...(jobName && { jobName }),
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Delete a failed job by ID
   */
  async deleteFailedJob(id: string): Promise<void> {
    await this.prisma.failedJob.delete({
      where: { id },
    });

    this.logger.log(`Deleted failed job ${id}`);
  }

  /**
   * Delete old failed jobs (cleanup)
   */
  async cleanup(olderThanDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await this.prisma.failedJob.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    this.logger.log(
      `Cleaned up ${result.count} failed jobs older than ${olderThanDays} days`,
    );

    return result.count;
  }

  /**
   * Get failed job statistics by queue
   */
  async getStatsByQueue(): Promise<
    Array<{
      queueName: string;
      failedCount: number;
    }>
  > {
    const stats = await this.prisma.failedJob.groupBy({
      by: ['queueName'],
      _count: {
        _all: true,
      },
    });

    return stats.map((stat) => ({
      queueName: stat.queueName,
      failedCount: stat._count._all,
    }));
  }
}
