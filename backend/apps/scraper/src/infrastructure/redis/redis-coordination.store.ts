import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { ICoordinationStore } from '../interfaces/coordination-store.interface';

const VISITED_KEY = (jobId: string) => `crawl:${jobId}:visited`;
const PENDING_SCRAPE_KEY = (jobId: string) => `job:${jobId}:pending_scrape`;
const SUCCEEDED_KEY = (jobId: string) => `job:${jobId}:succeeded`;
const FAILED_KEY = (jobId: string) => `job:${jobId}:failed`;

// Raw ioredis client, not a framework wrapper — same "own the connection lifecycle directly"
// pattern as KafkajsEventPublisher (job-manager's, and this app's own). Key names/shapes match
// docs/specs/data-model.md's Redis table and docs/planning/03-crawler-scraper-indexing-plan.md
// exactly — shared with the Indexer (same instance, same key names, not re-derived there).
// Narrower than the Indexer's own copy — see coordination-store.interface.ts's header comment.
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

  async decrementPendingScrape(jobId: string): Promise<void> {
    await this.redis.decr(PENDING_SCRAPE_KEY(jobId));
  }

  async markSucceeded(jobId: string, url: string): Promise<void> {
    await this.redis.sadd(SUCCEEDED_KEY(jobId), url);
  }

  async markFailed(jobId: string, url: string): Promise<void> {
    await this.redis.sadd(FAILED_KEY(jobId), url);
  }
}
