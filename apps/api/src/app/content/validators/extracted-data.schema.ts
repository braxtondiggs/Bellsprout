import { z } from 'zod';

/**
 * Zod schemas for validating LLM-extracted data
 * These schemas ensure the AI returns structured, type-safe data
 */

// Beer release schema
export const BeerReleaseSchema = z.object({
  name: z.string().describe('The name of the beer'),
  style: z.string().optional().describe('Beer style (IPA, Stout, Lager, etc.)'),
  abv: z.number().optional().describe('Alcohol by volume percentage'),
  ibu: z.number().optional().describe('International Bitterness Units'),
  description: z.string().optional().describe('Description of the beer'),
  releaseDate: z.string().optional().describe('When the beer is being released (ISO date or natural language)'),
  availability: z.enum(['draft', 'cans', 'bottles', 'limited', 'ongoing']).optional().describe('How the beer is available'),
  price: z.string().optional().describe('Price information if mentioned'),
});

// Event schema
export const EventSchema = z.object({
  name: z.string().describe('Event name or title'),
  date: z.string().describe('Event date (ISO date or natural language like "this Saturday")'),
  time: z.string().optional().describe('Event time'),
  location: z.string().optional().describe('Event location (taproom, specific address, etc.)'),
  description: z.string().optional().describe('Event description'),
  eventType: z.enum(['tasting', 'release', 'food-pairing', 'live-music', 'trivia', 'tour', 'festival', 'other']).optional(),
  ticketUrl: z.string().optional().describe('URL to purchase tickets'),
  isFree: z.boolean().optional().describe('Whether the event is free'),
  rsvpRequired: z.boolean().optional().describe('Whether RSVP is required'),
});

// General update schema
export const UpdateSchema = z.object({
  title: z.string().describe('Title or summary of the update'),
  content: z.string().describe('Main content of the update'),
  category: z.enum(['hours', 'menu', 'announcement', 'tap-list', 'collaboration', 'awards', 'other']).optional(),
  urls: z.array(z.string()).optional().describe('Any URLs mentioned in the update'),
});

// Main extraction result schema
export const ExtractedContentSchema = z.object({
  contentType: z.enum(['release', 'event', 'update']).describe('Primary type of this content'),

  // Confidence score (0-1)
  confidence: z.number().min(0).max(1).describe('Confidence in the extraction (0-1)'),

  // Beer releases (can be multiple in one email)
  beerReleases: z.array(BeerReleaseSchema).optional().describe('List of beer releases mentioned'),

  // Events (can be multiple)
  events: z.array(EventSchema).optional().describe('List of events mentioned'),

  // General updates (can be multiple)
  updates: z.array(UpdateSchema).optional().describe('List of general updates'),

  // Summary of the content
  summary: z.string().describe('Brief summary of the entire content (2-3 sentences)'),

  // Keywords/tags
  tags: z.array(z.string()).optional().describe('Relevant tags or keywords'),

  // Call to action
  callToAction: z.string().optional().describe('Main call to action if present (visit taproom, order online, etc.)'),
});

// Type exports
export type BeerRelease = z.infer<typeof BeerReleaseSchema>;
export type Event = z.infer<typeof EventSchema>;
export type Update = z.infer<typeof UpdateSchema>;
export type ExtractedContent = z.infer<typeof ExtractedContentSchema>;
