import { Body, Controller, Get, Post, Res } from '@nestjs/common';

import { AppService } from './app.service';
import { EmailDto } from './dto/email.dto';

@Controller()
export class AppController {
  constructor(private readonly app: AppService) {}

  @Post('newsletter')
  async getNewsLetter(@Body() email: EmailDto) {
    return this.app.getNewsLetter(email);
  }

  @Get('health-check')
  async healthCheck() {
    return {
      status: 'ok',
      message: 'API is healthy',
    };
  }

  @Get()
  async getData() {
    return this.app.getData();
  }
}
