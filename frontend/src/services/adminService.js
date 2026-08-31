import { URLS } from '../config/urls';
import { authorizedFetch } from './httpClient';

// Owns the raw HTTP calls to the Gateway's /admin/users* routes (docs/specs/api-contracts.md) —
// no Redux knowledge, same shape as authService.js/scraperService.js. adminSlice's thunks call
// these and translate the result into dispatched actions; components never call this directly.

export async function listUsers(token) {
  const response = await authorizedFetch(URLS.admin.users, token);
  return response.json(); // User[]
}

export async function updateUser(token, id, patch) {
  const response = await authorizedFetch(`${URLS.admin.users}/${id}`, token, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return response.json(); // user
}

export async function deleteUser(token, id) {
  // 204, no body — nothing to parse.
  await authorizedFetch(`${URLS.admin.users}/${id}`, token, {
    method: 'DELETE',
  });
}
