import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import type { Storage, StoredFile } from './storage.interface.js';

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

  async readText(key: string): Promise<string> {
    const buf = await this.read(key);
    return buf.toString('utf8');
  }

  async write(key: string, data: Buffer | string): Promise<void> {
    const body = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: key.endsWith('.pdf')
          ? 'application/pdf'
          : key.endsWith('.tex')
            ? 'application/x-tex'
            : 'application/octet-stream',
      }),
    );
    this.logger.debug(`Wrote ${key} (${body.length} bytes)`);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async list(prefix: string): Promise<StoredFile[]> {
    const results: StoredFile[] = [];
    let continuationToken: string | undefined;

    do {
      const res = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );

      for (const obj of res.Contents ?? []) {
        if (obj.Key && obj.LastModified) {
          results.push({
            key: obj.Key,
            size: obj.Size ?? 0,
            updatedAt: obj.LastModified,
          });
        }
      }
      continuationToken = res.NextContinuationToken;
    } while (continuationToken);

    return results;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    this.logger.debug(`Deleted ${key}`);
  }
}
