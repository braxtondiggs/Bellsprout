import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Logger,
  Post,
  Response,
} from '@nestjs/common';

import { AppService } from './app.service';
import { EmailDto } from './dto/email.dto';

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);
  constructor(private readonly app: AppService) {}

  @Post('newsletter')
  async getNewsLetter(@Body() email: EmailDto, @Response() res) {
    try {
      const result = await this.app.getNewsletter(email);
      this.logger.log(`Newsletter subscription processed for ${email.body}`);
      return res.status(HttpStatus.OK).json(result);
    } catch (error) {
      this.logger.error(`Newsletter subscription failed: ${error.message}`);
      return res.status(HttpStatus.BAD_REQUEST).json({
        error: error.message,
      });
    }
  }

  @Get('health-check')
  async healthCheck() {
    return {
      status: 'ok',
      message: 'API is healthy',
      timestamp: new Date().toISOString(),
    };
  }

  @Get()
  async getData() {
    try {
      return await this.app.getData();
    } catch (error) {
      this.logger.error(`Failed to get data: ${error.message}`);
      throw error;
    }
  }
}
