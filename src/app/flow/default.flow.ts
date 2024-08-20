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

function toCamelCase(str) {
  return str
    .replace(/_([a-z])/g, (match, letter) => letter.toUpperCase())
    .replace(/(^\w|_\w)/g, (match) => match.replace(/_/g, '').toLowerCase());
}

function normalizeKeys(obj) {
  if (Array.isArray(obj)) {
    return obj.map(normalizeKeys);
  } else if (obj !== null && obj.constructor === Object) {
    return Object.keys(obj).reduce((acc, key) => {
      acc[toCamelCase(key)] = normalizeKeys(obj[key]);
      return acc;
    }, {});
  }
  return obj;
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
            date: z.date(),
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
      2. Event Details: date, event name, event location, description, live music, food trucks or vendors, happy hours or special pricing
      3. New Beer Releases: beer name tasting notes and description
      4. Hours of Operation: regular hours and upcoming holiday hours
      5. Brewery News: any other relevant information
      6. Featured Locations: address, description, and other relevant information 

      Provide the information in JSON format.

      Newsletter content:
      ${subject}`;

      const llmResponse = await generate({
        model: gpt4o,
        prompt: prompt,
      });

      const response = llmResponse.toJSON();

      const content = response.candidates[0].message.content[0].text;
      console.log('Response Content:', content);

      const json = extractJSON(content);
      console.log('Extracted JSON:', json);

      const normalizedJson = normalizeKeys(json);
      console.log('Normalized JSON:', normalizedJson);
      return normalizedJson;
    } catch (error) {
      console.error('Error extracting newsletter information:', error);
      throw new Error('Failed to extract information from the newsletter.');
    }
  }
);
