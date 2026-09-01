import type { ConfigService } from '@nestjs/config';
import { RedisCoordinationStore } from './redis-coordination.store';

// Contract test — asserts this Scraper-side copy uses the EXACT SAME literal Redis key strings as
// the Indexer's own independent copy (apps/indexer/src/infrastructure/redis/
// redis-coordination.store.spec.ts) for the keys both sides touch, and docs/specs/data-model.md's
// canonical key table. See that file's header comment for why this matters — the two copies must
// never drift. The Scraper's copy is deliberately narrower than the Indexer's — see
// coordination-store.interface.ts's header comment (only the Indexer ever checks for job
// completion or publishes crawl-complete).
const mockRedis = {
  sadd: jest.fn(),
  srem: jest.fn(),
  disconnect: jest.fn(),
};

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => mockRedis),
}));

// Must be truthy — the constructor throws otherwise, before the ioredis mock is ever reached.
function fakeConfig(): ConfigService {
  return { get: () => 'redis://localhost:6379' } as unknown as ConfigService;
}

describe('RedisCoordinationStore (Scraper) — key-name contract', () => {
  const jobId = 'job-1';
  let store: RedisCoordinationStore;

  beforeEach(() => {
    jest.clearAllMocks();
    store = new RedisCoordinationStore(fakeConfig());
  });

  it('addPendingScrape: SADD job:{job_id}:pending_scrape', async () => {
    await store.addPendingScrape(jobId, 'https://example.com/page');
    expect(mockRedis.sadd).toHaveBeenCalledWith(
      'job:job-1:pending_scrape',
      'https://example.com/page',
    );
  });

  it('removePendingScrape: SREM job:{job_id}:pending_scrape', async () => {
    await store.removePendingScrape(jobId, 'https://example.com/page');
    expect(mockRedis.srem).toHaveBeenCalledWith(
      'job:job-1:pending_scrape',
      'https://example.com/page',
    );
  });

  it('markSucceeded/markFailed: SADD job:{job_id}:succeeded / job:{job_id}:failed', async () => {
    await store.markSucceeded(jobId, 'https://example.com/a');
    await store.markFailed(jobId, 'https://example.com/b');
    expect(mockRedis.sadd).toHaveBeenCalledWith(
      'job:job-1:succeeded',
      'https://example.com/a',
    );
    expect(mockRedis.sadd).toHaveBeenCalledWith(
      'job:job-1:failed',
      'https://example.com/b',
    );
  });
});
