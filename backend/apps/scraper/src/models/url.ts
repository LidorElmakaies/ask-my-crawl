// Pure URL helpers — no framework/infra dependency, zero side effects. Both decisions below were
// made directly with the user (2026-08-28); see docs/planning/03-crawler-scraper-indexing-plan.md
// §2/§3 for the full reasoning.
import { createHash } from 'crypto';

/**
 * Strips the URL fragment (#...) only — the one normalization step this project actually wants.
 * A fragment never reaches the server (page.html#a and page.html#b are byte-identical responses),
 * so dropping it can't lose content. Query strings and everything else stay untouched — an
 * earlier draft proposed stripping those too and was rejected: a different `?query=...` string can
 * legitimately serve different content.
 */
export function stripFragment(url: string): string {
  return url.split('#')[0];
}

/**
 * "Same domain" ignores a leading `www.` on either side — www.example.com and example.com match.
 * No broader subdomain folding: blog.example.com is a *different* domain from example.com.
 */
export function sameDomain(a: string, b: string): boolean {
  const normalize = (host: string) => host.replace(/^www\./i, '').toLowerCase();
  return normalize(a) === normalize(b);
}

/** Throws if `url` isn't a parseable absolute URL — callers filtering extracted links should
 * expect this (e.g. a `mailto:`/`javascript:` href) and skip rather than propagate. */
export function hostnameOf(url: string): string {
  return new URL(url).hostname;
}

/** Used for both the SeaweedFS blob key and the `crawl-frontier`/`page-scraped` partition keys —
 * all three are deliberately the same value (sha256 of the fragment-stripped URL), see
 * docs/planning/03-crawler-scraper-indexing-plan.md §5/§8. */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
