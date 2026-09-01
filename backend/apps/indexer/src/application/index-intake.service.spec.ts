/* eslint-disable @typescript-eslint/unbound-method --
   false positive: these are jest.fn() mocks, not real prototype methods relying on `this`. */
import type { PageScrapedMessage } from '@app/kafka-contracts';
import type { ICoordinationStore } from '../infrastructure/interfaces/coordination-store.interface';
import type { IIndexPageQueue } from '../infrastructure/interfaces/index-page-queue.interface';
import { IndexIntakeService } from './index-intake.service';

function makeDeps() {
  const coordinationStore: jest.Mocked<ICoordinationStore> = {
    addPendingIndex: jest.fn(),
    removePendingIndex: jest.fn(),
    getCompletionUrls: jest.fn(),
    tryClaimCompletion: jest.fn(),
    expireJobKeys: jest.fn(),
  };
  const queue: jest.Mocked<IIndexPageQueue> = {
    alreadyClaimed: jest.fn(),
    enqueue: jest.fn(),
  };
  return { coordinationStore, queue };
}

describe('IndexIntakeService', () => {
  const message: PageScrapedMessage = {
    job_id: 'job-1',
    user_id: 'user-1',
    url: 'https://example.com/page',
    normalizedUrl: 'https://example.com/page',
    blobKey: 'blob-1',
    depth: 2,
    scrapedAt: '2026-08-30T00:00:00.000Z',
    query: 'what is this page about?',
    base_url: 'https://example.com/',
  };

  it('adds to pending_index and enqueues onto index-page when not already claimed', async () => {
    const { coordinationStore, queue } = makeDeps();
    queue.alreadyClaimed.mockResolvedValue(false);
    const service = new IndexIntakeService(coordinationStore, queue);

    await service.handle(message);

    expect(queue.alreadyClaimed).toHaveBeenCalledWith(
      'job-1',
      'https://example.com/page',
    );
    expect(coordinationStore.addPendingIndex).toHaveBeenCalledWith(
      'job-1',
      'https://example.com/page',
    );
    expect(queue.enqueue).toHaveBeenCalledWith(message);
  });

  it('does nothing when an index-page job already exists for this job_id+normalizedUrl', async () => {
    const { coordinationStore, queue } = makeDeps();
    queue.alreadyClaimed.mockResolvedValue(true);
    const service = new IndexIntakeService(coordinationStore, queue);

    await service.handle(message);

    expect(coordinationStore.addPendingIndex).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
});
