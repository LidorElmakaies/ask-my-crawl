import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { JOB_KEY_TTL_SECONDS } from '../../models/constants';
import type {
  CompletionUrls,
  ICoordinationStore,
  PendingCounts,
} from '../interfaces/coordination-store.interface';

const PENDING_SCRAPE_KEY = (jobId: string) => `job:${jobId}:pending_scrape`;
const PENDING_INDEX_KEY = (jobId: string) => `job:${jobId}:pending_index`;
const SUCCEEDED_KEY = (jobId: string) => `job:${jobId}:succeeded`;
const FAILED_KEY = (jobId: string) => `job:${jobId}:failed`;
const NOTIFIED_KEY = (jobId: string) => `job:${jobId}:notified`;

// Own independent copy of the Scraper's RedisCoordinationStore — not shared code, see
// docs/specs/data-model.md's Redis section for why. Key-name strings below must stay
// byte-identical to the Scraper's copy; pinned by a contract test on each side.
@Injectable()
export class RedisCoordinationStore
  implements ICoordinationStore, OnModuleDestroy
{
  private readonly redis: Redis;

  constructor(config: ConfigService) {
    const redisUrl = config.get<string>('REDIS_URL');
    if (!redisUrl) {
      throw new Error('REDIS_URL is not configured');
    }
    this.redis = new Redis(redisUrl);
  }

  onModuleDestroy(): void {
    this.redis.disconnect();
  }

  async addPendingIndex(jobId: string, url: string): Promise<void> {
    await this.redis.sadd(PENDING_INDEX_KEY(jobId), url);
  }

  async removePendingIndex(jobId: string, url: string): Promise<PendingCounts> {
    await this.redis.srem(PENDING_INDEX_KEY(jobId), url);
    // Sequential: SCARD must read after SREM applies.
    const [pendingIndex, pendingScrape] = await Promise.all([
      this.redis.scard(PENDING_INDEX_KEY(jobId)),
      this.redis.scard(PENDING_SCRAPE_KEY(jobId)),
    ]);
    return { pendingIndex, pendingScrape };
  }

  async getCompletionUrls(jobId: string): Promise<CompletionUrls> {
    const [succeededUrls, failedUrls] = await Promise.all([
      this.redis.smembers(SUCCEEDED_KEY(jobId)),
      this.redis.smembers(FAILED_KEY(jobId)),
    ]);
    return { succeededUrls, failedUrls };
  }

  async tryClaimCompletion(jobId: string): Promise<boolean> {
    const result = await this.redis.set(
      NOTIFIED_KEY(jobId),
      '1',
      'EX',
      JOB_KEY_TTL_SECONDS,
      'NX',
    );
    return result === 'OK';
  }

  async expireJobKeys(jobId: string, ttlSeconds: number): Promise<void> {
    // NOTIFIED_KEY already has its own TTL from tryClaimCompletion's SET ... EX.
    await Promise.all(
      [
        PENDING_SCRAPE_KEY(jobId),
        PENDING_INDEX_KEY(jobId),
        SUCCEEDED_KEY(jobId),
        FAILED_KEY(jobId),
      ].map((key) => this.redis.expire(key, ttlSeconds)),
    );
  }
}
