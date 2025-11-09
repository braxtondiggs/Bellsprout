import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import { LoggerService } from '../services/logger.service';
import { Readable } from 'stream';

export interface UploadResult {
  bucket: string;
  key: string;
  url: string;
  etag: string;
}

export interface PresignedUrlOptions {
  expiresIn?: number; // Seconds (default: 7 days)
}

@Injectable()
export class MinioService implements OnModuleInit {
  private client: Minio.Client;
  private readonly bucket: string;
  private readonly endpoint: string;
  private readonly port: number;
  private readonly useSSL: boolean;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: LoggerService
  ) {
    this.logger.setContext(MinioService.name);

    this.endpoint = this.config.get<string>('MINIO_ENDPOINT', 'localhost');
    this.port = this.config.get<number>('MINIO_PORT', 9000);
    this.useSSL = this.config.get<boolean>('MINIO_USE_SSL', false);
    this.bucket = this.config.get<string>('MINIO_BUCKET', 'brewery-assets');

    this.client = new Minio.Client({
      endPoint: this.endpoint,
      port: this.port,
      useSSL: this.useSSL,
      accessKey: this.config.get<string>('MINIO_ACCESS_KEY', 'minioadmin'),
      secretKey: this.config.get<string>('MINIO_SECRET_KEY', 'minioadmin'),
    });
  }

  /**
   * Helper method to handle errors
   */
  private handleError(message: string, error: unknown): never {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    this.logger.error(`${message}: ${errorMessage}`, errorStack);
    throw error;
  }

  async onModuleInit() {
    try {
      // Ensure bucket exists
      const bucketExists = await this.client.bucketExists(this.bucket);

      if (!bucketExists) {
        await this.client.makeBucket(this.bucket);
        this.logger.log(`Created MinIO bucket: ${this.bucket}`);

        // Set bucket policy to allow public read access for images
        const policy = {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { AWS: ['*'] },
              Action: ['s3:GetObject'],
              Resource: [`arn:aws:s3:::${this.bucket}/*`],
            },
          ],
        };

        await this.client.setBucketPolicy(this.bucket, JSON.stringify(policy));
        this.logger.log(`Set public read policy on bucket: ${this.bucket}`);
      } else {
        this.logger.log(`MinIO bucket already exists: ${this.bucket}`);
      }
    } catch (error) {
      this.handleError('Failed to initialize MinIO', error);
    }
  }

  /**
   * Upload a file from a buffer
   */
  async uploadBuffer(
    key: string,
    buffer: Buffer,
    contentType?: string
  ): Promise<UploadResult> {
    try {
      const metadata: Record<string, string> = {};
      if (contentType) {
        metadata['Content-Type'] = contentType;
      }

      const result = await this.client.putObject(
        this.bucket,
        key,
        buffer,
        buffer.length,
        metadata
      );

      const url = this.getPublicUrl(key);

      this.logger.log(`Uploaded file to MinIO: ${key}`);

      return {
        bucket: this.bucket,
        key,
        url,
        etag: result.etag,
      };
    } catch (error) {
      this.handleError('Failed to upload to MinIO', error);
    }
  }

  /**
   * Upload a file from a stream
   */
  async uploadStream(
    key: string,
    stream: Readable,
    size: number,
    contentType?: string
  ): Promise<UploadResult> {
    try {
      const metadata: Record<string, string> = {};
      if (contentType) {
        metadata['Content-Type'] = contentType;
      }

      const result = await this.client.putObject(
        this.bucket,
        key,
        stream,
        size,
        metadata
      );

      const url = this.getPublicUrl(key);

      this.logger.log(`Uploaded stream to MinIO: ${key}`);

      return {
        bucket: this.bucket,
        key,
        url,
        etag: result.etag,
      };
    } catch (error) {
      this.handleError('Failed to upload stream to MinIO', error);
    }
  }

  /**
   * Download a file as a buffer
   */
  async downloadBuffer(key: string): Promise<Buffer> {
    try {
      const stream = await this.client.getObject(this.bucket, key);
      const chunks: Buffer[] = [];

      return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
      });
    } catch (error) {
      this.handleError('Failed to download from MinIO', error);
    }
  }

  /**
   * Get a presigned URL for temporary access
   */
  async getPresignedUrl(
    key: string,
    options: PresignedUrlOptions = {}
  ): Promise<string> {
    try {
      const expiresIn = options.expiresIn || 60 * 60 * 24 * 7; // 7 days default
      const url = await this.client.presignedGetObject(
        this.bucket,
        key,
        expiresIn
      );
      return url;
    } catch (error) {
      this.handleError('Failed to generate presigned URL', error);
    }
  }

  /**
   * Get the public URL for a file
   */
  getPublicUrl(key: string): string {
    const protocol = this.useSSL ? 'https' : 'http';
    const port = this.useSSL && this.port === 443 ? '' : `:${this.port}`;
    return `${protocol}://${this.endpoint}${port}/${this.bucket}/${key}`;
  }

  /**
   * Delete a file
   */
  async deleteFile(key: string): Promise<void> {
    try {
      await this.client.removeObject(this.bucket, key);
      this.logger.log(`Deleted file from MinIO: ${key}`);
    } catch (error) {
      this.handleError('Failed to delete from MinIO', error);
    }
  }

  /**
   * Check if a file exists
   */
  async fileExists(key: string): Promise<boolean> {
    try {
      await this.client.statObject(this.bucket, key);
      return true;
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'NotFound'
      ) {
        return false;
      }
      throw error;
    }
  }

  /**
   * List files with a prefix
   */
  async listFiles(prefix: string): Promise<string[]> {
    try {
      const stream = this.client.listObjects(this.bucket, prefix, true);
      const files: string[] = [];

      return new Promise((resolve, reject) => {
        stream.on('data', (obj) => {
          if (obj.name) {
            files.push(obj.name);
          }
        });
        stream.on('end', () => resolve(files));
        stream.on('error', reject);
      });
    } catch (error) {
      this.handleError('Failed to list files from MinIO', error);
    }
  }

  /**
   * Generate a unique key for a file
   */
  generateKey(
    breweryId: string,
    filename: string,
    folder: 'images' | 'documents' = 'images'
  ): string {
    const timestamp = Date.now();
    const sanitized = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    return `${folder}/${breweryId}/${timestamp}-${sanitized}`;
  }
}
