import type { Job } from '../../models/job';

export interface GetJobsQuery {
  userId: string;
  role: string;
  filterUserId?: string;
}

export interface GetJobByIdQuery {
  jobId: string;
  userId: string;
  role: string;
}

export interface IGetJobsUseCase {
  getJobs(query: GetJobsQuery): Promise<Job[]>;
  getJobById(query: GetJobByIdQuery): Promise<Job | null>;
}
