import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { SubscriptionStatus } from '@prisma/client';

export class UpdateSubscriptionDto {
  @ApiProperty({
    description: 'New subscription status',
    enum: ['active', 'paused', 'cancelled'],
  })
  @IsEnum(SubscriptionStatus)
  status!: SubscriptionStatus;
}
