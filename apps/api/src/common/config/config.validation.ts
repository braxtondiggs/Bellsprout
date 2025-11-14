import { plainToInstance, Type, Transform } from 'class-transformer';
import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  validateSync,
  IsBoolean,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  PORT = 3000;

  // Database
  @IsString()
  DATABASE_URL!: string;

  // Redis
  @IsString()
  @IsOptional()
  REDIS_HOST = 'localhost';

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  REDIS_PORT = 6379;

  @IsString()
  @IsOptional()
  REDIS_PASSWORD?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  REDIS_DB = 0;

  // JWT
  @IsString()
  JWT_SECRET!: string;

  @IsString()
  @IsOptional()
  JWT_EXPIRES_IN = '7d';

  // Resend Email Service
  @IsString()
  @IsOptional()
  RESEND_API_KEY?: string;

  @IsString()
  @IsOptional()
  RESEND_FROM_EMAIL = 'noreply@brewdigest.com';

  @IsString()
  @IsOptional()
  APP_BASE_URL = 'http://localhost:3000';

  @IsString()
  @IsOptional()
  RESEND_WEBHOOK_SECRET?: string;

  // OpenAI
  @IsString()
  OPENAI_API_KEY!: string;

  @IsString()
  @IsOptional()
  OPENAI_MODEL = 'gpt-4o-mini';

  // MinIO (optional)
  @IsString()
  @IsOptional()
  MINIO_ENDPOINT?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  MINIO_PORT?: number = 9000;

  @IsString()
  @IsOptional()
  MINIO_ACCESS_KEY?: string;

  @IsString()
  @IsOptional()
  MINIO_SECRET_KEY?: string;

  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  MINIO_USE_SSL?: boolean = false;

  @IsString()
  @IsOptional()
  MINIO_BUCKET?: string = 'brewery-assets';

  // Logging
  @IsString()
  @IsOptional()
  LOG_LEVEL?: string = 'info';

  // Frontend URL (for email links)
  @IsString()
  @IsOptional()
  FRONTEND_URL = 'http://localhost:4200';
}

export function configValidation(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config);

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const errorMessages = errors
      .map((error) => {
        const constraints = error.constraints;
        return constraints ? Object.values(constraints).join(', ') : '';
      })
      .filter(Boolean)
      .join('; ');

    throw new Error(`Config validation error: ${errorMessages}`);
  }

  return validatedConfig;
}
