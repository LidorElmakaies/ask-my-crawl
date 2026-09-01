import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, NoSuchKey, S3Client } from '@aws-sdk/client-s3';
import { PermanentIndexError } from '../../models/permanent-index-error';
import type { IBlobRepository } from '../interfaces/blob-repository.interface';

// SeaweedFS's S3-compatible API. Own read-only copy of the Scraper's S3BlobRepository — see
// blob-repository.interface.ts.
@Injectable()
export class S3BlobRepository implements IBlobRepository {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    const endpoint = config.get<string>('SEAWEEDFS_ENDPOINT');
    if (!endpoint) {
      throw new Error('SEAWEEDFS_ENDPOINT is not configured');
    }
    this.bucket =
      config.get<string>('SEAWEEDFS_BUCKET') ?? 'askmycrawl-raw-html';
    this.client = new S3Client({
      endpoint,
      region: 'us-east-1', // SeaweedFS ignores this, but the SDK requires some value
      credentials: {
        accessKeyId: config.get<string>('SEAWEEDFS_ACCESS_KEY') ?? '',
        secretAccessKey: config.get<string>('SEAWEEDFS_SECRET_KEY') ?? '',
      },
      forcePathStyle: true,
    });
  }

  async get(blobKey: string): Promise<string> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: blobKey }),
      );
      const body = await response.Body?.transformToString('utf-8');
      if (body === undefined) {
        throw new PermanentIndexError(`Blob ${blobKey} returned an empty body`);
      }
      return body;
    } catch (err) {
      // A missing object is permanent. Checked both ways: the modeled NoSuchKey exception and a
      // bare 404 status (some S3-compatible stores don't throw the modeled type).
      const status = (err as { $metadata?: { httpStatusCode?: number } })
        ?.$metadata?.httpStatusCode;
      if (err instanceof NoSuchKey || status === 404) {
        throw new PermanentIndexError(`Blob not found: ${blobKey}`);
      }
      throw err; // transient — connection error, timeout, 5xx
    }
  }
}
