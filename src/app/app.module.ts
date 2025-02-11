import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FirebaseModule } from './firebase/firebase.module';
import { EmailModule } from './email/email.module';

const isProduction = process.env.NODE_ENV === 'production';
@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        transport: {
          target: 'pino-pretty',
          options: {
            singleLine: true
          }
        }
      }
    }),
    ConfigModule,
    EmailModule,
    FirebaseModule,
    HttpModule
  ],
  exports: [ConfigModule, HttpModule],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {}
