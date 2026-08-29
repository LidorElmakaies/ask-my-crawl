import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Job } from '../models/job';
import { JOB_REPOSITORY } from '../tokens';
import type { IJobRepository } from '../infrastructure/interfaces/job-repository.interface';
import type {
  GetJobByIdQuery,
  GetJobsQuery,
  IGetJobsUseCase,
} from './interfaces/get-jobs-use-case.interface';

@Injectable()
export class GetJobsService implements IGetJobsUseCase {
  constructor(
    @Inject(JOB_REPOSITORY)
    private readonly jobRepository: IJobRepository,
  ) {}

  async getJobs(query: GetJobsQuery): Promise<Job[]> {
    if (query.role === 'admin') {
      return this.jobRepository.findAll(query.filterUserId);
    }
    // Regular users can only see their own jobs
    return this.jobRepository.findByUserId(query.userId);
  }

  async getJobById(query: GetJobByIdQuery): Promise<Job> {
    const job = await this.jobRepository.findById(query.jobId);
    if (!job) {
      throw new NotFoundException(`Job with ID ${query.jobId} not found`);
    }

    if (query.role !== 'admin' && job.user_id !== query.userId) {
      throw new ForbiddenException('You do not have access to this job');
    }

    return job;
  }
}
