/**
 * Implemented by the Infrastructure layer (KafkajsEventPublisher). Consumed by the Application
 * layer (CreateJobService, SaveJobResultService) — Application code never imports kafkajs
 * directly, only this interface. See docs/specs/backend-architecture.md's Kafka-producers-are-
 * Infrastructure rule.
 */
export interface IEventPublisher {
  publish<T extends object>(
    topic: string,
    key: string,
    message: T,
  ): Promise<void>;
}
