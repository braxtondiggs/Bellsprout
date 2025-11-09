import { ConfigService } from '@nestjs/config';
import { Redis, RedisOptions } from 'ioredis';
import { Logger } from '@nestjs/common';

const logger = new Logger('RedisConfig');

/**
 * Create Redis connection for BullMQ
 */
export const createRedisConnection = (configService: ConfigService): RedisOptions => {
  const redisConfig: RedisOptions = {
    host: configService.get('REDIS_HOST', 'localhost'),
    port: configService.get('REDIS_PORT', 6379),
    password: configService.get('REDIS_PASSWORD'),
    db: configService.get('REDIS_DB', 0),
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false, // Required for BullMQ
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      logger.warn(`Redis connection retry attempt ${times}, delay: ${delay}ms`);
      return delay;
    },
  };

  return redisConfig;
};

/**
 * Create Redis client instance
 */
export const createRedisClient = (configService: ConfigService): Redis => {
  const config = createRedisConnection(configService);
  const client = new Redis(config);

  client.on('connect', () => {
    logger.log('Redis client connected');
  });

  client.on('ready', () => {
    logger.log('Redis client ready');
  });

  client.on('error', (error) => {
    logger.error('Redis client error', error);
  });

  client.on('close', () => {
    logger.warn('Redis client connection closed');
  });

  client.on('reconnecting', () => {
    logger.warn('Redis client reconnecting');
  });

  return client;
};
