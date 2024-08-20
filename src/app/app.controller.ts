import { Body, Controller, Get, Post, Res } from '@nestjs/common';

import { AppService } from './app.service';
import { EmailDto } from './dto/email.dto';

@Controller()
export class AppController {
  constructor(private readonly app: AppService) {}

  @Post('newsletter')
  async getNewsLetter(@Body() email: EmailDto) {
    const res = await this.app.getNewsLetter(email);
    console.log('res');
    console.log(res);
    return res;
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
