import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, NoSuchKey, S3Client } from '@aws-sdk/client-s3';
import { PermanentIndexError } from '../../models/permanent-index-error';
import type { IBlobRepository } from '../interfaces/blob-repository.interface';

// SeaweedFS's S3-compatible API, via the real AWS SDK — same client shape as the Scraper's own
// S3BlobRepository (apps/scraper/src/infrastructure/seaweedfs/s3-blob.repository.ts), same
// endpoint/bucket/credential env vars (SEAWEEDFS_*, reused verbatim — no new vars for this side),
// but read-only: this is the Indexer's own copy, scoped to only get(), not shared code — see
// blob-repository.interface.ts's doc comment.
@Injectable()
export class S3BlobRepository implements IBlobRepository {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    const endpoint =
      config.get<string>('SEAWEEDFS_ENDPOINT') ?? 'http://seaweedfs:8333';
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
        // Should be unreachable in practice (a successful GetObject always has a Body), but a
        // missing body isn't retryable any more than a missing object is.
        throw new PermanentIndexError(`Blob ${blobKey} returned an empty body`);
      }
      return body;
    } catch (err) {
      // A genuinely-missing object is permanent — retrying can't produce a blob that isn't there.
      // Checked both ways: the modeled NoSuchKey exception (real AWS S3) and a bare 404 status
      // (some S3-compatible stores, SeaweedFS included, don't always throw the modeled type).
      const status = (err as { $metadata?: { httpStatusCode?: number } })
        ?.$metadata?.httpStatusCode;
      if (err instanceof NoSuchKey || status === 404) {
        throw new PermanentIndexError(`Blob not found: ${blobKey}`);
      }
      throw err; // transient — connection error, timeout, 5xx
    }
  }
}
