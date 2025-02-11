import { Module, OnModuleInit } from '@nestjs/common';

import { EmailController } from './email.controller';
import { EmailService } from './email.service';
import { NewsletterGenkitService } from './genkit/newsletter.service';

@Module({
  controllers: [EmailController],
  providers: [EmailService, NewsletterGenkitService]
})
export class EmailModule implements OnModuleInit {
  constructor(private emailService: EmailService) {}

  onModuleInit() {
    this.emailService.connect();
  }
}
