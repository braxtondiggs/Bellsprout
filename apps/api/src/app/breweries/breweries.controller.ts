import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { BreweriesService } from './breweries.service';
import { BreweryFilterDto } from './dto/brewery-filter.dto';
import { BreweryResponseDto } from './dto/brewery-response.dto';
import { PaginatedBreweryResponseDto } from './dto/paginated-brewery-response.dto';

@ApiTags('breweries')
@Controller('breweries')
export class BreweriesController {
  constructor(private readonly breweriesService: BreweriesService) {}

  @Get()
  @ApiOperation({ summary: 'List all breweries with optional filtering and pagination' })
  @ApiResponse({
    status: 200,
    description: 'List of breweries returned successfully',
    type: PaginatedBreweryResponseDto,
  })
  async findAll(
    @Query() filter: BreweryFilterDto,
    @Request() req?: any,
  ): Promise<PaginatedBreweryResponseDto> {
    const userId = req?.user?.id;
    return this.breweriesService.findAll(filter, userId);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search breweries by name, location, or region' })
  @ApiQuery({ name: 'q', required: true, description: 'Search query' })
  @ApiResponse({
    status: 200,
    description: 'Search results returned successfully',
    type: [BreweryResponseDto],
  })
  async search(
    @Query('q') query: string,
    @Request() req?: any,
  ): Promise<BreweryResponseDto[]> {
    const userId = req?.user?.id;
    return this.breweriesService.search(query, userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get brewery details by ID' })
  @ApiResponse({
    status: 200,
    description: 'Brewery details returned successfully',
    type: BreweryResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Brewery not found',
  })
  async findOne(
    @Param('id') id: string,
    @Request() req?: any,
  ): Promise<BreweryResponseDto> {
    const userId = req?.user?.id;
    return this.breweriesService.findOne(id, userId);
  }
}
