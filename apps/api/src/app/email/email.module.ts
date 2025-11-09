import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { InboundEmailService } from './inbound-email.service';
import { BounceHandlerService } from './bounce-handler.service';
import { EmailController } from './email.controller';
import { DatabaseModule } from '../../common/database/database.module';
import { LoggerModule } from '../../common/services/logger.module';

@Module({
  imports: [DatabaseModule, LoggerModule],
  controllers: [EmailController],
  providers: [EmailService, InboundEmailService, BounceHandlerService],
  exports: [EmailService, BounceHandlerService],
})
export class EmailModule {}
