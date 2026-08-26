import { Controller, Inject } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { KAFKA_TOPICS, type JobRequestsMessage } from '@app/kafka-contracts';
import { CREATE_JOB_USE_CASE } from '../../tokens';
import type { ICreateJobUseCase } from '../../application/interfaces/create-job-use-case.interface';

// Inbound trigger only — no business logic here, that lives in CreateJobService (Application
// layer). Same discipline as an HTTP controller: input in, use case invoked, nothing else.
@Controller()
export class JobRequestsConsumer {
  constructor(
    @Inject(CREATE_JOB_USE_CASE) private readonly useCase: ICreateJobUseCase,
  ) {}

  @EventPattern(KAFKA_TOPICS.JOB_REQUESTS)
  async handle(@Payload() message: JobRequestsMessage): Promise<void> {
    await this.useCase.handle(message);
  }
}
