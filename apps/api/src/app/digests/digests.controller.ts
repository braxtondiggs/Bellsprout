import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { DigestService } from './digests.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/**
 * Digest Controller
 * Handles user-facing digest endpoints
 */
@Controller('users/me/digests')
@UseGuards(JwtAuthGuard)
export class DigestController {
  constructor(private readonly digestService: DigestService) {}

  /**
   * Get user's past digests
   * GET /api/users/me/digests
   */
  @Get()
  async getUserDigests(
    @Request() req: any,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ) {
    const userId = req.user.userId;
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    const parsedOffset = offset ? parseInt(offset, 10) : 0;

    return await this.digestService.getUserDigests(
      userId,
      parsedLimit,
      parsedOffset
    );
  }

  /**
   * Get specific digest by ID
   * GET /api/users/me/digests/:id
   */
  @Get(':id')
  async getDigest(@Request() req: any, @Param('id') id: string) {
    const userId = req.user.userId;
    const digest = await this.digestService.findOne(id);

    // Verify digest belongs to user
    if (!digest || digest.userId !== userId) {
      throw new Error('Digest not found');
    }

    return digest;
  }
}
