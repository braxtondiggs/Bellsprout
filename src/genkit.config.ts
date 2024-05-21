import { configureGenkit } from '@genkit-ai/core';
import { startFlowsServer } from '@genkit-ai/flow';
import { openAI } from 'genkitx-openai';

configureGenkit({
  plugins: [openAI({ apiKey: process.env.OPENAI_API_KEY })],
  logLevel: 'debug',
  enableTracingAndMetrics: true,
});

startFlowsServer();
