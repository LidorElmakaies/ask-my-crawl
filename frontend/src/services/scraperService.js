import { URLS } from '../config/urls';
import { parseErrorMessage } from './apiError';

// Owns the raw HTTP call and nothing else — no Redux knowledge. scraperSlice's thunk calls
// this and translates the result into dispatched actions; components never call this directly.
export async function submitScrapeRequest({ url, query }) {
  const response = await fetch(URLS.gateway.scrape, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, query }),
  });
  if (!response.ok) throw new Error(await parseErrorMessage(response));
  return response.json();
}
