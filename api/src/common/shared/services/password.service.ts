/**
 * Password hashing — PBKDF2-HMAC-SHA-256.
 *
 * Stored format:  `pbkdf2_sha256$<iterations>$<salt base64>$<hash base64>`
 *
 * Byte-for-byte the same scheme the web app used (WebCrypto PBKDF2 and Node's
 * `pbkdf2` produce identical output), so every existing password keeps working.
 * The iteration count is stored per row, so raising it later is safe: old rows
 * keep verifying and are re-hashed on the next successful sign-in.
 *
 * The oldest rows are a bare 64-char hex SHA-256. They still verify, and are
 * upgraded on sign-in (`needsUpgrade`).
 */
import { createHash, pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const pbkdf2Async = promisify(pbkdf2);

const ALGORITHM = 'pbkdf2_sha256';
const ITERATIONS = 210_000;
const SALT_BYTES = 16;
const KEY_BYTES = 32;
const LEGACY_SHA256 = /^[a-f0-9]{64}$/i;

const equalBytes = (a: Buffer, b: Buffer): boolean =>
  a.length === b.length && timingSafeEqual(a, b);

export class PasswordService {
  static async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const key = await pbkdf2Async(
      password,
      salt,
      ITERATIONS,
      KEY_BYTES,
      'sha256',
    );
    return `${ALGORITHM}$${ITERATIONS}$${salt.toString('base64')}$${key.toString('base64')}`;
  }

  static isLegacy(stored: string): boolean {
    return LEGACY_SHA256.test(stored);
  }

  /** True when a correct sign-in should re-hash the stored value. */
  static needsUpgrade(stored: string): boolean {
    if (PasswordService.isLegacy(stored)) return true;
    const [algorithm, iterations] = stored.split('$');
    return algorithm !== ALGORITHM || Number(iterations) < ITERATIONS;
  }

  static async verify(password: string, stored: string): Promise<boolean> {
    if (!stored) return false;

    if (PasswordService.isLegacy(stored)) {
      const digest = createHash('sha256').update(password, 'utf8').digest();
      return equalBytes(digest, Buffer.from(stored, 'hex'));
    }

    const [algorithm, rawIterations, rawSalt, rawHash] = stored.split('$');
    const iterations = Number(rawIterations);
    if (
      algorithm !== ALGORITHM ||
      !Number.isInteger(iterations) ||
      iterations < 1 ||
      !rawSalt ||
      !rawHash
    ) {
      return false;
    }
    const expected = Buffer.from(rawHash, 'base64');
    const actual = await pbkdf2Async(
      password,
      Buffer.from(rawSalt, 'base64'),
      iterations,
      expected.length || KEY_BYTES,
      'sha256',
    );
    return equalBytes(actual, expected);
  }

  /** Short, non-reversible marker of one stored hash (see SessionService). */
  static fingerprint(storedHash: string): string {
    return createHash('sha256')
      .update(storedHash, 'utf8')
      .digest('hex')
      .slice(0, 16);
  }
}
