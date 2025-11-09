import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { createRedisConnection } from './redis.config';

/**
 * Queue names for the application
 */
export enum QueueName {
  COLLECT = 'collect',
  EXTRACT = 'extract',
  DEDUPLICATE = 'deduplicate',
  DIGEST = 'digest',
}

/**
 * Queue configuration options
 */
export interface QueueConfig {
  name: QueueName;
  defaultJobOptions?: {
    attempts?: number;
    backoff?: {
      type: 'exponential' | 'fixed';
      delay: number;
    };
    removeOnComplete?: boolean | number;
    removeOnFail?: boolean | number;
  };
  limiter?: {
    max: number;
    duration: number;
  };
}

/**
 * Default queue configurations
 */
export const QUEUE_CONFIGS: QueueConfig[] = [
  {
    name: QueueName.COLLECT,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: 100, // Keep last 100 completed jobs
      removeOnFail: false, // Keep all failed jobs
    },
    limiter: {
      max: 50, // Max 50 jobs
      duration: 60000, // Per minute
    },
  },
  {
    name: QueueName.EXTRACT,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: 100,
      removeOnFail: false,
    },
    limiter: {
      max: 10, // Max 10 concurrent LLM requests
      duration: 1000, // Per second
    },
  },
  {
    name: QueueName.DEDUPLICATE,
    defaultJobOptions: {
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: 100,
      removeOnFail: false,
    },
    limiter: {
      max: 30,
      duration: 1000,
    },
  },
  {
    name: QueueName.DIGEST,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 10000,
      },
      removeOnComplete: 1000, // Keep more completed digest jobs
      removeOnFail: false,
    },
    limiter: {
      max: 20, // Max 20 digests
      duration: 60000, // Per minute
    },
  },
];

/**
 * Create BullMQ module configuration
 */
export const createBullModuleOptions = (configService: ConfigService) => {
  const redisConnection = createRedisConnection(configService);

  return BullModule.forRoot({
    connection: redisConnection,
  });
};

/**
 * Register all queues
 */
export const registerQueues = () => {
  return BullModule.registerQueue(
    ...QUEUE_CONFIGS.map((config) => ({
      name: config.name,
      defaultJobOptions: config.defaultJobOptions,
      limiter: config.limiter,
    }))
  );
};
