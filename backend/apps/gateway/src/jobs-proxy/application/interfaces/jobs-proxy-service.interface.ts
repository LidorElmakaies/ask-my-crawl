export interface CreateJobInput {
  url: string;
  query: string;
}

export interface ProxyResponse {
  statusCode: number;
  data: unknown;
  headers?: Record<string, string>;
}

export interface ForwardQueryOptions {
  path: string;
  userId: string;
  role: string;
  queryUserId?: string;
  authorizationHeader?: string;
}

/**
 * Application layer interface. Implemented by JobsProxyService, consumed by JobsProxyController.
 */
export interface IJobsProxyService {
  /**
   * Dispatches job-requests message to Kafka and returns 202 status.
   */
  createJob(userId: string, input: CreateJobInput): Promise<{ status: string }>;

  /**
   * Forwards GET /jobs or GET /jobs/:id query to Job Manager Service.
   */
  forward(options: ForwardQueryOptions): Promise<ProxyResponse>;

  /**
   * Forwards POST /jobs/:id/retry to Job Manager Service.
   */
  retryJob(
    jobId: string,
    userId: string,
    role: string,
    authorizationHeader?: string,
  ): Promise<ProxyResponse>;
}
