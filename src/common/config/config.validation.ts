import { plainToInstance } from 'class-transformer';
import { IsString, IsNumber, IsEnum, IsOptional, validateSync, IsBoolean } from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @IsNumber()
  @IsOptional()
  PORT: number = 3000;

  // Database
  @IsString()
  DATABASE_URL: string;

  // Redis
  @IsString()
  @IsOptional()
  REDIS_HOST: string = 'localhost';

  @IsNumber()
  @IsOptional()
  REDIS_PORT: number = 6379;

  @IsString()
  @IsOptional()
  REDIS_PASSWORD?: string;

  @IsNumber()
  @IsOptional()
  REDIS_DB: number = 0;

  // JWT
  @IsString()
  JWT_SECRET: string;

  @IsString()
  @IsOptional()
  JWT_EXPIRES_IN: string = '7d';

  // Resend Email Service
  @IsString()
  @IsOptional()
  RESEND_API_KEY?: string;

  @IsString()
  @IsOptional()
  EMAIL_FROM: string = 'noreply@brewdigest.com';

  @IsString()
  @IsOptional()
  APP_BASE_URL: string = 'http://localhost:3000';

  @IsString()
  @IsOptional()
  RESEND_WEBHOOK_SECRET?: string;

  // OpenAI
  @IsString()
  OPENAI_API_KEY: string;

  @IsString()
  @IsOptional()
  OPENAI_MODEL: string = 'gpt-4o-mini';

  // MinIO (optional)
  @IsString()
  @IsOptional()
  MINIO_ENDPOINT?: string;

  @IsNumber()
  @IsOptional()
  MINIO_PORT?: number = 9000;

  @IsString()
  @IsOptional()
  MINIO_ACCESS_KEY?: string;

  @IsString()
  @IsOptional()
  MINIO_SECRET_KEY?: string;

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
  FRONTEND_URL: string = 'http://localhost:4200';
}

export function configValidation(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

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
