import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import type {
  HashResult,
  IPasswordHasher,
} from '../interfaces/password-hasher.interface';

/**
 * Per docs/specs/auth.md: password_hash = SHA256(PEPPER + salt + plaintext_password).
 * PEPPER is a single server-side secret (env var), never stored in the database — losing the
 * DB alone does not reveal it. Concatenation order must stay fixed between hash and verify.
 */
@Injectable()
export class SaltPepperSha256Hasher implements IPasswordHasher {
  constructor(private readonly config: ConfigService) {}

  hash(plaintext: string): HashResult {
    const salt = randomBytes(16).toString('hex');
    return { hash: this.computeHash(plaintext, salt), salt };
  }

  verify(plaintext: string, hash: string, salt: string): boolean {
    return this.computeHash(plaintext, salt) === hash;
  }

  private computeHash(plaintext: string, salt: string): string {
    return createHash('sha256')
      .update(this.getPepper() + salt + plaintext)
      .digest('hex');
  }

  private getPepper(): string {
    const pepper = this.config.get<string>('PASSWORD_PEPPER');
    if (!pepper) {
      throw new Error('PASSWORD_PEPPER is not configured');
    }
    return pepper;
  }
}
