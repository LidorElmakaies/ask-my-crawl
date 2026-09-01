import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import type { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import type {
  ForwardQueryOptions,
  ProxyResponse,
} from '../application/interfaces/jobs-proxy-service.interface';
import type { IJobServiceClient } from './interfaces/job-service-client.interface';

@Injectable()
export class JobServiceHttpClient implements IJobServiceClient {
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpService,
    config: ConfigService,
  ) {
    const jobManagerUrl = config.get<string>('JOB_MANAGER_URL');
    if (!jobManagerUrl) {
      throw new Error('JOB_MANAGER_URL is not configured');
    }
    this.baseUrl = jobManagerUrl;
  }

  async forward(options: ForwardQueryOptions): Promise<ProxyResponse> {
    try {
      const response = await firstValueFrom(
        this.http.request({
          method: 'GET',
          url: `${this.baseUrl}${options.path}`,
          params: options.queryUserId
            ? { user_id: options.queryUserId }
            : undefined,
          headers: {
            ...(options.authorizationHeader
              ? { Authorization: options.authorizationHeader }
              : {}),
            'x-user-id': options.userId,
            'x-user-role': options.role,
          },
          validateStatus: () => true,
        }),
      );

      return {
        statusCode: response.status,
        data: response.data as unknown,
      };
    } catch (err) {
      const axiosErr = err as AxiosError;
      return {
        statusCode: 502,
        data: {
          error: {
            code: 'job_manager_service_unreachable',
            message: axiosErr.message,
          },
        },
      };
    }
  }

  async retryJob(
    jobId: string,
    userId: string,
    role: string,
    authorizationHeader?: string,
  ): Promise<ProxyResponse> {
    try {
      const response = await firstValueFrom(
        this.http.request({
          method: 'POST',
          url: `${this.baseUrl}/jobs/${jobId}/retry`,
          headers: {
            ...(authorizationHeader
              ? { Authorization: authorizationHeader }
              : {}),
            'x-user-id': userId,
            'x-user-role': role,
          },
          validateStatus: () => true,
        }),
      );

      return {
        statusCode: response.status,
        data: response.data as unknown,
      };
    } catch (err) {
      const axiosErr = err as AxiosError;
      return {
        statusCode: 502,
        data: {
          error: {
            code: 'job_manager_service_unreachable',
            message: axiosErr.message,
          },
        },
      };
    }
  }
}
