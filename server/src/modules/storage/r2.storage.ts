import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Storage } from './storage.interface';

const SIGNED_URL_TTL_SECONDS = 300;

@Injectable()
export class R2Storage implements Storage {
  private readonly logger = new Logger(R2Storage.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.bucket = config.get<string>('storage.r2Bucket')!;
    this.client = new S3Client({
      region: 'auto',
      endpoint: config.get<string>('storage.r2Endpoint')!,
      credentials: {
        accessKeyId: config.get<string>('storage.r2AccessKeyId')!,
        secretAccessKey: config.get<string>('storage.r2SecretAccessKey')!,
      },
    });
    this.logger.log(`R2 storage initialized: bucket=${this.bucket}`);
  }

  async read(key: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const chunks: Uint8Array[] = [];
    const stream = res.Body as AsyncIterable<Uint8Array>;
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async size(key: string): Promise<number | null> {
    try {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return head.ContentLength ?? null;
    } catch (error) {
      if (error instanceof NotFound) return null;
      throw error;
    }
  }

  async move(from: string, to: string): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${encodeURI(from)}`,
        Key: to,
      }),
    );
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: from }),
    );
  }

  uploadUrl(key: string, contentType: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      }),
      {
        expiresIn: SIGNED_URL_TTL_SECONDS,
        signableHeaders: new Set(['content-type']),
      },
    );
  }

  downloadUrl(key: string, filename: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentType: 'application/pdf',
        ResponseContentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
      }),
      { expiresIn: SIGNED_URL_TTL_SECONDS },
    );
  }
}
