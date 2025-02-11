import { Controller, Get, Logger } from '@nestjs/common';

import { AppService } from './app.service';

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);
  constructor(private readonly app: AppService) {}

  @Get('health-check')
  async healthCheck() {
    return {
      status: 'ok',
      message: 'API is healthy',
      timestamp: new Date().toISOString()
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
