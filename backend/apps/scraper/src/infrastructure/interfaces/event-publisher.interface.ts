/**
 * Implemented by the Infrastructure layer (KafkajsEventPublisher). Consumed by the Application
 * layer (FrontierIntakeService, ProcessUrlService) — Application code never imports kafkajs
 * directly, only this interface. See docs/specs/backend-architecture.md's Kafka-producers-are-
 * Infrastructure rule. Same shape as job-manager's own IEventPublisher — not shared as a lib
 * because nothing besides each service's own KafkajsEventPublisher implements it.
 */
export interface IEventPublisher {
  publish<T extends object>(
    topic: string,
    key: string,
    message: T,
  ): Promise<void>;
}
