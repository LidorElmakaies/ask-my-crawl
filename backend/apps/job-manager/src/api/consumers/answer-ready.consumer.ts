import { Controller, Inject } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { KAFKA_TOPICS, type AnswerReadyMessage } from '@app/kafka-contracts';
import { SAVE_JOB_RESULT_USE_CASE } from '../../tokens';
import type { ISaveJobResultUseCase } from '../../application/interfaces/save-job-result-use-case.interface';

// Inbound trigger only — no business logic here, that lives in SaveJobResultService
// (Application layer).
@Controller()
export class AnswerReadyConsumer {
  constructor(
    @Inject(SAVE_JOB_RESULT_USE_CASE)
    private readonly useCase: ISaveJobResultUseCase,
  ) {}

  @EventPattern(KAFKA_TOPICS.ANSWER_READY)
  async handle(@Payload() message: AnswerReadyMessage): Promise<void> {
    await this.useCase.handle(message);
  }
}
