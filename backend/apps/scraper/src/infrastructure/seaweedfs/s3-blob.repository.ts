import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { IBlobRepository } from '../interfaces/blob-repository.interface';

// SeaweedFS's S3-compatible API, via the real AWS SDK — this is also what makes a later swap to
// real AWS S3 a config change (new endpoint/credentials), not a rewrite. See the devops agent's
// AWS-phase table.
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
      // Required for S3-compatible non-AWS endpoints — virtual-hosted-style bucket URLs
      // (bucket.endpoint/...) don't resolve against SeaweedFS, only path-style (endpoint/bucket/...).
      forcePathStyle: true,
    });
  }

  async save(
    blobKey: string,
    content: string,
    contentType: string,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: blobKey,
        Body: content,
        ContentType: contentType,
      }),
    );
  }
}
