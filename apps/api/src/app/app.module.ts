import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '../common/config/config.module';
import { DatabaseModule } from '../common/database/database.module';
import { QueueModule } from '../common/queues/queue.module';
import { LoggerService } from '../common/services/logger.service';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    QueueModule,
  ],
  controllers: [AppController],
  providers: [AppService, LoggerService],
})
export class AppModule {}
