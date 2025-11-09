import { ApiProperty } from '@nestjs/swagger';
import { BreweryResponseDto } from './brewery-response.dto';

export class PaginatedBreweryResponseDto {
  @ApiProperty({ type: [BreweryResponseDto], description: 'List of breweries' })
  data!: BreweryResponseDto[];

  @ApiProperty({ description: 'Current page number' })
  page!: number;

  @ApiProperty({ description: 'Items per page' })
  limit!: number;

  @ApiProperty({ description: 'Total number of breweries' })
  total!: number;

  @ApiProperty({ description: 'Total number of pages' })
  totalPages!: number;

  @ApiProperty({ description: 'Whether there is a next page' })
  hasNextPage!: boolean;

  @ApiProperty({ description: 'Whether there is a previous page' })
  hasPreviousPage!: boolean;
}
