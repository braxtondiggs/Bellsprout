import { Injectable, Inject } from '@nestjs/common';
import { app } from 'firebase-admin';

@Injectable()
export class FirebaseService {
  constructor(
    @Inject('FIREBASE_ADMIN')
    private readonly firebaseApp: app.App
  ) {}

  getAuth() {
    return this.firebaseApp.auth();
  }

  getFirestore() {
    return this.firebaseApp.firestore();
  }

  getStorage() {
    return this.firebaseApp.storage();
  }
}
