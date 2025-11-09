import { Controller, Post, Body, Headers, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { ResendInboundPayload } from './dto/resend-inbound.dto';
import { InboundEmailService } from './inbound-email.service';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('email')
@Controller('webhooks/email')
export class EmailController {
  constructor(
    private readonly inboundEmailService: InboundEmailService,
    private readonly configService: ConfigService,
  ) {}

  @Post('inbound')
  @Public()
  @ApiOperation({ summary: 'Receive inbound emails from Resend webhook' })
  @ApiResponse({ status: 200, description: 'Email received and queued for processing' })
  @ApiResponse({ status: 401, description: 'Invalid webhook signature' })
  async handleInboundEmail(
    @Body() payload: ResendInboundPayload,
    @Headers('x-resend-signature') signature?: string,
  ): Promise<{ success: boolean }> {
    // Verify webhook signature for security
    // TODO: Implement signature verification when Resend provides it
    // const webhookSecret = this.configService.get<string>('RESEND_WEBHOOK_SECRET');
    // if (!this.verifySignature(payload, signature, webhookSecret)) {
    //   throw new UnauthorizedException('Invalid webhook signature');
    // }

    await this.inboundEmailService.processInboundEmail(payload);

    return { success: true };
  }

  // TODO: Implement signature verification
  // private verifySignature(payload: any, signature: string, secret: string): boolean {
  //   // Implementation depends on Resend's webhook signature algorithm
  //   return true;
  // }
}
