import { URLS } from '../config/urls';
import { authorizedFetch } from './httpClient';

/**
 * Pure I/O service functions for Jobs API.
 * Never accesses Redux store or dispatches actions directly.
 */

/**
 * Fetches the user's historical jobs (or all jobs if admin).
 * @param {string} token - Bearer access token
 * @returns {Promise<Array<{ id: string, user_id: string, url: string, query: string, result: string | null }>>}
 */
export async function fetchJobs(token) {
  const response = await authorizedFetch(URLS.jobs.list, token);
  return response.json();
}

/**
 * Submits an asynchronous crawl & answer job.
 * @param {string} token - Bearer access token
 * @param {{ url: string, query: string, depth?: number }} input - URL, question, and an optional
 *   crawl-hop budget (1..MAX_CRAWL_DEPTH)
 * @returns {Promise<{ status: string }>}
 */
export async function createJob(token, { url, query, depth }) {
  const response = await authorizedFetch(URLS.jobs.list, token, {
    method: 'POST',
    body: JSON.stringify({ url, query, depth }),
  });
  return response.json();
}

/**
 * Retries a failed job — re-queues it for a fresh answer attempt.
 * @param {string} token - Bearer access token
 * @param {string} jobId - Job id to retry
 * @returns {Promise<{ status: string }>}
 */
export async function retryJob(token, jobId) {
  const response = await authorizedFetch(
    `${URLS.jobs.list}/${jobId}/retry`,
    token,
    {
      method: 'POST',
    },
  );
  return response.json();
}
