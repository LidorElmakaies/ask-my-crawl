import { Controller, Inject } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { KAFKA_TOPICS, type PageScrapedMessage } from '@app/kafka-contracts';
import { INDEX_INTAKE_USE_CASE } from '../tokens';
import type { IIndexIntakeUseCase } from '../application/interfaces/index-intake-use-case.interface';

// Index Intake Consumer — trivial passthrough, mirrors the Scraper's FrontierConsumer. No logic
// here; see IndexIntakeService for the actual bridge-onto-BullMQ behavior.
@Controller()
export class IndexIntakeConsumer {
  constructor(
    @Inject(INDEX_INTAKE_USE_CASE)
    private readonly useCase: IIndexIntakeUseCase,
  ) {}

  @EventPattern(KAFKA_TOPICS.PAGE_SCRAPED)
  async handle(@Payload() message: PageScrapedMessage): Promise<void> {
    await this.useCase.handle(message);
  }
}
