import { createHash } from 'crypto';
import type { ConfigService } from '@nestjs/config';
import { SaltPepperSha256Hasher } from './salt-pepper-sha256.hasher';

function makeHasher(pepper: string | undefined): SaltPepperSha256Hasher {
  const config = {
    get: jest.fn().mockReturnValue(pepper),
  } as unknown as ConfigService;
  return new SaltPepperSha256Hasher(config);
}

describe('SaltPepperSha256Hasher', () => {
  it('produces a hash matching the exact auth.md formula: SHA256(pepper + salt + password)', () => {
    const hasher = makeHasher('pepper-value');
    const { hash, salt } = hasher.hash('correct-horse-battery-staple');

    const expected = createHash('sha256')
      .update('pepper-value' + salt + 'correct-horse-battery-staple')
      .digest('hex');
    expect(hash).toBe(expected);
  });

  it('generates a different salt on every call', () => {
    const hasher = makeHasher('pepper-value');
    const a = hasher.hash('same-password');
    const b = hasher.hash('same-password');

    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it('verify() accepts the correct password against its hash+salt', () => {
    const hasher = makeHasher('pepper-value');
    const { hash, salt } = hasher.hash('correct-password');

    expect(hasher.verify('correct-password', hash, salt)).toBe(true);
  });

  it('verify() rejects a wrong password', () => {
    const hasher = makeHasher('pepper-value');
    const { hash, salt } = hasher.hash('correct-password');

    expect(hasher.verify('wrong-password', hash, salt)).toBe(false);
  });

  it('verify() rejects a correct password hashed under a different pepper', () => {
    const hasherA = makeHasher('pepper-a');
    const hasherB = makeHasher('pepper-b');
    const { hash, salt } = hasherA.hash('correct-password');

    expect(hasherB.verify('correct-password', hash, salt)).toBe(false);
  });

  it('throws if PASSWORD_PEPPER is not configured', () => {
    const hasher = makeHasher(undefined);
    expect(() => hasher.hash('anything')).toThrow(
      'PASSWORD_PEPPER is not configured',
    );
  });
});
