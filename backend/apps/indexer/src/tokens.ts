// DI injection tokens for the Indexer app. Application-layer and Infrastructure-layer classes are
// only ever referenced by their interface + token — never imported by concrete class name outside
// indexer.module.ts. See docs/specs/backend-architecture.md. Mirrors the Scraper's tokens.ts shape.

export const INDEX_INTAKE_USE_CASE = Symbol('IIndexIntakeUseCase');
export const INDEXING_USE_CASE = Symbol('IIndexingUseCase');

export const COORDINATION_STORE = Symbol('ICoordinationStore');
export const BLOB_REPOSITORY = Symbol('IBlobRepository');
export const INDEX_PAGE_QUEUE = Symbol('IIndexPageQueue');
export const TEXT_EXTRACTOR = Symbol('ITextExtractor');
export const CHUNKER = Symbol('IChunker');
export const EMBEDDING_CLIENT = Symbol('IEmbeddingClient');
export const VECTOR_STORE = Symbol('IVectorStore');
// Bound via useFactory to the shared @app/kafka-client publisher (clientId 'indexer') — see
// backend/libs/kafka-client, not a local Kafka producer file.
export const EVENT_PUBLISHER = Symbol('IEventPublisher');
