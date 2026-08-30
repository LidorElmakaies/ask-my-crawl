import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthKernelModule } from '@app/auth-kernel';
import { KafkajsEventPublisher, type IEventPublisher } from '@app/kafka-client';
import { JobsProxyController } from './api/jobs-proxy.controller';
import { JobsProxyService } from './application/jobs-proxy.service';
import { JobServiceHttpClient } from './infrastructure/job-service-http.client';
import { KafkaJobRequestsPublisher } from './infrastructure/kafka-job-requests.publisher';
import {
  EVENT_PUBLISHER,
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
      provide: EVENT_PUBLISHER,
      useFactory: (config: ConfigService) =>
        new KafkajsEventPublisher(config, 'gateway'),
      inject: [ConfigService],
    },
    {
      provide: JOB_REQUESTS_PUBLISHER,
      useFactory: (eventPublisher: IEventPublisher) =>
        new KafkaJobRequestsPublisher(eventPublisher),
      inject: [EVENT_PUBLISHER],
    },
  ],
  exports: [JOBS_PROXY_SERVICE],
})
export class JobsProxyModule {}
