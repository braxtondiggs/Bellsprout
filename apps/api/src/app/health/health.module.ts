import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { DatabaseModule } from '../../common/database/database.module';
import { ConfigModule } from '../../common/config/config.module';

@Module({
  imports: [TerminusModule, DatabaseModule, ConfigModule],
  controllers: [HealthController],
})
export class HealthModule {}
