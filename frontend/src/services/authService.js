import { URLS } from '../config/urls';
import { parseErrorMessage } from './apiError';

// Owns the raw HTTP calls to Auth Service and nothing else — no Redux knowledge, same shape as
// scraperService.js. authSlice's thunks call these and translate the result into dispatched
// actions; components never call this directly.
//
// Calls Auth Service directly at its own origin (URLS.auth.origin), not the Gateway — the Gateway
// doesn't proxy /auth/* yet (docs/specs/services.md). Bodies are snake_case exactly as
// docs/specs/api-contracts.md documents; not translated case client-side.

export async function register({ email, password, name, phoneNumber, telegramChatId }) {
  const response = await fetch(`${URLS.auth.origin}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      name,
      phone_number: phoneNumber,
      telegram_chat_id: telegramChatId,
    }),
  });
  if (!response.ok) throw new Error(await parseErrorMessage(response));
  return response.json(); // { user, access_token, refresh_token }
}

export async function login({ email, password }) {
  const response = await fetch(`${URLS.auth.origin}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(await parseErrorMessage(response));
  return response.json(); // { user, access_token, refresh_token }
}
