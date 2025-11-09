import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MinioService } from './minio.service';
import { LoggerService } from '../services/logger.service';

interface CleanupStats {
  scanned: number;
  deleted: number;
  failed: number;
  bytesFreed: number;
}

/**
 * Storage Cleanup Service
 * Manages automatic cleanup of old files from MinIO based on retention policies
 */
@Injectable()
export class StorageCleanupService {
  private readonly emailRetentionDays: number;
  private readonly imageRetentionDays: number;
  private readonly documentRetentionDays: number;

  constructor(
    private readonly config: ConfigService,
    private readonly minio: MinioService,
    private readonly logger: LoggerService
  ) {
    this.logger.setContext(StorageCleanupService.name);

    // Load retention settings from environment
    this.emailRetentionDays = this.config.get<number>(
      'MINIO_EMAIL_RETENTION_DAYS',
      365
    );
    this.imageRetentionDays = this.config.get<number>(
      'MINIO_IMAGE_RETENTION_DAYS',
      730
    );
    this.documentRetentionDays = this.config.get<number>(
      'MINIO_DOCUMENT_RETENTION_DAYS',
      365
    );

    this.logger.log(
      `Retention policy loaded: Emails=${this.emailRetentionDays}d, Images=${this.imageRetentionDays}d, Docs=${this.documentRetentionDays}d`
    );
  }

  /**
   * Run cleanup for all file types
   */
  async cleanupAll(): Promise<CleanupStats> {
    this.logger.log('Starting MinIO cleanup process...');

    const totalStats: CleanupStats = {
      scanned: 0,
      deleted: 0,
      failed: 0,
      bytesFreed: 0,
    };

    try {
      // Cleanup emails
      const emailStats = await this.cleanupEmails();
      this.mergeStats(totalStats, emailStats);

      // Cleanup images
      const imageStats = await this.cleanupImages();
      this.mergeStats(totalStats, imageStats);

      // Cleanup documents
      const documentStats = await this.cleanupDocuments();
      this.mergeStats(totalStats, documentStats);

      this.logger.log(
        `Cleanup completed: Scanned=${totalStats.scanned}, Deleted=${
          totalStats.deleted
        }, Failed=${totalStats.failed}, Freed=${this.formatBytes(
          totalStats.bytesFreed
        )}`
      );

      return totalStats;
    } catch (error) {
      this.logger.error(
        'Cleanup process failed',
        error instanceof Error ? error.stack : undefined
      );
      throw error;
    }
  }

  /**
   * Cleanup old email snapshots
   */
  async cleanupEmails(): Promise<CleanupStats> {
    return this.cleanupByPattern(
      '**/emails/*.json',
      this.emailRetentionDays,
      'email snapshots'
    );
  }

  /**
   * Cleanup old images
   */
  async cleanupImages(): Promise<CleanupStats> {
    return this.cleanupByPattern(
      '**/images/*',
      this.imageRetentionDays,
      'images'
    );
  }

  /**
   * Cleanup old documents
   */
  async cleanupDocuments(): Promise<CleanupStats> {
    return this.cleanupByPattern(
      '**/documents/*',
      this.documentRetentionDays,
      'documents'
    );
  }

  /**
   * Cleanup files matching a pattern older than retention period
   */
  private async cleanupByPattern(
    pattern: string,
    retentionDays: number,
    fileType: string
  ): Promise<CleanupStats> {
    this.logger.log(
      `Cleaning up ${fileType} older than ${retentionDays} days...`
    );

    const stats: CleanupStats = {
      scanned: 0,
      deleted: 0,
      failed: 0,
      bytesFreed: 0,
    };

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    try {
      // List all files matching pattern
      const files = await this.minio.listFiles(pattern);
      stats.scanned = files.length;

      this.logger.debug(`Found ${files.length} ${fileType} to check`);

      // Check each file's age and delete if older than retention
      for (const fileKey of files) {
        try {
          const fileAge = await this.getFileAge(fileKey);

          if (fileAge && fileAge < cutoffDate) {
            const fileSize = await this.getFileSize(fileKey);
            await this.minio.deleteFile(fileKey);

            stats.deleted++;
            if (fileSize) {
              stats.bytesFreed += fileSize;
            }

            this.logger.debug(
              `Deleted ${fileKey} (age: ${this.formatAge(fileAge)})`
            );
          }
        } catch (error) {
          stats.failed++;
          this.logger.warn(
            `Failed to process ${fileKey}: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`
          );
        }
      }

      this.logger.log(
        `${fileType} cleanup: ${stats.deleted}/${stats.scanned} deleted, ${stats.failed} failed`
      );

      return stats;
    } catch (error) {
      this.logger.error(
        `Failed to cleanup ${fileType}`,
        error instanceof Error ? error.stack : undefined
      );
      return stats;
    }
  }

  /**
   * Get file age from MinIO metadata
   */
  private async getFileAge(key: string): Promise<Date | null> {
    try {
      // MinIO stores LastModified in stat metadata
      const stat = await this.minio['client'].statObject(
        this.minio['bucket'],
        key
      );
      return stat.lastModified;
    } catch (error) {
      this.logger.warn(`Could not get age for ${key}`);
      return null;
    }
  }

  /**
   * Get file size from MinIO metadata
   */
  private async getFileSize(key: string): Promise<number | null> {
    try {
      const stat = await this.minio['client'].statObject(
        this.minio['bucket'],
        key
      );
      return stat.size;
    } catch (error) {
      return null;
    }
  }

  /**
   * Merge cleanup stats
   */
  private mergeStats(target: CleanupStats, source: CleanupStats): void {
    target.scanned += source.scanned;
    target.deleted += source.deleted;
    target.failed += source.failed;
    target.bytesFreed += source.bytesFreed;
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

  /**
   * Format age to human readable
   */
  private formatAge(date: Date): string {
    const days = Math.floor(
      (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)
    );
    return `${days} days`;
  }
}
