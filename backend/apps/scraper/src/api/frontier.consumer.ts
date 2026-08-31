import { Controller, Inject } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { KAFKA_TOPICS, type CrawlFrontierMessage } from '@app/kafka-contracts';
import { FRONTIER_INTAKE_USE_CASE } from '../tokens';
import type { IFrontierIntakeUseCase } from '../application/interfaces/frontier-intake-use-case.interface';

// Inbound trigger only — no business logic here, that lives in FrontierIntakeService.
@Controller()
export class FrontierConsumer {
  constructor(
    @Inject(FRONTIER_INTAKE_USE_CASE)
    private readonly useCase: IFrontierIntakeUseCase,
  ) {}

  @EventPattern(KAFKA_TOPICS.CRAWL_FRONTIER)
  async handle(@Payload() message: CrawlFrontierMessage): Promise<void> {
    await this.useCase.handle(message);
  }
}
