import { ContentType, SourceType } from '@prisma/client';

export class ContentItemResponseDto {
  id!: string;
  breweryId!: string;
  type!: ContentType;
  sourceType!: SourceType;
  sourceUrl?: string;
  rawContent!: string;
  extractedData!: Record<string, any>;
  publicationDate!: Date;
  isDuplicate!: boolean;
  duplicateOfId?: string;
  confidenceScore?: number;
  createdAt!: Date;
  updatedAt!: Date;

  // Optional brewery info
  brewery?: {
    id: string;
    name: string;
    slug: string;
    logoUrl?: string;
  };
}
