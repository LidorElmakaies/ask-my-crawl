import { URLS } from '../config/urls';

// Owns the raw HTTP call and nothing else — no Redux knowledge. scraperSlice's thunk calls
// this and translates the result into dispatched actions; components never call this directly.
export async function submitScrapeRequest(url) {
  const response = await fetch(URLS.gateway.scrape, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
