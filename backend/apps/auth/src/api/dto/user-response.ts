import type { UserResponseDto } from '@app/dtos';
import type { PublicUser } from '../../models/user';

// The only place PublicUser (Auth Service's own domain model) gets mapped to the shared wire
// shape — that mapping is Auth Service's job alone, so it isn't in @app/dtos with the type.
export function toUserResponse(user: PublicUser): UserResponseDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    phone_number: user.phoneNumber,
    telegram_chat_id: user.telegramChatId,
  };
}
