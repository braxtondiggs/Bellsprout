import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../../../common/services/logger.service';
import OpenAI from 'openai';
import {
  ExtractedContentSchema,
  type ExtractedContent,
} from '../validators/extracted-data.schema';

export interface ExtractionInput {
  content: string;
  breweryName?: string;
  sourceType: 'EMAIL' | 'INSTAGRAM' | 'FACEBOOK' | 'RSS';
  metadata?: Record<string, any>;
}

export interface ExtractionResult {
  success: boolean;
  data?: ExtractedContent;
  error?: string;
  tokensUsed?: number;
}

@Injectable()
export class LLMExtractionService implements OnModuleInit, OnModuleDestroy {
  private openai!: OpenAI;
  private readonly model = 'gpt-4o-mini';

  constructor(
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext(LLMExtractionService.name);
  }

  onModuleInit() {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY not configured, LLM extraction disabled');
      return;
    }

    this.openai = new OpenAI({ apiKey });
    this.logger.log('OpenAI client initialized');
  }

  onModuleDestroy() {
    this.logger.log('LLM extraction service shutting down');
  }

  /**
   * Extract structured data from brewery content using GPT-4o-mini
   */
  async extractContent(input: ExtractionInput): Promise<ExtractionResult> {
    if (!this.openai) {
      return {
        success: false,
        error: 'OpenAI client not initialized',
      };
    }

    try {
      const prompt = this.buildPrompt(input);

      this.logger.debug('Calling OpenAI API for extraction', {
        model: this.model,
        sourceType: input.sourceType,
        contentLength: input.content.length,
      });

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt(),
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'extracted_content',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                contentType: {
                  type: 'string',
                  enum: ['release', 'event', 'update'],
                },
                confidence: {
                  type: 'number',
                  minimum: 0,
                  maximum: 1,
                },
                beerReleases: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      style: { type: 'string' },
                      abv: { type: 'number' },
                      ibu: { type: 'number' },
                      description: { type: 'string' },
                      releaseDate: { type: 'string' },
                      availability: {
                        type: 'string',
                        enum: ['draft', 'cans', 'bottles', 'limited', 'ongoing'],
                      },
                      price: { type: 'string' },
                    },
                    required: ['name'],
                    additionalProperties: false,
                  },
                },
                events: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      date: { type: 'string' },
                      time: { type: 'string' },
                      location: { type: 'string' },
                      description: { type: 'string' },
                      eventType: {
                        type: 'string',
                        enum: ['tasting', 'release', 'food-pairing', 'live-music', 'trivia', 'tour', 'festival', 'other'],
                      },
                      ticketUrl: { type: 'string' },
                      isFree: { type: 'boolean' },
                      rsvpRequired: { type: 'boolean' },
                    },
                    required: ['name', 'date'],
                    additionalProperties: false,
                  },
                },
                updates: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      title: { type: 'string' },
                      content: { type: 'string' },
                      category: {
                        type: 'string',
                        enum: ['hours', 'menu', 'announcement', 'tap-list', 'collaboration', 'awards', 'other'],
                      },
                      urls: {
                        type: 'array',
                        items: { type: 'string' },
                      },
                    },
                    required: ['title', 'content'],
                    additionalProperties: false,
                  },
                },
                summary: { type: 'string' },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                },
                callToAction: { type: 'string' },
              },
              required: ['contentType', 'confidence', 'summary'],
              additionalProperties: false,
            },
          },
        },
        temperature: 0.3, // Lower temperature for more consistent extraction
        max_tokens: 2000,
      });

      const usage = response.usage;
      this.logger.debug('OpenAI API response received', {
        tokensUsed: usage?.total_tokens,
        finishReason: response.choices[0]?.finish_reason,
      });

      const messageContent = response.choices[0]?.message?.content;

      if (!messageContent) {
        return {
          success: false,
          error: 'No content in OpenAI response',
          tokensUsed: usage?.total_tokens,
        };
      }

      // Parse the JSON response and validate with Zod
      let extractedData: ExtractedContent;
      try {
        const parsed = JSON.parse(messageContent);
        extractedData = ExtractedContentSchema.parse(parsed);
      } catch (parseError) {
        return {
          success: false,
          error: `Failed to parse/validate response: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
          tokensUsed: usage?.total_tokens,
        };
      }

      // Validate confidence threshold
      if (extractedData.confidence < 0.5) {
        this.logger.warn('Low confidence extraction', {
          confidence: extractedData.confidence,
          contentType: extractedData.contentType,
        });
      }

      return {
        success: true,
        data: extractedData,
        tokensUsed: usage?.total_tokens,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `LLM extraction failed: ${errorMessage} (sourceType: ${input.sourceType})`,
        error instanceof Error ? error.stack : undefined,
      );

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Build the extraction prompt from input
   */
  private buildPrompt(input: ExtractionInput): string {
    const parts: string[] = [];

    if (input.breweryName) {
      parts.push(`**Brewery:** ${input.breweryName}`);
    }

    parts.push(`**Source Type:** ${input.sourceType}`);

    if (input.metadata) {
      const relevantMetadata = this.formatMetadata(input.metadata);
      if (relevantMetadata) {
        parts.push(`**Metadata:**\n${relevantMetadata}`);
      }
    }

    parts.push('\n---\n');
    parts.push('**Content to Extract:**\n');
    parts.push(input.content);

    return parts.join('\n');
  }

  /**
   * System prompt that defines the extraction task
   */
  private getSystemPrompt(): string {
    return `You are an expert at extracting structured information from brewery communications.

Your task is to analyze content from breweries (emails, social posts, website updates) and extract:
1. **Beer Releases** - New beers being released, their styles, ABV, descriptions, availability
2. **Events** - Taproom events, tastings, food pairings, live music, festivals
3. **General Updates** - Hours changes, menu updates, tap lists, announcements, collaborations, awards

**Important Guidelines:**
- Extract ALL relevant information, even if it appears multiple times
- If a date is mentioned as relative (e.g., "this Saturday", "next week"), preserve it as-is
- Assign a confidence score (0-1) based on how clear and complete the information is
- Set contentType to the PRIMARY type of content (release/event/update)
- Include multiple items in arrays if multiple beers/events/updates are mentioned
- Extract URLs exactly as they appear
- For prices, include currency and exact wording (e.g., "$5 pints", "2 for $20")
- Identify event types accurately (tasting, release, food-pairing, live-music, trivia, tour, festival, other)
- For beer availability, use: draft, cans, bottles, limited, ongoing
- Provide a concise 2-3 sentence summary of the overall content
- Extract relevant tags/keywords for searchability
- Identify the main call to action if present

**Confidence Scoring:**
- 0.9-1.0: Clear, complete information with all key details
- 0.7-0.9: Most information present, minor details missing
- 0.5-0.7: Partial information, significant details missing
- 0.3-0.5: Vague or incomplete information
- 0.0-0.3: Very uncertain or speculative extraction

Be thorough and accurate. It's better to include too much information than to miss important details.`;
  }

  /**
   * Format metadata for inclusion in prompt
   */
  private formatMetadata(metadata: Record<string, any>): string {
    const lines: string[] = [];

    if (metadata.subject) {
      lines.push(`- Subject: ${metadata.subject}`);
    }

    if (metadata.from) {
      lines.push(`- From: ${metadata.from}`);
    }

    if (metadata.date) {
      lines.push(`- Date: ${metadata.date}`);
    }

    if (metadata.url) {
      lines.push(`- URL: ${metadata.url}`);
    }

    return lines.join('\n');
  }

  /**
   * Batch extract multiple content items
   */
  async extractBatch(
    inputs: ExtractionInput[],
  ): Promise<ExtractionResult[]> {
    this.logger.log(`Starting batch extraction for ${inputs.length} items`);

    const results = await Promise.all(
      inputs.map((input) => this.extractContent(input)),
    );

    const successful = results.filter((r) => r.success).length;
    const totalTokens = results.reduce((sum, r) => sum + (r.tokensUsed || 0), 0);

    this.logger.log('Batch extraction complete', {
      total: inputs.length,
      successful,
      failed: inputs.length - successful,
      totalTokens,
    });

    return results;
  }
}
