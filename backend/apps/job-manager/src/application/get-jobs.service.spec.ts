import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { IJobRepository } from '../infrastructure/interfaces/job-repository.interface';
import type { Job } from '../models/job';
import { GetJobsService } from './get-jobs.service';

describe('GetJobsService', () => {
  let service: GetJobsService;
  let repo: jest.Mocked<IJobRepository>;

  const sampleJob: Job = {
    id: 'job-1',
    user_id: 'user-1',
    url: 'https://example.com',
    query: 'query',
    result: 'answer',
  };

  beforeEach(() => {
    repo = {
      create: jest.fn(),
      saveResult: jest.fn(),
      findByUserId: jest.fn().mockResolvedValue([sampleJob]),
      findAll: jest.fn().mockResolvedValue([sampleJob]),
      findById: jest.fn().mockResolvedValue(sampleJob),
    };
    service = new GetJobsService(repo);
  });

  it('returns only own jobs for a regular user', async () => {
    const jobs = await service.getJobs({ userId: 'user-1', role: 'user' });

    expect(repo.findByUserId).toHaveBeenCalledWith('user-1');
    expect(jobs).toEqual([sampleJob]);
  });

  it('returns all jobs for an admin', async () => {
    const jobs = await service.getJobs({ userId: 'admin-1', role: 'admin' });

    expect(repo.findAll).toHaveBeenCalledWith(undefined);
    expect(jobs).toEqual([sampleJob]);
  });

  it('returns filtered jobs for an admin if filterUserId is provided', async () => {
    await service.getJobs({
      userId: 'admin-1',
      role: 'admin',
      filterUserId: 'user-2',
    });

    expect(repo.findAll).toHaveBeenCalledWith('user-2');
  });

  it('returns a job by id if the user owns it', async () => {
    const job = await service.getJobById({
      jobId: 'job-1',
      userId: 'user-1',
      role: 'user',
    });

    expect(job).toEqual(sampleJob);
  });

  it('throws ForbiddenException if a regular user tries to access another user job', async () => {
    await expect(
      service.getJobById({
        jobId: 'job-1',
        userId: 'user-2',
        role: 'user',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws NotFoundException if the job does not exist', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(
      service.getJobById({
        jobId: 'non-existent',
        userId: 'user-1',
        role: 'user',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
