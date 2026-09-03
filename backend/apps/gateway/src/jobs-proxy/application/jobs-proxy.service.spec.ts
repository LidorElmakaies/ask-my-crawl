/* eslint-disable @typescript-eslint/unbound-method --
   false positive: these are jest.fn() mocks, not real prototype methods relying on `this`. */
import { MAX_CRAWL_DEPTH } from './constants';
import type { IJobRequestsPublisher } from '../infrastructure/interfaces/job-requests-publisher.interface';
import type { IJobServiceClient } from '../infrastructure/interfaces/job-service-client.interface';
import { JobsProxyService } from './jobs-proxy.service';

describe('JobsProxyService', () => {
  let service: JobsProxyService;
  let publisher: jest.Mocked<IJobRequestsPublisher>;
  let client: jest.Mocked<IJobServiceClient>;

  beforeEach(() => {
    publisher = { publish: jest.fn().mockResolvedValue(undefined) };
    client = {
      forward: jest.fn().mockResolvedValue({ statusCode: 200, data: [] }),
      retryJob: jest
        .fn()
        .mockResolvedValue({ statusCode: 202, data: undefined }),
    };
    service = new JobsProxyService(publisher, client);
  });

  it('publishes job-requests message and returns 202 accepted status on createJob', async () => {
    const result = await service.createJob('user-1', {
      url: 'https://example.com',
      query: 'What is this?',
      depth: 5,
    });

    expect(publisher.publish).toHaveBeenCalledWith({
      user_id: 'user-1',
      url: 'https://example.com',
      query: 'What is this?',
      depth: 5,
    });
    expect(result).toEqual({ status: 'accepted' });
  });

  it('defaults depth to MAX_CRAWL_DEPTH when the client omits it', async () => {
    await service.createJob('user-1', {
      url: 'https://example.com',
      query: 'What is this?',
    });

    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ depth: MAX_CRAWL_DEPTH }),
    );
  });

  it('forwards queries to job service client on forward', async () => {
    const response = await service.forward({
      path: '/jobs',
      userId: 'user-1',
      role: 'user',
    });

    expect(client.forward).toHaveBeenCalledWith({
      path: '/jobs',
      userId: 'user-1',
      role: 'user',
    });
    expect(response).toEqual({ statusCode: 200, data: [] });
  });

  it('forwards retry requests to job service client on retryJob', async () => {
    const response = await service.retryJob(
      'job-1',
      'user-1',
      'user',
      'Bearer token',
    );

    expect(client.retryJob).toHaveBeenCalledWith(
      'job-1',
      'user-1',
      'user',
      'Bearer token',
    );
    expect(response).toEqual({ statusCode: 202, data: undefined });
  });
});
