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
const VISITED_KEY = (jobId: string) => `crawl:${jobId}:visited`;

// Raw ioredis client, not a framework wrapper — same pattern as KafkajsEventPublisher. This is the
// Indexer's OWN independent copy of the Scraper's RedisCoordinationStore (apps/scraper/src/
// infrastructure/redis/redis-coordination.store.ts), not a shared lib — this codebase's convention
// is per-service copies of infra glue when each service only needs part of the surface (the
// Indexer never dedups/marks succeeded-failed, only the Scraper does), reserving extraction for
// code that's genuinely identical across every consumer (see @app/kafka-client). The two copies'
// key-name strings below MUST stay byte-identical to the Scraper's — both are pinned against
// docs/specs/data-model.md's canonical Redis key table; a contract test on each side asserts this.
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

  async incrementPendingIndex(jobId: string): Promise<void> {
    await this.redis.incr(PENDING_INDEX_KEY(jobId));
  }

  async decrementPendingIndex(jobId: string): Promise<PendingCounts> {
    const [pendingIndex, pendingScrapeRaw] = await Promise.all([
      this.redis.decr(PENDING_INDEX_KEY(jobId)),
      this.redis.get(PENDING_SCRAPE_KEY(jobId)),
    ]);
    // pending_scrape is only ever written by the Scraper — GET on a missing key returns null, not
    // "0", so this must be coerced explicitly (e.g. the Indexer racing ahead of the Scraper's own
    // first increment, however unlikely in practice).
    return {
      pendingIndex,
      pendingScrape: Number(pendingScrapeRaw ?? 0),
    };
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
    // re-EXPIRE it here. VISITED_KEY is the Scraper's own dedup set, not written by the Indexer,
    // but still expired here in case the Indexer wins the race and the Scraper's own expire call
    // never runs for this job.
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
