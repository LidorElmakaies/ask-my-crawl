/**
 * Implemented by the Infrastructure layer (KafkajsEventPublisher, this same lib). Consumed by
 * every service's Application layer (e.g. CreateJobService/SaveJobResultService in Job Manager
 * Service, ProcessUrlService in the Scraper) — Application code never imports kafkajs directly,
 * only this interface. See docs/specs/backend-architecture.md's "Kafka producers are
 * Infrastructure, not API" rule.
 *
 * One shared interface + implementation for every service, not a per-app copy: this used to be
 * duplicated byte-for-byte (save the `clientId`) across Job Manager Service, the Scraper, and a
 * narrower single-topic version in the Gateway — extracted here once a 2nd/3rd/4th consumer made
 * the duplication real instead of hypothetical.
 */
export interface IEventPublisher {
  publish<T extends object>(
    topic: string,
    key: string,
    message: T,
  ): Promise<void>;
}
