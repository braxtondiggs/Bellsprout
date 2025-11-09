import { ApiProperty } from '@nestjs/swagger';

export class BreweryResponseDto {
  @ApiProperty({ description: 'Unique brewery ID' })
  id!: string;

  @ApiProperty({ description: 'Brewery name' })
  name!: string;

  @ApiProperty({ description: 'City location' })
  city!: string;

  @ApiProperty({ description: 'State (2-letter code)' })
  state!: string;

  @ApiProperty({ description: 'Region (NYC or DMV)' })
  region!: string;

  @ApiProperty({ description: 'Website URL', required: false })
  website?: string;

  @ApiProperty({ description: 'Instagram handle', required: false })
  instagramHandle?: string;

  @ApiProperty({ description: 'Facebook handle', required: false })
  facebookHandle?: string;

  @ApiProperty({ description: 'RSS feed URL', required: false })
  rssFeedUrl?: string;

  @ApiProperty({ description: 'Logo URL', required: false })
  logoUrl?: string;

  @ApiProperty({ description: 'Whether user is subscribed', required: false })
  isSubscribed?: boolean;

  @ApiProperty({ description: 'Number of subscribers', required: false })
  subscriberCount?: number;

  @ApiProperty({ description: 'Timestamp when brewery was created' })
  createdAt!: Date;

  @ApiProperty({ description: 'Timestamp when brewery was last updated' })
  updatedAt!: Date;
}
