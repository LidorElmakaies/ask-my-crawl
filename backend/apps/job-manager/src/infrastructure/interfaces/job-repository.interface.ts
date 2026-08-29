import type { Job } from '../../models/job';

export interface CreateJobInput {
  user_id: string;
  url: string;
  query: string;
}

/**
 * Implemented by the Infrastructure layer (TypeOrmJobRepository). Consumed by the Application
 * layer (CreateJobService, SaveJobResultService).
 */
export interface IJobRepository {
  create(input: CreateJobInput): Promise<Job>;
  /** Returns null when no row matches jobId — the caller decides what "missing" means. */
  saveResult(jobId: string, result: string): Promise<Job | null>;
  findByUserId(userId: string): Promise<Job[]>;
  findAll(filterUserId?: string): Promise<Job[]>;
  findById(jobId: string): Promise<Job | null>;
}

