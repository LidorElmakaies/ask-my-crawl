import type { PublicUser } from '../../models/user';

export interface RegisterInput {
  email: string;
  password: string;
  name?: string;
  phoneNumber?: string;
  telegramChatId?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult {
  user: PublicUser;
  tokens: AuthTokens;
}

/**
 * Implemented by the Application layer (AuthService). Consumed by the API layer
 * (AuthController).
 */
export interface IAuthService {
  register(input: RegisterInput): Promise<AuthResult>;
  login(input: LoginInput): Promise<AuthResult>;
  /** Rotates the refresh token — the old one is revoked, a new pair is issued. */
  refresh(refreshToken: string): Promise<AuthTokens>;
  logout(refreshToken: string): Promise<void>;
}
