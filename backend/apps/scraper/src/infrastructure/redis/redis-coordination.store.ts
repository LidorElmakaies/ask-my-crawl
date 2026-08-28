import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { JOB_KEY_TTL_SECONDS } from '../../models/constants';
import type {
  CompletionUrls,
  ICoordinationStore,
  PendingCounts,
} from '../interfaces/coordination-store.interface';

const VISITED_KEY = (jobId: string) => `crawl:${jobId}:visited`;
const PENDING_SCRAPE_KEY = (jobId: string) => `job:${jobId}:pending_scrape`;
const PENDING_INDEX_KEY = (jobId: string) => `job:${jobId}:pending_index`;
const SUCCEEDED_KEY = (jobId: string) => `job:${jobId}:succeeded`;
const FAILED_KEY = (jobId: string) => `job:${jobId}:failed`;
const NOTIFIED_KEY = (jobId: string) => `job:${jobId}:notified`;

// Raw ioredis client, not a framework wrapper — same "own the connection lifecycle directly"
// pattern as KafkajsEventPublisher (job-manager's, and this app's own). Key names/shapes match
// docs/specs/data-model.md's Redis table and docs/planning/03-crawler-scraper-indexing-plan.md
// exactly — shared with the Indexer once it's built (same instance, same key names, not
// re-derived there).
@Injectable()
export class RedisCoordinationStore
  implements ICoordinationStore, OnModuleDestroy
{
  private readonly redis: Redis;

  constructor(config: ConfigService) {
    const redisUrl = config.get<string>('REDIS_URL') ?? 'redis://redis:6379';
    this.redis = new Redis(redisUrl);
  }

  onModuleDestroy(): void {
    this.redis.disconnect();
  }

  async tryMarkVisited(jobId: string, url: string): Promise<boolean> {
    const added = await this.redis.sadd(VISITED_KEY(jobId), url);
    return added === 1;
  }

  async incrementPendingScrape(jobId: string): Promise<void> {
    await this.redis.incr(PENDING_SCRAPE_KEY(jobId));
  }

  async decrementPendingScrape(jobId: string): Promise<PendingCounts> {
    const [pendingScrape, pendingIndexRaw] = await Promise.all([
      this.redis.decr(PENDING_SCRAPE_KEY(jobId)),
      this.redis.get(PENDING_INDEX_KEY(jobId)),
    ]);
    // pending_index defaults to 0 (unset) until the Indexer exists and starts incrementing it —
    // GET on a missing key returns null, not "0", so this must be coerced explicitly. This is what
    // lets a crawl complete correctly with the Scraper alone, before the Indexer exists.
    return {
      pendingScrape,
      pendingIndex: Number(pendingIndexRaw ?? 0),
    };
  }

  async markSucceeded(jobId: string, url: string): Promise<void> {
    await this.redis.sadd(SUCCEEDED_KEY(jobId), url);
  }

  async markFailed(jobId: string, url: string): Promise<void> {
    await this.redis.sadd(FAILED_KEY(jobId), url);
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
    // NOTIFIED_KEY already carries its own TTL from tryClaimCompletion's SET ... EX — no need to
    // re-EXPIRE it here.
    await Promise.all(
      [
        VISITED_KEY(jobId),
        PENDING_SCRAPE_KEY(jobId),
        PENDING_INDEX_KEY(jobId),
        SUCCEEDED_KEY(jobId),
        FAILED_KEY(jobId),
      ].map((key) => this.redis.expire(key, ttlSeconds)),
    );
  }
}
