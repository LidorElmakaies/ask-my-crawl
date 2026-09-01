/* eslint-disable @typescript-eslint/unbound-method --
   false positive: these are jest.fn() mocks, not real prototype methods relying on `this`. */
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { KAFKA_TOPICS } from '@app/kafka-contracts';
import type { IEventPublisher } from '@app/kafka-client';
import type { IJobRepository } from '../infrastructure/interfaces/job-repository.interface';
import type { Job } from '../models/job';
import { RetryJobService } from './retry-job.service';

describe('RetryJobService', () => {
  let service: RetryJobService;
  let repo: jest.Mocked<IJobRepository>;
  let eventPublisher: jest.Mocked<IEventPublisher>;

  const failedJob: Job = {
    id: 'job-1',
    user_id: 'user-1',
    url: 'https://example.com',
    query: 'query',
    result: null,
    failed_reason: 'Failed after 5 attempts.',
  };

  beforeEach(() => {
    repo = {
      create: jest.fn(),
      saveResult: jest.fn(),
      saveFailure: jest.fn(),
      clearFailureForRetry: jest.fn().mockResolvedValue({
        ...failedJob,
        failed_reason: null,
      }),
      findByUserId: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn().mockResolvedValue(failedJob),
    };
    eventPublisher = { publish: jest.fn() };
    service = new RetryJobService(repo, eventPublisher);
  });

  it('throws NotFoundException if the job does not exist', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(
      service.handle({ jobId: 'non-existent', userId: 'user-1', role: 'user' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws ForbiddenException if a regular user tries to retry another user job', async () => {
    await expect(
      service.handle({ jobId: 'job-1', userId: 'user-2', role: 'user' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws ConflictException if the job has no failure to retry', async () => {
    repo.findById.mockResolvedValue({ ...failedJob, failed_reason: null });

    await expect(
      service.handle({ jobId: 'job-1', userId: 'user-1', role: 'user' }),
    ).rejects.toThrow(ConflictException);
  });

  it('clears the failure and republishes crawl-complete with retry_count: 0 on success', async () => {
    await service.handle({ jobId: 'job-1', userId: 'user-1', role: 'user' });

    expect(repo.clearFailureForRetry).toHaveBeenCalledWith('job-1');
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      KAFKA_TOPICS.CRAWL_COMPLETE,
      'job-1',
      {
        job_id: 'job-1',
        user_id: 'user-1',
        url: 'https://example.com',
        query: 'query',
        succeeded_count: 0,
        failed_count: 0,
        succeeded_urls: [],
        failed_urls: [],
        retry_count: 0,
      },
    );
  });

  it('allows an admin to retry a job owned by another user', async () => {
    await service.handle({ jobId: 'job-1', userId: 'admin-1', role: 'admin' });

    expect(repo.clearFailureForRetry).toHaveBeenCalledWith('job-1');
    expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
  });
});
