import type { UserRole } from '@app/auth-kernel';

/**
 * Wire shape of the `user` object in docs/specs/api-contracts.md (snake_case) — the response
 * type both Auth Service (constructing it) and Gateway (proxying/relaying it) agree on. Just
 * the shape: the mapper that builds one from a domain User lives in Auth Service itself
 * (apps/auth/src/api/dto/user-response.ts), since only Auth Service knows its own domain model.
 */
export interface UserResponseDto {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  phone_number: string | null;
  telegram_chat_id: string | null;
}
