import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { QueueName } from '../queues/queue.config';

@Injectable()
export class BullBoardService implements OnModuleInit {
  private serverAdapter: ExpressAdapter;

  constructor(
    @InjectQueue(QueueName.COLLECT) private collectQueue: Queue,
    @InjectQueue(QueueName.EXTRACT) private extractQueue: Queue,
    @InjectQueue(QueueName.DEDUPLICATE) private deduplicateQueue: Queue,
    @InjectQueue(QueueName.DIGEST) private digestQueue: Queue
  ) {
    this.serverAdapter = new ExpressAdapter();
    this.serverAdapter.setBasePath('/api/queues');
  }

  onModuleInit() {
    createBullBoard({
      queues: [
        new BullMQAdapter(this.collectQueue),
        new BullMQAdapter(this.extractQueue),
        new BullMQAdapter(this.deduplicateQueue),
        new BullMQAdapter(this.digestQueue),
      ],
      serverAdapter: this.serverAdapter,
    });
  }

  getRouter() {
    return this.serverAdapter.getRouter();
  }
}
