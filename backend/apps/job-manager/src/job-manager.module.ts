import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnswerReadyConsumer } from './api/consumers/answer-ready.consumer';
import { JobRequestsConsumer } from './api/consumers/job-requests.consumer';
import { CreateJobService } from './application/create-job.service';
import { SaveJobResultService } from './application/save-job-result.service';
import { KafkajsEventPublisher } from './infrastructure/kafka/kafkajs-event-publisher';
import { JobEntity } from './infrastructure/postgres/entities/job.entity';
import { TypeOrmJobRepository } from './infrastructure/postgres/typeorm-job.repository';
import {
  CREATE_JOB_USE_CASE,
  EVENT_PUBLISHER,
  JOB_REPOSITORY,
  SAVE_JOB_RESULT_USE_CASE,
} from './tokens';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        url: config.get<string>('DATABASE_URL'),
        entities: [JobEntity],
        // Simplest thing that works for the Docker Compose phase — see docs/specs/auth.md's
        // equivalent note. No migration framework yet; revisit before this ever runs against
        // real prod data.
        synchronize: config.get<string>('NODE_ENV') !== 'production',
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([JobEntity]),
  ],
  controllers: [JobRequestsConsumer, AnswerReadyConsumer],
  providers: [
    { provide: CREATE_JOB_USE_CASE, useClass: CreateJobService },
    { provide: SAVE_JOB_RESULT_USE_CASE, useClass: SaveJobResultService },
    { provide: JOB_REPOSITORY, useClass: TypeOrmJobRepository },
    { provide: EVENT_PUBLISHER, useClass: KafkajsEventPublisher },
  ],
})
export class JobManagerModule {}
