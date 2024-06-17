import { defineFlow } from '@genkit-ai/flow';
import { openAI, gpt4o } from 'genkitx-openai';
import { generate } from '@genkit-ai/ai';
import * as z from 'zod';

function extractJSON(content) {
  const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
  if (jsonMatch && jsonMatch[1]) {
    return JSON.parse(jsonMatch[1]);
  }
  throw new Error('Invalid JSON content');
}

export const defaultFlow = defineFlow(
  {
    name: 'newsletterFlow',
    inputSchema: z.string(),
    outputSchema: z.object({
      breweryName: z.string().optional(),
      events: z
        .array(
          z.object({
            date: z.string(),
            eventName: z.string(),
            description: z.string(),
            liveMusic: z.boolean().optional(),
            foodTrucks: z.string().optional(),
            happyHours: z.string().optional(),
          })
        )
        .optional(),
      newReleases: z
        .array(
          z.object({
            beerName: z.string(),
            description: z.string(),
          })
        )
        .optional(),
      tastingNotes: z
        .array(
          z.object({
            beerName: z.string(),
            notes: z.string(),
          })
        )
        .optional(),
      contactInfo: z
        .object({
          address: z.string().optional(),
          phone: z.string().optional(),
          email: z.string().optional(),
        })
        .optional(),
      hoursOfOperation: z
        .object({
          regularHours: z.string().optional(),
          holidayHours: z.string().optional(),
        })
        .optional(),
    }),
  },
  async (subject: string): Promise<any> => {
    try {
      const prompt = `Extract the following information from the brewery newsletter: 
      1. Brewery Name
      2. Event Details: date, event name, description, live music, food trucks or vendors, happy hours or special pricing
      3. New Beer Releases: beer name and description
      4. Tasting Notes: beer name and notes
      5. Contact Information: address, phone, and email
      6. Hours of Operation: regular hours and upcoming holiday hours

      Provide the information in JSON format.

      Newsletter content:
      ${subject}`;

      const llmResponse = await generate({
        model: gpt4o,
        prompt: prompt,
      });

      const response = llmResponse.toJSON();
      const json = JSON.parse(
        extractJSON(response.candidates[0].message.content[0].text)
      );

      const result = z
        .object({
          breweryName: z.string().optional(),
          events: z
            .array(
              z.object({
                date: z.string(),
                eventName: z.string(),
                description: z.string(),
                liveMusic: z.boolean().optional(),
                foodTrucks: z.string().optional(),
                happyHours: z.string().optional(),
              })
            )
            .optional(),
          newReleases: z
            .array(
              z.object({
                beerName: z.string(),
                description: z.string(),
              })
            )
            .optional(),
          tastingNotes: z
            .array(
              z.object({
                beerName: z.string(),
                notes: z.string(),
              })
            )
            .optional(),
          contactInfo: z
            .object({
              address: z.string().optional(),
              phone: z.string().optional(),
              email: z.string().optional(),
            })
            .optional(),
          hoursOfOperation: z
            .object({
              regularHours: z.string().optional(),
              holidayHours: z.string().optional(),
            })
            .optional(),
        })
        .safeParse(json);
      return result;
    } catch (error) {
      console.error('Error extracting newsletter information:', error);
      throw new Error('Failed to extract information from the newsletter.');
    }
  }
);
