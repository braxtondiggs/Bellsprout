import { ConfigService } from '@nestjs/config';
import { Redis, RedisOptions } from 'ioredis';
import { Logger } from '@nestjs/common';

const logger = new Logger('RedisConfig');

/**
 * Create Redis connection for BullMQ
 */
export const createRedisConnection = (
  configService: ConfigService
): RedisOptions => {
  const password = configService.get('REDIS_PASSWORD');
  const host = configService.get('REDIS_HOST', 'localhost');
  const port = configService.get('REDIS_PORT', 6379);
  const db = configService.get('REDIS_DB', 0);

  logger.log(
    `Redis config - host: ${host}, port: ${port}, db: ${db}, ` +
      `password: ${password ? '[SET]' : '[NOT SET]'} (length: ${
        password?.length || 0
      })`
  );

  const redisConfig: RedisOptions = {
    host,
    port,
    // Only include password if it's set
    ...(password && password.length > 0 && { password }),
    db,
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false, // Required for BullMQ
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      logger.warn(`Redis connection retry attempt ${times}, delay: ${delay}ms`);
      return delay;
    },
  };

  logger.log(
    `Redis connection options - hasPassword: ${!!redisConfig.password}, ` +
      `password in config: ${redisConfig.password ? 'YES' : 'NO'}`
  );

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
