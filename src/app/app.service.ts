import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { GenkitService } from './services/genkit.service';

import { EmailDto } from './dto/email.dto';
import { Brewery } from './interfaces/brewery.interface';

@Injectable()
export class AppService {
  private db: Firestore;

  constructor(
    @Inject('FIREBASE_ADMIN') private readonly firebaseAdmin,
    private readonly genkitService: GenkitService
  ) {
    this.db = this.firebaseAdmin.firestore();
  }

  async getNewsletter(email: EmailDto): Promise<any> {
    try {
      const newsletterFlow = await this.genkitService.getNewsletterFlow();
      const response = await newsletterFlow(email.body);
      console.log('response2', JSON.stringify(response));
      return response;
    } catch (error) {
      throw new BadRequestException(
        `Failed to process newsletter: ${error.message}`
      );
    }
  }

  async getData(): Promise<Brewery> {
    try {
      const userDoc = await this.db
        .collection('breweries')
        .doc('ChIJ-1YKW9wZBYgRhzxQFkxQGRY')
        .get();

      if (!userDoc.exists) {
        throw new NotFoundException('Brewery not found');
      }

      return userDoc.data() as Brewery;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Failed to fetch brewery data: ${error.message}`);
    }
  }
}
