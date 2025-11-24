import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { StorageCleanupService } from './storage-cleanup.service';
import { LoggerService } from '../services/logger.service';

/**
 * Storage Cleanup Scheduler
 * Runs automated cleanup of old MinIO files based on retention policies
 * Default: Daily at 2 AM UTC
 */
@Injectable()
export class StorageCleanupScheduler {
  constructor(
    private readonly cleanupService: StorageCleanupService,
    private readonly logger: LoggerService
  ) {
    this.logger.setContext(StorageCleanupScheduler.name);
  }

  /**
   * Scheduled cleanup job
   * Runs daily to clean up old files from MinIO
   */
  @Cron('0 2 * * *', {
    name: 'minio-cleanup',
    timeZone: 'UTC',
  })
  async runScheduledCleanup() {
    this.logger.log('Starting scheduled MinIO cleanup...');

    try {
      const stats = await this.cleanupService.cleanupAll();

      this.logger.log(
        `Scheduled cleanup completed successfully: ${
          stats.deleted
        } files deleted, ${this.formatBytes(stats.bytesFreed)} freed`
      );

      // Log warning if too many failures
      if (stats.failed > 0) {
        const failureRate = (stats.failed / stats.scanned) * 100;
        if (failureRate > 10) {
          this.logger.warn(
            `High cleanup failure rate: ${stats.failed}/${
              stats.scanned
            } (${failureRate.toFixed(1)}%)`
          );
        }
      }
    } catch (error) {
      this.logger.error(
        'Scheduled cleanup failed',
        error instanceof Error ? error.stack : undefined
      );
    }
  }

  /**
   * Format bytes to human readable
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}
