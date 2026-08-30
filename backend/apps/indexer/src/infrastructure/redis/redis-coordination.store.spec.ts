import type { ConfigService } from '@nestjs/config';
import { RedisCoordinationStore } from './redis-coordination.store';

// Contract test — asserts this Indexer-side copy uses the EXACT SAME literal Redis key strings as
// the Scraper's own independent copy (apps/scraper/src/infrastructure/redis/
// redis-coordination.store.spec.ts) and docs/specs/data-model.md's canonical key table. The two
// copies must never drift: they read/write the same physical Redis instance for the same job, so
// a typo'd key name on either side would silently break the fan-in completion race rather than
// throwing anywhere.
const mockRedis = {
  incr: jest.fn(),
  decr: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  smembers: jest.fn(),
  expire: jest.fn(),
  disconnect: jest.fn(),
};

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => mockRedis),
}));

function fakeConfig(): ConfigService {
  return { get: () => undefined } as unknown as ConfigService;
}

describe('RedisCoordinationStore (Indexer) — key-name contract', () => {
  const jobId = 'job-1';
  let store: RedisCoordinationStore;

  beforeEach(() => {
    jest.clearAllMocks();
    store = new RedisCoordinationStore(fakeConfig());
  });

  it('incrementPendingIndex: INCR job:{job_id}:pending_index', async () => {
    await store.incrementPendingIndex(jobId);
    expect(mockRedis.incr).toHaveBeenCalledWith('job:job-1:pending_index');
  });

  it('decrementPendingIndex: DECR job:{job_id}:pending_index, GET job:{job_id}:pending_scrape', async () => {
    mockRedis.decr.mockResolvedValue(0);
    mockRedis.get.mockResolvedValue(null);

    const counts = await store.decrementPendingIndex(jobId);

    expect(mockRedis.decr).toHaveBeenCalledWith('job:job-1:pending_index');
    expect(mockRedis.get).toHaveBeenCalledWith('job:job-1:pending_scrape');
    // A missing pending_scrape key (nothing incremented it yet) coerces to 0, not NaN/null.
    expect(counts).toEqual({ pendingIndex: 0, pendingScrape: 0 });
  });

  it('getCompletionUrls: SMEMBERS job:{job_id}:succeeded and job:{job_id}:failed', async () => {
    mockRedis.smembers.mockResolvedValue([]);
    await store.getCompletionUrls(jobId);
    expect(mockRedis.smembers).toHaveBeenCalledWith('job:job-1:succeeded');
    expect(mockRedis.smembers).toHaveBeenCalledWith('job:job-1:failed');
  });

  it('tryClaimCompletion: SET job:{job_id}:notified 1 EX <ttl> NX', async () => {
    mockRedis.set.mockResolvedValue('OK');
    const won = await store.tryClaimCompletion(jobId);
    expect(mockRedis.set).toHaveBeenCalledWith(
      'job:job-1:notified',
      '1',
      'EX',
      60 * 60,
      'NX',
    );
    expect(won).toBe(true);
  });

  it("expireJobKeys: EXPIREs visited/pending_scrape/pending_index/succeeded/failed (not notified — already TTL'd by its own SET)", async () => {
    await store.expireJobKeys(jobId, 3600);
    const expiredKeys = mockRedis.expire.mock.calls.map(
      (call: unknown[]) => call[0] as string,
    );
    expect(expiredKeys.sort()).toEqual(
      [
        'crawl:job-1:visited',
        'job:job-1:pending_scrape',
        'job:job-1:pending_index',
        'job:job-1:succeeded',
        'job:job-1:failed',
      ].sort(),
    );
  });
});
