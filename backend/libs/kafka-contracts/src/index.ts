// Shared Kafka payload types + topic/consumer-group name constants — every producing/consuming
// app imports from here instead of redefining a message shape or hardcoding a topic string
// locally. See docs/specs/event-schemas.md for the source-of-truth wire formats.
export * from './topics';
export * from './job-requests-message';
export * from './crawl-frontier-message';
export * from './job-created-message';
export * from './crawl-complete-message';
export * from './answer-ready-message';
export * from './result-saved-message';
