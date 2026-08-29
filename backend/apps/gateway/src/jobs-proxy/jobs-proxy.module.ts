import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { AuthKernelModule } from '@app/auth-kernel';
import { JobsProxyController } from './api/jobs-proxy.controller';
import { JobsProxyService } from './application/jobs-proxy.service';
import { JobServiceHttpClient } from './infrastructure/job-service-http.client';
import { KafkaJobRequestsPublisher } from './infrastructure/kafka-job-requests.publisher';
import {
  JOB_REQUESTS_PUBLISHER,
  JOB_SERVICE_CLIENT,
  JOBS_PROXY_SERVICE,
} from '../tokens';

@Module({
  imports: [HttpModule, ConfigModule, AuthKernelModule],
  controllers: [JobsProxyController],
  providers: [
    { provide: JOBS_PROXY_SERVICE, useClass: JobsProxyService },
    { provide: JOB_SERVICE_CLIENT, useClass: JobServiceHttpClient },
    {
      provide: JOB_REQUESTS_PUBLISHER,
      useClass: KafkaJobRequestsPublisher,
    },
  ],
  exports: [JOBS_PROXY_SERVICE],
})
export class JobsProxyModule {}
