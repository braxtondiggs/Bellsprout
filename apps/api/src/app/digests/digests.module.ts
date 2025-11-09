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
    // Register digest queue
    BullModule.registerQueue({ name: QueueName.DIGEST }),
    // Import EmailModule for sending
    EmailModule,
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
