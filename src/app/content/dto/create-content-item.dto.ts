import { IsString, IsEnum, IsOptional, IsObject, IsDateString, IsNumber, Min, Max } from 'class-validator';
import { ContentType, SourceType } from '@prisma/client';

export class CreateContentItemDto {
  @IsString()
  breweryId!: string;

  @IsEnum(ContentType)
  type!: ContentType;

  @IsEnum(SourceType)
  sourceType!: SourceType;

  @IsString()
  @IsOptional()
  sourceUrl?: string;

  @IsString()
  rawContent!: string;

  @IsObject()
  @IsOptional()
  extractedData?: Record<string, any>;

  @IsDateString()
  publicationDate!: Date;

  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  confidenceScore?: number;
}
