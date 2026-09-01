import { Controller, Inject } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { KAFKA_TOPICS, type CrawlCompleteMessage } from '@app/kafka-contracts';
import { ANSWERING_USE_CASE } from '../tokens';
import type { IAnsweringUseCase } from '../application/interfaces/answering-use-case.interface';

@Controller()
export class CrawlCompleteConsumer {
  constructor(
    @Inject(ANSWERING_USE_CASE)
    private readonly useCase: IAnsweringUseCase,
  ) {}

  @EventPattern(KAFKA_TOPICS.CRAWL_COMPLETE)
  async handle(@Payload() message: CrawlCompleteMessage): Promise<void> {
    await this.useCase.handle(message);
  }
}
