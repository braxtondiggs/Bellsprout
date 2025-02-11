import { Injectable } from '@nestjs/common';
import { genkit, Genkit, z } from 'genkit';
import openAI, { gpt4oMini } from 'genkitx-openai';
import { logger } from 'genkit/logging';

import type { NewsletterResponse } from './newsletter.types';

@Injectable()
export class NewsletterGenkitService {
  private ai: Genkit;

  constructor() {
    logger.setLogLevel('debug');
    this.ai = genkit({
      plugins: [openAI({ apiKey: process.env.OPENAI_API_KEY })],
      model: gpt4oMini
    });
  }

  async getNewsletterFlow() {
    return this.ai.defineFlow<any>(this.NEWSLETTER_CONFIG, async (content: string) => {
      const { output } = await this.ai.generate({
        prompt: this.NEWSLETTER_PROMPT(content),
        output: { schema: this.NEWSLETTER_CONFIG.outputSchema }
      });
      console.log('response', JSON.stringify(output));
      return output;
    });
  }
  /**
   * Generates a structured prompt for extracting information from brewery newsletters
   */
  private NEWSLETTER_PROMPT = (
    content: string
  ): string => `Extract and structure the following information from the brewery newsletter.

REQUIRED (must be included):
- Brewery name (this field is mandatory)

Additional information to extract:
- Events (including dates, names, locations, descriptions, entertainment, and special offers)
- New beer releases with full descriptions
- Operating hours (both regular and holiday schedules)
- General brewery news and announcements
- Location details and contact information

Format requirements:
- Response must be valid JSON
- Brewery name must always be provided as 'breweryName'
- Dates should be in ISO 8601 format (YYYY-MM-DD)
- Beer ABV should be a number (remove % symbol)
- Convert time ranges to 24-hour format
- For missing information, omit the field rather than using null or empty strings

Newsletter content:
${content}

Remember: The brewery name is mandatory and must be included in the response as 'breweryName'.`;

  /**
   * Zod schema configuration for newsletter data extraction
   */
  private NEWSLETTER_CONFIG = {
    name: 'NewsletterFlow',
    inputSchema: z.string(),
    outputSchema: z.object({
      breweryName: z.string().min(1),
      events: z
        .array(
          z.object({
            date: z.string(),
            eventName: z.string().min(1),
            location: z.string().optional(),
            description: z.string().min(1),
            liveMusic: z.boolean().optional(),
            foodTrucks: z.array(z.string()).optional(),
            happyHours: z.string().optional()
          })
        )
        .optional(),
      newReleases: z
        .array(
          z.object({
            beerName: z.string().min(1),
            description: z.string().min(1),
            abv: z.number().min(0).max(100).optional(),
            style: z.string().optional()
          })
        )
        .optional(),
      tastingNotes: z
        .array(
          z.object({
            beerName: z.string().min(1),
            notes: z.string().min(1)
          })
        )
        .optional(),
      contactInfo: z
        .object({
          address: z.string().optional(),
          phone: z.string().optional(),
          email: z.string().email().optional(),
          website: z.string().url().optional()
        })
        .optional(),
      hoursOfOperation: z
        .object({
          regularHours: z.record(z.string()).optional(),
          holidayHours: z
            .array(
              z.object({
                date: z.coerce.date(),
                hours: z.string()
              })
            )
            .optional()
        })
        .optional(),
      breweryNews: z.array(z.string()).optional()
    }) as z.ZodType<NewsletterResponse>
  };
}
