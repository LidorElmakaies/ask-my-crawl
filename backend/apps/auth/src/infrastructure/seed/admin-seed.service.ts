import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PASSWORD_HASHER, USER_REPOSITORY } from '../../tokens';
import type { IPasswordHasher } from '../interfaces/password-hasher.interface';
import type { IUserRepository } from '../interfaces/user-repository.interface';

/**
 * Env-based first-admin bootstrap (docs/specs/auth.md flagged this as an open item — resolved
 * here). If ADMIN_EMAIL/ADMIN_PASSWORD are set and no admin exists yet: promote that user to
 * admin if they're already registered, otherwise create the account. Safe to leave the env
 * vars set permanently — a no-op once any admin exists.
 */
@Injectable()
export class AdminSeedService implements OnModuleInit {
  private readonly logger = new Logger(AdminSeedService.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const email = this.config.get<string>('ADMIN_EMAIL');
    const password = this.config.get<string>('ADMIN_PASSWORD');

    if (!email || !password) {
      return;
    }

    if (await this.users.hasAnyAdmin()) {
      return;
    }

    const normalizedEmail = email.toLowerCase();
    const existing = await this.users.findByEmail(normalizedEmail);

    if (existing) {
      await this.users.update(existing.id, { role: 'admin' });
      this.logger.log(`Promoted existing user to admin: ${normalizedEmail}`);
      return;
    }

    const { hash, salt } = this.hasher.hash(password);
    await this.users.create({
      email: normalizedEmail,
      name: 'Admin',
      phoneNumber: null,
      telegramChatId: null,
      passwordHash: hash,
      passwordSalt: salt,
      role: 'admin',
    });
    this.logger.log(`Seeded first admin account: ${normalizedEmail}`);
  }
}
