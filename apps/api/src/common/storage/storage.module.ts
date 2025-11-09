import { Module } from '@nestjs/common';
import { MinioService } from './minio.service';
import { StorageCleanupService } from './storage-cleanup.service';
import { StorageCleanupScheduler } from './storage-cleanup.scheduler';
import { LoggerModule } from '../services/logger.module';

@Module({
  imports: [LoggerModule],
  providers: [MinioService, StorageCleanupService, StorageCleanupScheduler],
  exports: [MinioService, StorageCleanupService],
})
export class StorageModule {}
