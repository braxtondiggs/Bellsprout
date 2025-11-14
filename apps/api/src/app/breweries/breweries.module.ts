import { Module } from '@nestjs/common';
import { BreweriesController } from './breweries.controller';
import { BreweriesService } from './breweries.service';
import { UserBrewerySubscriptionService } from './user-brewery-subscription.service';
import { LoggerModule } from '../../common/services/logger.module';

@Module({
  imports: [LoggerModule],
  controllers: [BreweriesController],
  providers: [BreweriesService, UserBrewerySubscriptionService],
  exports: [BreweriesService, UserBrewerySubscriptionService],
})
export class BreweriesModule {}
