import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../../common/services/logger.service';
import { PrismaService } from '../../../common/database/prisma.service';
import { TfIdf, WordTokenizer } from 'natural';
import { removeStopwords } from 'stopword';

export interface MinHashSignature {
  hash: number[];
  shingleCount: number;
}

export interface SimilarityResult {
  contentItemId: string;
  similarity: number;
  breweryId: string;
  publicationDate: Date;
}

export interface DeduplicationResult {
  isDuplicate: boolean;
  duplicateOf?: string;
  similarity?: number;
  candidatesChecked: number;
}

@Injectable()
export class DeduplicationService {
  private readonly tokenizer = new WordTokenizer();
  private readonly SHINGLE_SIZE = 3; // Tri-grams
  private readonly MIN_HASH_SIZE = 128; // Number of hash functions
  private readonly SIMILARITY_THRESHOLD = 0.75; // 75% similarity = duplicate
  private readonly TEMPORAL_WINDOW_DAYS = 3; // ±3 days

  constructor(
    private readonly logger: LoggerService,
    private readonly prisma: PrismaService,
  ) {
    this.logger.setContext(DeduplicationService.name);
  }

  /**
   * Check if content is a duplicate of existing items
   */
  async checkDuplicate(
    contentItemId: string,
  ): Promise<DeduplicationResult> {
    try {
      // Fetch the content item
      const contentItem = await this.prisma.contentItem.findUnique({
        where: { id: contentItemId },
        select: {
          id: true,
          breweryId: true,
          rawContent: true,
          publicationDate: true,
          extractedData: true,
        },
      });

      if (!contentItem) {
        throw new Error(`Content item ${contentItemId} not found`);
      }

      // Get candidates from temporal window
      const candidates = await this.getCandidates(
        contentItem.breweryId,
        contentItem.publicationDate,
        contentItem.id,
      );

      if (candidates.length === 0) {
        this.logger.debug(`No candidates found for ${contentItemId}`);
        return {
          isDuplicate: false,
          candidatesChecked: 0,
        };
      }

      this.logger.debug(
        `Checking ${candidates.length} candidates for duplicates`,
      );

      // Generate MinHash signature for new content
      const contentText = this.extractText(contentItem);
      const newSignature = this.generateMinHash(contentText);

      // Find most similar content
      let highestSimilarity = 0;
      let duplicateOf: string | undefined;

      for (const candidate of candidates) {
        const candidateText = this.extractText(candidate);
        const candidateSignature = this.generateMinHash(candidateText);

        // Jaccard similarity from MinHash
        const jaccardSim = this.calculateJaccardSimilarity(
          newSignature,
          candidateSignature,
        );

        if (jaccardSim > highestSimilarity) {
          highestSimilarity = jaccardSim;
          duplicateOf = candidate.id;
        }

        // Early exit if we found a clear duplicate
        if (highestSimilarity >= 0.9) {
          break;
        }
      }

      // If MinHash suggests possible duplicate, verify with TF-IDF cosine similarity
      if (highestSimilarity >= this.SIMILARITY_THRESHOLD) {
        const duplicateCandidate = candidates.find(
          (c) => c.id === duplicateOf,
        );

        if (duplicateCandidate) {
          const cosineSim = this.calculateCosineSimilarity(
            contentText,
            this.extractText(duplicateCandidate),
          );

          this.logger.log(
            `Duplicate detected for ${contentItemId}: ${duplicateOf} (Jaccard: ${highestSimilarity.toFixed(2)}, Cosine: ${cosineSim.toFixed(2)})`,
          );

          return {
            isDuplicate: true,
            duplicateOf,
            similarity: Math.max(highestSimilarity, cosineSim),
            candidatesChecked: candidates.length,
          };
        }
      }

      this.logger.debug(
        `No duplicate found for ${contentItemId} (max similarity: ${highestSimilarity.toFixed(2)})`,
      );

      return {
        isDuplicate: false,
        similarity: highestSimilarity,
        candidatesChecked: candidates.length,
      };
    } catch (error) {
      this.logger.error(
        `Error checking duplicate for ${contentItemId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * Get candidate content items within temporal window for same brewery
   */
  private async getCandidates(
    breweryId: string,
    publicationDate: Date,
    excludeId: string,
  ) {
    const startDate = new Date(publicationDate);
    startDate.setDate(startDate.getDate() - this.TEMPORAL_WINDOW_DAYS);

    const endDate = new Date(publicationDate);
    endDate.setDate(endDate.getDate() + this.TEMPORAL_WINDOW_DAYS);

    return await this.prisma.contentItem.findMany({
      where: {
        breweryId,
        id: { not: excludeId },
        isDuplicate: false, // Only check against non-duplicates
        publicationDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        id: true,
        breweryId: true,
        rawContent: true,
        extractedData: true,
        publicationDate: true,
      },
      orderBy: {
        publicationDate: 'desc',
      },
      take: 50, // Limit candidates for performance
    });
  }

  /**
   * Extract text from content item (prioritize LLM summary if available)
   */
  private extractText(contentItem: any): string {
    // Try to use LLM-extracted summary first (more relevant)
    if (
      contentItem.extractedData &&
      typeof contentItem.extractedData === 'object'
    ) {
      const data = contentItem.extractedData as any;

      if (data.llmExtraction?.summary) {
        return data.llmExtraction.summary;
      }
    }

    // Fallback to raw content
    return contentItem.rawContent || '';
  }

  /**
   * Generate MinHash signature from text
   */
  generateMinHash(text: string): MinHashSignature {
    const shingles = this.generateShingles(text);

    if (shingles.size === 0) {
      return {
        hash: new Array(this.MIN_HASH_SIZE).fill(Number.MAX_SAFE_INTEGER),
        shingleCount: 0,
      };
    }

    const signature: number[] = new Array(this.MIN_HASH_SIZE).fill(
      Number.MAX_SAFE_INTEGER,
    );

    for (const shingle of shingles) {
      const shingleHash = this.hashString(shingle);

      for (let i = 0; i < this.MIN_HASH_SIZE; i++) {
        const hash = this.hashWithSeed(shingleHash, i);
        signature[i] = Math.min(signature[i], hash);
      }
    }

    return {
      hash: signature,
      shingleCount: shingles.size,
    };
  }

  /**
   * Generate character-level shingles (n-grams) from text
   */
  private generateShingles(text: string): Set<string> {
    // Normalize text
    const normalized = text
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '')
      .trim();

    const shingles = new Set<string>();

    // Generate character-level n-grams
    for (let i = 0; i <= normalized.length - this.SHINGLE_SIZE; i++) {
      const shingle = normalized.substring(i, i + this.SHINGLE_SIZE);
      shingles.add(shingle);
    }

    return shingles;
  }

  /**
   * Calculate Jaccard similarity from MinHash signatures
   */
  private calculateJaccardSimilarity(
    sig1: MinHashSignature,
    sig2: MinHashSignature,
  ): number {
    if (sig1.shingleCount === 0 || sig2.shingleCount === 0) {
      return 0;
    }

    let matches = 0;
    for (let i = 0; i < this.MIN_HASH_SIZE; i++) {
      if (sig1.hash[i] === sig2.hash[i]) {
        matches++;
      }
    }

    return matches / this.MIN_HASH_SIZE;
  }

  /**
   * Calculate cosine similarity using TF-IDF
   */
  private calculateCosineSimilarity(text1: string, text2: string): number {
    const tfidf = new TfIdf();

    // Preprocess texts
    const processed1 = this.preprocessText(text1);
    const processed2 = this.preprocessText(text2);

    // Add documents to TF-IDF
    tfidf.addDocument(processed1);
    tfidf.addDocument(processed2);

    // Get term vectors
    const terms = new Set<string>();
    tfidf.listTerms(0).forEach((item) => terms.add(item.term));
    tfidf.listTerms(1).forEach((item) => terms.add(item.term));

    // Build vectors
    const vector1: number[] = [];
    const vector2: number[] = [];

    terms.forEach((term) => {
      vector1.push(tfidf.tfidf(term, 0));
      vector2.push(tfidf.tfidf(term, 1));
    });

    // Calculate cosine similarity
    return this.cosineSimilarity(vector1, vector2);
  }

  /**
   * Preprocess text for TF-IDF (tokenize and remove stopwords)
   */
  private preprocessText(text: string): string {
    // Tokenize
    const tokens = this.tokenizer.tokenize(text.toLowerCase()) || [];

    // Remove stopwords
    const filtered = removeStopwords(tokens);

    return filtered.join(' ');
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length || vec1.length === 0) {
      return 0;
    }

    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      mag1 += vec1[i] * vec1[i];
      mag2 += vec2[i] * vec2[i];
    }

    const magnitude = Math.sqrt(mag1) * Math.sqrt(mag2);

    if (magnitude === 0) {
      return 0;
    }

    return dotProduct / magnitude;
  }

  /**
   * Simple string hashing function
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Hash with seed for multiple hash functions
   */
  private hashWithSeed(value: number, seed: number): number {
    // Simple multiplicative hashing with seed
    const prime = 2654435761; // Large prime number
    return Math.abs((value * prime + seed) & 0x7fffffff);
  }

  /**
   * Mark content as duplicate
   */
  async markAsDuplicate(
    contentItemId: string,
    duplicateOfId: string,
    similarity: number,
  ): Promise<void> {
    await this.prisma.contentItem.update({
      where: { id: contentItemId },
      data: {
        isDuplicate: true,
        duplicateOfId,
        extractedData: {
          ...(typeof contentItemId === 'object' ? contentItemId : {}),
          deduplication: {
            isDuplicate: true,
            duplicateOf: duplicateOfId,
            similarity,
            detectedAt: new Date().toISOString(),
          },
        },
      },
    });

    this.logger.log(
      `Marked ${contentItemId} as duplicate of ${duplicateOfId} (similarity: ${similarity.toFixed(2)})`,
    );
  }
}
