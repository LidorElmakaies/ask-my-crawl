import { Inject, Injectable } from '@nestjs/common';
import { JOB_REQUESTS_PUBLISHER, JOB_SERVICE_CLIENT } from '../../tokens';
import type { IJobRequestsPublisher } from '../infrastructure/interfaces/job-requests-publisher.interface';
import type { IJobServiceClient } from '../infrastructure/interfaces/job-service-client.interface';
import type {
  CreateJobInput,
  ForwardQueryOptions,
  IJobsProxyService,
  ProxyResponse,
} from './interfaces/jobs-proxy-service.interface';

@Injectable()
export class JobsProxyService implements IJobsProxyService {
  constructor(
    @Inject(JOB_REQUESTS_PUBLISHER)
    private readonly publisher: IJobRequestsPublisher,
    @Inject(JOB_SERVICE_CLIENT)
    private readonly client: IJobServiceClient,
  ) {}

  async createJob(
    userId: string,
    input: CreateJobInput,
  ): Promise<{ status: string }> {
    await this.publisher.publish({
      user_id: userId,
      url: input.url,
      query: input.query,
    });

    return { status: 'accepted' };
  }

  async forward(options: ForwardQueryOptions): Promise<ProxyResponse> {
    return this.client.forward(options);
  }

  async retryJob(
    jobId: string,
    userId: string,
    role: string,
    authorizationHeader?: string,
  ): Promise<ProxyResponse> {
    return this.client.retryJob(jobId, userId, role, authorizationHeader);
  }
}
