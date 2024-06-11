import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { configureGenkit } from '@genkit-ai/core';
import { startFlowsServer } from '@genkit-ai/flow';
import { openAI } from 'genkitx-openai';

import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`
  );
  configureGenkit({
    plugins: [openAI({ apiKey: process.env.OPENAI_API_KEY })],
    logLevel: 'debug',
    enableTracingAndMetrics: true,
  });

  startFlowsServer({
    port: Number(process.env.AI_PORT) || 4000,
  });
}

bootstrap();
