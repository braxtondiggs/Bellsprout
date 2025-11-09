import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({ description: 'User ID' })
  id!: string;

  @ApiProperty({ description: 'User email' })
  email!: string;

  @ApiProperty({ description: 'First name' })
  firstName!: string | null;

  @ApiProperty({ description: 'Last name', required: false })
  lastName!: string | null;

  @ApiProperty({ description: 'Whether email is verified' })
  emailVerified!: boolean;

  @ApiProperty({
    description: 'Subscription status',
    enum: ['ACTIVE', 'PAUSED', 'CANCELLED'],
  })
  subscriptionStatus!: string;

  @ApiProperty({ description: 'Digest delivery day (0=Sunday, 6=Saturday)' })
  digestDeliveryDay!: number;

  @ApiProperty({ description: 'Digest format preference' })
  digestFormat!: string;

  @ApiProperty({ description: 'Content type preferences', type: [String] })
  contentTypePreferences!: string[];

  @ApiProperty({ description: 'Account created date' })
  createdAt!: Date;
}
