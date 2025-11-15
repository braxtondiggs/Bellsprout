import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EmailService } from './email.service';
import { InboundEmailService } from './inbound-email.service';
import { BounceHandlerService } from './bounce-handler.service';
import { EmailRendererService } from './email-renderer.service';
import { EmailController } from './email.controller';
import { DatabaseModule } from '../../common/database/database.module';
import { LoggerModule } from '../../common/services/logger.module';
import { StorageModule } from '../../common/storage/storage.module';
import { QueueName } from '../../common/queues/queue.config';

@Module({
  imports: [
    DatabaseModule,
    LoggerModule,
    StorageModule,
    BullModule.registerQueue({
      name: QueueName.COLLECT,
    }),
  ],
  controllers: [EmailController],
  providers: [
    EmailService,
    InboundEmailService,
    BounceHandlerService,
    EmailRendererService,
  ],
  exports: [EmailService, BounceHandlerService, EmailRendererService],
})
export class EmailModule {}
