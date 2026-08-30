import { Inject, Injectable } from '@nestjs/common';
import {
  KAFKA_TOPICS,
  type CrawlFrontierMessage,
  type PageScrapedMessage,
} from '@app/kafka-contracts';
import {
  BLOB_REPOSITORY,
  COORDINATION_STORE,
  EVENT_PUBLISHER,
  HTML_LINK_EXTRACTOR,
  PAGE_FETCHER,
  ROBOTS_TXT_CHECKER,
} from '../tokens';
import { PermanentFetchError } from '../models/permanent-fetch-error';
import {
  hostnameOf,
  sameDomain,
  sha256Hex,
  stripFragment,
} from '../models/url';
import type { IBlobRepository } from '../infrastructure/interfaces/blob-repository.interface';
import type { ICoordinationStore } from '../infrastructure/interfaces/coordination-store.interface';
import type { IEventPublisher } from '@app/kafka-client';
import type { IHtmlLinkExtractor } from '../infrastructure/interfaces/html-link-extractor.interface';
import type { IPageFetcher } from '../infrastructure/interfaces/page-fetcher.interface';
import type { IRobotsTxtChecker } from '../infrastructure/interfaces/robots-txt-checker.interface';
import type { IProcessUrlUseCase } from './interfaces/process-url-use-case.interface';

// A use-case-local classification of the fetched response's Content-Type — nothing outside this
// file's switch dispatch needs it, so it stays here rather than in models/ (see
// backend-architecture.md's "use-case I/O shape stays local" test).
type ContentTypeFamily = 'html' | 'unsupported';

function contentTypeFamily(contentType: string | undefined): ContentTypeFamily {
  const normalized = (contentType ?? '').toLowerCase();
  return normalized.includes('text/html') ? 'html' : 'unsupported';
}

// Scraper Worker's use case — fetch, save, extract+filter+re-publish, per
// docs/planning/03-crawler-scraper-indexing-plan.md §5. See IProcessUrlUseCase's doc comment for
// why handle() and finalizeUrl() are split the way they are.
@Injectable()
export class ProcessUrlService implements IProcessUrlUseCase {
  constructor(
    @Inject(PAGE_FETCHER) private readonly pageFetcher: IPageFetcher,
    @Inject(BLOB_REPOSITORY) private readonly blobRepository: IBlobRepository,
    @Inject(HTML_LINK_EXTRACTOR)
    private readonly linkExtractor: IHtmlLinkExtractor,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
    @Inject(COORDINATION_STORE)
    private readonly coordinationStore: ICoordinationStore,
    @Inject(ROBOTS_TXT_CHECKER)
    private readonly robotsTxtChecker: IRobotsTxtChecker,
  ) {}

  async handle(data: CrawlFrontierMessage): Promise<void> {
    const url = stripFragment(data.url);
    const baseUrl = stripFragment(data.base_url);

    // Checked before every fetch — seed and re-discovered links alike, no exceptions. A
    // robots.txt disallow is permanent (retrying won't change it), so it reuses
    // PermanentFetchError the same way an HTTP 4xx does.
    const allowed = await this.robotsTxtChecker.isAllowed(url);
    if (!allowed) {
      throw new PermanentFetchError(`Disallowed by robots.txt: ${url}`);
    }

    const result = await this.pageFetcher.fetch(url);
    // fetch() throws PermanentFetchError (4xx) or a plain Error (transient) on failure — both
    // propagate straight out of this method for process-url.worker.ts to translate/retry.

    const family = contentTypeFamily(result.contentType);
    if (family === 'html') {
      await this.handleHtmlPage(data, url, baseUrl, result.body);
    } else {
      await this.handleUnsupportedContentType(url, result.contentType);
    }
  }

  async finalizeUrl(
    data: CrawlFrontierMessage,
    outcome: 'succeeded' | 'failed',
  ): Promise<void> {
    const { job_id: jobId, url } = data;

    if (outcome === 'succeeded') {
      await this.coordinationStore.markSucceeded(jobId, url);
    } else {
      await this.coordinationStore.markFailed(jobId, url);
    }

    // Only the Indexer's finalizeIndex() checks for job completion and publishes crawl-complete —
    // see docs/planning/03-crawler-scraper-indexing-plan.md §6.
    await this.coordinationStore.decrementPendingScrape(jobId);
  }

  private async handleHtmlPage(
    data: CrawlFrontierMessage,
    url: string,
    baseUrl: string,
    html: string,
  ): Promise<void> {
    const blobKey = sha256Hex(url);
    await this.blobRepository.save(blobKey, html, 'text/html');

    // Only re-publish children if the NEXT hop would still be within budget — see
    // docs/planning/03-crawler-scraper-indexing-plan.md §5c.
    const childDepth = data.depth - 1;
    if (childDepth > 0) {
      const baseDomain = hostnameOf(baseUrl);
      const rawLinks = this.linkExtractor.extractLinks(html, url);
      for (const rawLink of rawLinks) {
        const child = stripFragment(rawLink);
        let childHost: string;
        try {
          childHost = hostnameOf(child);
        } catch {
          continue; // not a parseable absolute URL (mailto:, javascript:, malformed) — skip
        }
        if (!sameDomain(childHost, baseDomain)) continue;

        const childMessage: CrawlFrontierMessage = {
          job_id: data.job_id,
          user_id: data.user_id,
          url: child,
          depth: childDepth,
          query: data.query,
          base_url: baseUrl, // propagate-only — see crawl-frontier-message.ts
        };
        await this.eventPublisher.publish(
          KAFKA_TOPICS.CRAWL_FRONTIER,
          sha256Hex(child),
          childMessage,
        );
      }
    }

    const pageScraped: PageScrapedMessage = {
      job_id: data.job_id,
      user_id: data.user_id,
      url: data.url, // as discovered, not normalized — event-schemas.md
      normalizedUrl: url,
      blobKey,
      depth: data.depth,
      scrapedAt: new Date().toISOString(),
      query: data.query,
      base_url: baseUrl, // propagate-only — the Indexer needs this for its own crawl-complete
    };
    await this.eventPublisher.publish(
      KAFKA_TOPICS.PAGE_SCRAPED,
      blobKey,
      pageScraped,
    );
  }

  // Deliberate stub — decided 2026-08-28 to leave this extension point in place rather than
  // hardcode "only HTML exists." What actually happens for a second content type (skip silently?
  // save the raw blob without indexing? something else?) isn't decided — implement it for real
  // when one is actually needed, and update docs/planning/03-crawler-scraper-indexing-plan.md's
  // open items when it does. Reuses PermanentFetchError (not a plain Error) since retrying can't
  // fix an unsupported content type any more than it can fix a 404.
  private handleUnsupportedContentType(
    url: string,
    contentType: string | undefined,
  ): Promise<void> {
    // Not `async` — the eslint rule @typescript-eslint/require-await flags an async function that
    // never awaits, and this one only ever throws. Throwing still satisfies the Promise<void>
    // return type (the caller `await`s it either way; a synchronous throw here becomes a rejected
    // promise for handle()'s own returned promise, since it's called from inside an async method).
    throw new PermanentFetchError(
      `Unsupported content type "${contentType ?? 'unknown'}" for ${url} — not implemented`,
    );
  }
}
