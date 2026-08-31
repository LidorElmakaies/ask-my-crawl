/** Implemented by KafkajsEventPublisher (this lib). Consumed by every service's Application layer
 * — Application code never imports kafkajs directly, only this interface. */
export interface IEventPublisher {
  publish<T extends object>(
    topic: string,
    key: string,
    message: T,
  ): Promise<void>;
}
