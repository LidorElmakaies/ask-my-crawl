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
  /** Returns null when no row matches jobId — the caller decides what "missing" means. Also
   * clears failed_reason to null. */
  saveResult(jobId: string, result: string): Promise<Job | null>;
  /** Sets failed_reason, leaves result untouched. */
  saveFailure(jobId: string, failedReason: string): Promise<Job | null>;
  clearFailureForRetry(jobId: string): Promise<Job | null>;
  findByUserId(userId: string): Promise<Job[]>;
  findAll(filterUserId?: string): Promise<Job[]>;
  findById(jobId: string): Promise<Job | null>;
}
