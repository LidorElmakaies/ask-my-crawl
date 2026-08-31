// Pure URL helpers — no framework/infra dependency. See
// docs/planning/03-crawler-scraper-indexing-plan.md §2/§3 for the rationale.
import { createHash } from 'crypto';

/** Strips only the URL fragment (#...) — a fragment never reaches the server, so dropping it
 * can't lose content. Query strings and everything else stay untouched. */
export function stripFragment(url: string): string {
  return url.split('#')[0];
}

/** Ignores a leading `www.` on either side. No broader subdomain folding. */
export function sameDomain(a: string, b: string): boolean {
  const normalize = (host: string) => host.replace(/^www\./i, '').toLowerCase();
  return normalize(a) === normalize(b);
}

/** Throws if `url` isn't a parseable absolute URL (e.g. a `mailto:`/`javascript:` href) — callers
 * should catch and skip. */
export function hostnameOf(url: string): string {
  return new URL(url).hostname;
}

/** sha256 of the fragment-stripped URL — used for the SeaweedFS blob key and the
 * crawl-frontier/page-scraped partition keys. */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
