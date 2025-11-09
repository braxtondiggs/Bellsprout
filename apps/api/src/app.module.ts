import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';

// Common modules
import { ConfigModule } from './common/config/config.module';
import { DatabaseModule } from './common/database/database.module';
import { QueueModule } from './common/queues/queue.module';
import { LoggerModule } from './common/services/logger.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggerService } from './common/services/logger.service';
import { BullBoardModule } from './common/bull-board/bull-board.module';
import { StorageModule } from './common/storage/storage.module';

// App modules
import { ContentModule } from './app/content/content.module';
import { BreweriesModule } from './app/breweries/breweries.module';
import { AuthModule } from './app/auth/auth.module';
import { UsersModule } from './app/users/users.module';
import { EmailModule } from './app/email/email.module';
import { DigestModule } from './app/digests/digests.module';

@Module({
  imports: [
    // Configuration
    ConfigModule,

    // Logging (must be early to capture startup logs)
    LoggerModule,

    // Database
    DatabaseModule,

    // Storage (MinIO)
    StorageModule,

    // Queue management
    QueueModule,

    // Bull Board (queue monitoring)
    BullBoardModule,

    // Scheduling
    ScheduleModule.forRoot(),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute
      },
    ]),

    // Application modules
    ContentModule,
    BreweriesModule,
    AuthModule,
    UsersModule,
    EmailModule,
    DigestModule,
  ],
  providers: [
    // Global exception filter
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    // Logger service
    LoggerService,
  ],
})
export class AppModule {}
