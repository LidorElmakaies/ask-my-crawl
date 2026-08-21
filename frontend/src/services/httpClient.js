import { parseErrorMessage } from './apiError';

// First authenticated-fetch helper in the codebase (docs/planning/02-admin-dashboard-plan.md) —
// authService.js's register/login calls don't need a token, and no other service module has
// needed one yet. Built as one small reusable wrapper rather than inlining
// `headers: { Authorization: ... }` per call, since more authenticated calls will follow this
// feature (adminService.js today; jobs/me later) — see frontend.md's "build for reuse" rule.
//
// Plain function, no Redux knowledge, same shape as every other service module — callers (thunks)
// pass the token in explicitly (from getState().auth.accessToken), this file never reads the store.
export async function authorizedFetch(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) throw new Error(await parseErrorMessage(response));
  return response;
}
