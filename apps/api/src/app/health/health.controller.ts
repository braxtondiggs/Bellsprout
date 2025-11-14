import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  PrismaHealthIndicator,
  MicroserviceHealthIndicator,
} from '@nestjs/terminus';
import { PrismaService } from '../../common/database/prisma.service';
import { createRedisConnection } from '../../common/queues/redis.config';
import { ConfigService } from '@nestjs/config';
import { RedisOptions, Transport } from '@nestjs/microservices';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly microservice: MicroserviceHealthIndicator,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  @Get()
  @HealthCheck()
  check() {
    const redisConfig = createRedisConnection(this.config);

    return this.health.check([
      () => this.prismaHealth.pingCheck('postgres', this.prisma),
      () =>
        this.microservice.pingCheck<RedisOptions>('redis', {
          transport: Transport.REDIS,
          options: redisConfig,
        }),
    ]);
  }
}
