import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';

import { Brewery } from './interfaces/brewery.interface';

@Injectable()
export class AppService {
  private db: Firestore;

  constructor(@Inject('FIREBASE_ADMIN') private readonly firebaseAdmin) {
    this.db = this.firebaseAdmin.firestore();
  }

  async getData(): Promise<Brewery> {
    try {
      const userDoc = await this.db.collection('breweries').doc('ChIJ-1YKW9wZBYgRhzxQFkxQGRY').get();

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
