import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { LoggerService } from '../services/logger.service';

@Global()
@Module({
  providers: [PrismaService, LoggerService],
  exports: [PrismaService],
})
export class DatabaseModule {}
