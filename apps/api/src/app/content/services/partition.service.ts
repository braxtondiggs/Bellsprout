import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../../../common/services/logger.service';
import { PrismaService } from '../../../common/database/prisma.service';

@Injectable()
export class PartitionService implements OnModuleInit {
  private readonly retentionMonths: number;

  constructor(
    private readonly logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.logger.setContext(PartitionService.name);
    this.retentionMonths = this.config.get<number>(
      'CONTENT_RETENTION_MONTHS',
      12,
    );
  }

  async onModuleInit() {
    // Ensure we have partitions for current and next month on startup
    await this.ensureCurrentPartitions();
  }

  /**
   * Ensure partitions exist for current and next 2 months
   */
  async ensureCurrentPartitions(): Promise<void> {
    try {
      const now = new Date();
      const partitionsCreated: string[] = [];

      // Create partition for current month and next 2 months
      for (let i = 0; i < 3; i++) {
        const targetDate = new Date(now);
        targetDate.setMonth(now.getMonth() + i);

        const year = targetDate.getFullYear();
        const month = targetDate.getMonth() + 1; // JavaScript months are 0-indexed

        const partitionName = await this.createPartition(year, month);
        if (partitionName) {
          partitionsCreated.push(partitionName);
        }
      }

      if (partitionsCreated.length > 0) {
        this.logger.log(
          `Ensured partitions exist: ${partitionsCreated.join(', ')}`,
        );
      } else {
        this.logger.debug('All required partitions already exist');
      }
    } catch (error) {
      this.logger.error(
        'Failed to ensure current partitions',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Create a monthly partition for ContentItem table
   * Uses PostgreSQL function: create_content_partition(year, month)
   */
  async createPartition(year: number, month: number): Promise<string | null> {
    try {
      const result = await this.prisma.$queryRawUnsafe<{ create_content_partition: string }[]>(
        'SELECT create_content_partition($1, $2) as create_content_partition',
        year,
        month,
      );

      const partitionName = result[0]?.create_content_partition;

      if (partitionName) {
        this.logger.log(`Created partition: ${partitionName}`);
        return partitionName;
      }

      return null;
    } catch (error) {
      // Partition might already exist - this is okay
      if (
        error instanceof Error &&
        error.message.includes('already exists')
      ) {
        this.logger.debug(`Partition already exists for ${year}-${month}`);
        return null;
      }

      this.logger.error(
        `Failed to create partition for ${year}-${month}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * Cron job: Create new partitions monthly
   * Runs on the 1st of each month at 00:00
   */
  @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT)
  async createMonthlyPartitions(): Promise<void> {
    this.logger.log('Running monthly partition creation');

    try {
      await this.ensureCurrentPartitions();
    } catch (error) {
      this.logger.error(
        'Monthly partition creation failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Cron job: Clean up old partitions
   * Runs on the 1st of each month at 01:00
   */
  @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT)
  async cleanupOldPartitions(): Promise<void> {
    this.logger.log(
      `Running partition cleanup (${this.retentionMonths} month retention)`,
    );

    try {
      const result = await this.prisma.$queryRawUnsafe<{ drop_old_content_partitions: string }[]>(
        'SELECT drop_old_content_partitions($1) as drop_old_content_partitions',
        this.retentionMonths,
      );

      const droppedPartitions = result
        .map((r) => r.drop_old_content_partitions)
        .filter(Boolean);

      if (droppedPartitions.length > 0) {
        this.logger.log(
          `Dropped ${droppedPartitions.length} old partitions: ${droppedPartitions.join(', ')}`,
        );
      } else {
        this.logger.debug('No old partitions to clean up');
      }
    } catch (error) {
      this.logger.error(
        'Partition cleanup failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * List all existing ContentItem partitions
   */
  async listPartitions(): Promise<
    Array<{ partitionName: string; startDate: string; endDate: string }>
  > {
    const result = await this.prisma.$queryRawUnsafe<
      Array<{ partition_name: string; start_date: string; end_date: string }>
    >(`
      SELECT
        child.relname AS partition_name,
        pg_get_expr(child.relpartbound, child.oid) AS partition_bounds
      FROM pg_inherits
      JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
      JOIN pg_class child ON pg_inherits.inhrelid = child.oid
      WHERE parent.relname = 'ContentItem'
      AND child.relname LIKE 'ContentItem_%'
      ORDER BY child.relname;
    `);

    return result.map((r) => ({
      partitionName: r.partition_name,
      startDate: r.start_date || 'unknown',
      endDate: r.end_date || 'unknown',
    }));
  }

  /**
   * Get partition statistics
   */
  async getPartitionStats(): Promise<
    Array<{
      partitionName: string;
      rowCount: number;
      sizeMB: number;
    }>
  > {
    const result = await this.prisma.$queryRawUnsafe<
      Array<{
        partition_name: string;
        row_count: bigint;
        size_bytes: bigint;
      }>
    >(`
      SELECT
        child.relname AS partition_name,
        pg_class.reltuples::bigint AS row_count,
        pg_total_relation_size(child.oid) AS size_bytes
      FROM pg_inherits
      JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
      JOIN pg_class child ON pg_inherits.inhrelid = child.oid
      JOIN pg_class ON pg_class.oid = child.oid
      WHERE parent.relname = 'ContentItem'
      AND child.relname LIKE 'ContentItem_%'
      ORDER BY child.relname DESC;
    `);

    return result.map((r) => ({
      partitionName: r.partition_name,
      rowCount: Number(r.row_count),
      sizeMB: Number(r.size_bytes) / 1024 / 1024,
    }));
  }
}
