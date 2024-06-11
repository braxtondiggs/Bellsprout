import { Module, Global } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { ConfigModule, ConfigService } from '@nestjs/config';
import firebaseConfig from './firebase.config';

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
      },
      inject: [ConfigService],
    },
  ],
  exports: ['FIREBASE_ADMIN'],
})
export class FirebaseModule {}
