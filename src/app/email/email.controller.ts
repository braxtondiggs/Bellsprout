import { Controller, Get, Logger, Response } from '@nestjs/common';

import { NewsletterGenkitService } from './genkit/newsletter.service';

@Controller('email')
export class EmailController {
  private readonly logger = new Logger(EmailController.name);
  constructor(private readonly newsletter: NewsletterGenkitService) {}

  @Get('test')
  async getTestEmail(@Response() res) {
    // const result = await this.newsletter.getNewsletter(email);
  }
}
