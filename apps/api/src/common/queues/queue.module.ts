import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createBullModuleOptions, registerQueues } from './queue.config';

@Module({
  imports: [
    createBullModuleOptions(new ConfigService()),
    registerQueues(),
  ],
  exports: [registerQueues()],
})
export class QueueModule {}
