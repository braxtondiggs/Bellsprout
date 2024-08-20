import { Injectable, Inject } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { runFlow } from '@genkit-ai/flow';

import { EmailDto } from './dto/email.dto';
import { defaultFlow } from './flow/default.flow';

@Injectable()
export class AppService {
  private db: Firestore;

  constructor(@Inject('FIREBASE_ADMIN') private readonly firebaseAdmin) {
    this.db = this.firebaseAdmin.firestore();
  }

  async getNewsLetter(email: EmailDto): Promise<any> {
    return await runFlow(defaultFlow, email.body);
  }

  async getData() {
    const userDoc = await this.db
      .collection('breweries')
      .doc('ChIJ-1YKW9wZBYgRhzxQFkxQGRY')
      .get();
    return userDoc.data();
  }
}
