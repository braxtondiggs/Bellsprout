import { Module } from '@nestjs/common';
import { BreweriesController } from './breweries.controller';
import { BreweriesService } from './breweries.service';
import { UserBrewerySubscriptionService } from './user-brewery-subscription.service';

@Module({
  controllers: [BreweriesController],
  providers: [BreweriesService, UserBrewerySubscriptionService],
  exports: [BreweriesService, UserBrewerySubscriptionService],
})
export class BreweriesModule {}
