import { Module, Global } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { ConfigModule, ConfigService } from '@nestjs/config';
import firebaseConfig from './firebase.config';
import { FirebaseService } from './firebase.service';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      load: [firebaseConfig],
    }),
  ],
  providers: [
    {
      provide: 'FIREBASE_ADMIN',
      useFactory: (configService: ConfigService) => {
        try {
          const adminConfig = {
            credential: admin.credential.cert({
              projectId: configService.get<string>('firebase.project_id'),
              clientEmail: configService.get<string>('firebase.client_email'),
              privateKey: configService.get<string>('firebase.private_key'),
            }),
            databaseURL: `https://${configService.get<string>(
              'firebase.project_id'
            )}.firebaseio.com`,
          };
          return admin.initializeApp(adminConfig);
        } catch (error) {
          throw new Error(`Failed to initialize Firebase: ${error.message}`);
        }
      },
      inject: [ConfigService],
    },
    FirebaseService,
  ],
  exports: ['FIREBASE_ADMIN', FirebaseService],
})
export class FirebaseModule {}
