import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DigestService } from './digests.service';
import { DigestController } from './digests.controller';
import { TemplateService } from './services/template.service';
import { DigestGeneratorService } from './services/digest-generator.service';
import { DigestGenerationProcessor } from './jobs/digest-generation.processor';
import { DigestDeliveryProcessor } from './jobs/digest-delivery.processor';
import { DigestScheduler } from './schedulers/digest.scheduler';
import { EmailModule } from '../email/email.module';
import { QueueName } from '../../common/queues/queue.config';
import { LoggerModule } from '../../common/services/logger.module';

/**
 * Digest Module
 * Handles weekly digest generation and delivery
 *
 * Features:
 * - Digest generation and templating
 * - Content aggregation by brewery
 * - Email delivery
 * - Digest history
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: QueueName.DIGEST }),
    EmailModule,
    LoggerModule,
  ],
  providers: [
    DigestService,
    TemplateService,
    DigestGeneratorService,
    DigestGenerationProcessor,
    DigestDeliveryProcessor,
    DigestScheduler,
  ],
  controllers: [DigestController],
  exports: [DigestService, TemplateService, DigestGeneratorService],
})
export class DigestModule {}
