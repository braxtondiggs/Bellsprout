import {
  Controller,
  Post,
  Body,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { ResendInboundPayload } from './dto/resend-inbound.dto';
import { InboundEmailService } from './inbound-email.service';
import { BounceHandlerService } from './bounce-handler.service';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('email')
@Controller('webhooks/email')
export class EmailController {
  constructor(
    private readonly inboundEmailService: InboundEmailService,
    private readonly bounceHandlerService: BounceHandlerService,
    private readonly configService: ConfigService
  ) {}

  @Post('inbound')
  @Public()
  @ApiOperation({ summary: 'Receive inbound emails from Resend webhook' })
  @ApiResponse({
    status: 200,
    description: 'Email received and queued for processing',
  })
  @ApiResponse({ status: 401, description: 'Invalid webhook signature' })
  async handleInboundEmail(
    @Body() payload: ResendInboundPayload,
    @Headers('svix-signature') signature?: string
  ): Promise<{ success: boolean }> {
    // Verify webhook signature for security
    const webhookSecret = this.configService.get<string>(
      'RESEND_WEBHOOK_SECRET'
    );
    if (webhookSecret && signature) {
      const isValid = this.verifyWebhookSignature(
        JSON.stringify(payload),
        signature,
        webhookSecret
      );
      if (!isValid) {
        throw new UnauthorizedException('Invalid webhook signature');
      }
    }

    await this.inboundEmailService.processInboundEmail(payload);

    return { success: true };
  }

  @Post('bounce')
  @Public()
  @ApiOperation({ summary: 'Receive email bounce events from Resend webhook' })
  @ApiResponse({ status: 200, description: 'Bounce event processed' })
  @ApiResponse({ status: 401, description: 'Invalid webhook signature' })
  async handleBounce(
    @Body() payload: any,
    @Headers('svix-signature') signature?: string
  ): Promise<{ success: boolean }> {
    // Verify webhook signature for security
    const webhookSecret = this.configService.get<string>(
      'RESEND_WEBHOOK_SECRET'
    );
    if (webhookSecret && signature) {
      const isValid = this.verifyWebhookSignature(
        JSON.stringify(payload),
        signature,
        webhookSecret
      );
      if (!isValid) {
        throw new UnauthorizedException('Invalid webhook signature');
      }
    }

    // Resend sends bounce events in this format:
    // { type: 'email.bounced', data: { email: '...', reason: '...', ... } }
    if (payload.type === 'email.bounced' && payload.data) {
      const bounceData = payload.data;
      await this.bounceHandlerService.handleBounce({
        email: bounceData.to || bounceData.email,
        bounceType: this.determineBounceType(bounceData),
        reason: bounceData.bounce_type || bounceData.reason,
        timestamp: new Date(bounceData.created_at || Date.now()),
      });
    }

    return { success: true };
  }

  /**
   * Verify Resend webhook signature using Svix signature format
   * Resend uses Svix for webhook signatures
   */
  private verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    // Resend/Svix signature verification
    // For production, use the 'svix' npm package for proper verification
    // For now, implement basic check
    // TODO: Install and use official svix package for production

    // Basic validation: just check if signature exists
    // In production, use: new Webhook(secret).verify(payload, headers)
    return !!(signature && signature.length > 0);
  }

  /**
   * Determine bounce type from Resend bounce data
   */
  private determineBounceType(bounceData: any): 'hard' | 'soft' {
    const bounceType = bounceData.bounce_type?.toLowerCase() || '';

    // Hard bounces: permanent failures
    if (
      bounceType.includes('hard') ||
      bounceType.includes('permanent') ||
      bounceType.includes('invalid')
    ) {
      return 'hard';
    }

    // Soft bounces: temporary failures
    return 'soft';
  }
}
