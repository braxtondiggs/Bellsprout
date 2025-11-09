import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueueName } from '../queues/queue.config';
import { BullBoardService } from './bull-board.service';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QueueName.COLLECT },
      { name: QueueName.EXTRACT },
      { name: QueueName.DEDUPLICATE },
      { name: QueueName.DIGEST }
    ),
  ],
  providers: [BullBoardService],
  exports: [BullBoardService],
})
export class BullBoardModule {}
