export interface HashResult {
  hash: string;
  salt: string;
}

/**
 * Implemented by the Infrastructure layer (SaltPepperSha256Hasher, per docs/specs/auth.md's
 * exact formula). Consumed by the Application layer (AuthService). Swapping the hashing
 * scheme entirely is one new class here plus one DI binding in auth.module.ts.
 */
export interface IPasswordHasher {
  /** Generates a new random salt and returns the hash + salt to store. */
  hash(plaintext: string): HashResult;
  /** Recomputes the hash with the stored salt and compares. */
  verify(plaintext: string, hash: string, salt: string): boolean;
}
