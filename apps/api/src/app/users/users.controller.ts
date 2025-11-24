import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangeEmailDto } from './dto/change-email.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { UserResponseDto } from './dto/user-response.dto';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully',
    type: UserResponseDto,
  })
  async getCurrentUser(@Request() req: any): Promise<UserResponseDto> {
    return this.usersService.getUserProfile(req.user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({
    status: 200,
    description: 'Profile updated successfully',
    type: UserResponseDto,
  })
  async updateProfile(
    @Request() req: any,
    @Body() updateUserDto: UpdateUserDto
  ): Promise<UserResponseDto> {
    return this.usersService.updateProfile(req.user.id, updateUserDto);
  }

  @Patch('me/email')
  @ApiOperation({ summary: 'Change email address' })
  @ApiResponse({
    status: 200,
    description: 'Email change initiated, verification email sent',
  })
  async changeEmail(
    @Request() req: any,
    @Body() changeEmailDto: ChangeEmailDto
  ): Promise<{ message: string }> {
    return this.usersService.changeEmail(req.user.id, changeEmailDto.newEmail);
  }

  @Patch('me/subscription')
  @ApiOperation({ summary: 'Update subscription status' })
  @ApiResponse({
    status: 200,
    description: 'Subscription status updated',
    type: UserResponseDto,
  })
  async updateSubscription(
    @Request() req: any,
    @Body() updateSubscriptionDto: UpdateSubscriptionDto
  ): Promise<UserResponseDto> {
    return this.usersService.updateSubscriptionStatus(
      req.user.id,
      updateSubscriptionDto.status
    );
  }

  @Post('me/breweries/:breweryId')
  @ApiOperation({ summary: 'Subscribe to a brewery' })
  @ApiResponse({
    status: 201,
    description: 'Successfully subscribed to brewery',
  })
  async subscribeToBrewery(
    @Request() req: any,
    @Param('breweryId') breweryId: string
  ): Promise<{ message: string }> {
    return this.usersService.subscribeToBrewery(req.user.id, breweryId);
  }

  @Delete('me/breweries/:breweryId')
  @ApiOperation({ summary: 'Unsubscribe from a brewery' })
  @ApiResponse({
    status: 200,
    description: 'Successfully unsubscribed from brewery',
  })
  async unsubscribeFromBrewery(
    @Request() req: any,
    @Param('breweryId') breweryId: string
  ): Promise<{ message: string }> {
    return this.usersService.unsubscribeFromBrewery(req.user.id, breweryId);
  }

  @Get('me/breweries')
  @ApiOperation({ summary: 'Get user brewery subscriptions' })
  @ApiResponse({
    status: 200,
    description: 'List of subscribed breweries',
  })
  async getUserBreweries(@Request() req: any) {
    return this.usersService.getUserBreweries(req.user.id);
  }
}
