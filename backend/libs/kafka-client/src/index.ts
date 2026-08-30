// Shared Kafka producer plumbing — every service that publishes a Kafka message imports
// KafkajsEventPublisher from here instead of carrying its own copy. See event-publisher.interface.ts's
// doc comment for why this is a shared lib and not a per-app file.
export * from './event-publisher.interface';
export * from './kafkajs-event-publisher';
