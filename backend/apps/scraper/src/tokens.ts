// DI injection tokens for the Scraper app. Application-layer and Infrastructure-layer classes are
// only ever referenced by their interface + token — never imported by concrete class name outside
// scraper.module.ts. See docs/specs/backend-architecture.md.

export const FRONTIER_INTAKE_USE_CASE = Symbol('IFrontierIntakeUseCase');
export const PROCESS_URL_USE_CASE = Symbol('IProcessUrlUseCase');

export const COORDINATION_STORE = Symbol('ICoordinationStore');
export const BLOB_REPOSITORY = Symbol('IBlobRepository');
export const PAGE_FETCHER = Symbol('IPageFetcher');
export const HTML_LINK_EXTRACTOR = Symbol('IHtmlLinkExtractor');
export const EVENT_PUBLISHER = Symbol('IEventPublisher');
export const PROCESS_URL_QUEUE = Symbol('IProcessUrlQueue');
export const ROBOTS_TXT_CHECKER = Symbol('IRobotsTxtChecker');
