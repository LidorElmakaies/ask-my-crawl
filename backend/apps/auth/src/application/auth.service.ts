import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { JWT_SERVICE, type IJwtService, type UserRole } from '@app/auth-kernel';
import {
  PASSWORD_HASHER,
  REFRESH_TOKEN_REPOSITORY,
  USER_REPOSITORY,
} from '../tokens';
import type { IPasswordHasher } from '../infrastructure/interfaces/password-hasher.interface';
import type { IRefreshTokenRepository } from '../infrastructure/interfaces/refresh-token-repository.interface';
import type { IUserRepository } from '../infrastructure/interfaces/user-repository.interface';
import type {
  AuthResult,
  AuthTokens,
  IAuthService,
  LoginInput,
  RegisterInput,
} from './interfaces/auth-service.interface';
import { toPublicUser } from '../models/user';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_DAYS = 30;

@Injectable()
export class AuthService implements IAuthService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: IRefreshTokenRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
    @Inject(JWT_SERVICE) private readonly jwt: IJwtService,
  ) {}

  async register(input: RegisterInput): Promise<AuthResult> {
    const email = input.email.toLowerCase();
    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const { hash, salt } = this.hasher.hash(input.password);
    const user = await this.users.create({
      email,
      name: input.name ?? null,
      phoneNumber: input.phoneNumber ?? null,
      telegramChatId: input.telegramChatId ?? null,
      passwordHash: hash,
      passwordSalt: salt,
      role: 'user',
    });

    const tokens = await this.issueTokens(user.id, user.role);
    return { user: toPublicUser(user), tokens };
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const email = input.email.toLowerCase();
    const user = await this.users.findByEmail(email);
    if (
      !user ||
      !this.hasher.verify(input.password, user.passwordHash, user.passwordSalt)
    ) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = await this.issueTokens(user.id, user.role);
    return { user: toPublicUser(user), tokens };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const stored = await this.refreshTokens.findByTokenHash(
      this.hashRefreshToken(refreshToken),
    );

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.users.findById(stored.userId);
    if (!user) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Rotate: the used token is revoked no matter what happens next, so a stolen-and-replayed
    // refresh token only ever works once.
    await this.refreshTokens.revoke(stored.id);
    return this.issueTokens(user.id, user.role);
  }

  async logout(refreshToken: string): Promise<void> {
    const stored = await this.refreshTokens.findByTokenHash(
      this.hashRefreshToken(refreshToken),
    );
    if (stored) {
      await this.refreshTokens.revoke(stored.id);
    }
  }

  private async issueTokens(
    userId: string,
    role: UserRole,
  ): Promise<AuthTokens> {
    const accessToken = this.jwt.sign({ sub: userId, role }, ACCESS_TOKEN_TTL);

    const refreshToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(
      Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    );
    await this.refreshTokens.create(
      userId,
      this.hashRefreshToken(refreshToken),
      expiresAt,
    );

    return { accessToken, refreshToken };
  }

  // Refresh tokens are stored hashed (auth.md) — plain SHA-256 with no salt/pepper is fine
  // here specifically: unlike passwords, a refresh token is already a high-entropy random
  // value, not human-guessable, so this only protects against a raw DB leak, not brute force.
  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
