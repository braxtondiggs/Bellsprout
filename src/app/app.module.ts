import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FirebaseModule } from './firebase/firebase.module';
import { GenkitService } from './services/genkit.service';

@Module({
  imports: [ConfigModule.forRoot(), FirebaseModule],
  controllers: [AppController],
  providers: [AppService, GenkitService],
})
export class AppModule {}
