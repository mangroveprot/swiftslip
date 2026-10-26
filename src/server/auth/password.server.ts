/**
 * Password hashing.
 *
 * PBKDF2-HMAC-SHA-256 through WebCrypto rather than argon2/scrypt: those need a
 * native (or WASM) build, which the Cloudflare Workers runtime this app deploys
 * to does not have. WebCrypto is available on Node, Bun and Workers alike.
 *
 * Stored format:
 *   `pbkdf2_sha256$<iterations>$<salt base64>$<hash base64>`
 *
 * The iteration count is stored with each row, so it can be raised later
 * without invalidating anyone's password:
 *   - an existing row keeps verifying with the count it was written with,
 *   - a successful sign-in re-hashes it with the current count
 *     (`passwordHashNeedsUpgrade` in `services/auth.server.ts`).
 *
 * The legacy format is a bare 64-character hex SHA-256 digest. Those rows are
 * still accepted so nobody is locked out; they upgrade on the next sign-in.
 */
import { createHash } from "node:crypto";

/** Prefix that identifies the current scheme in `users.password_hash`. */
const ALGORITHM = "pbkdf2_sha256";

/**
 * 210,000 iterations is a deliberate balance: high enough to make offline
 * cracking expensive, low enough to stay comfortably inside a Worker's CPU
 * budget. Raising it is safe — rows written with an older count still verify.
 */
const ITERATIONS = 210_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

/** A bare SHA-256 hex digest — the format used before this module changed. */
const LEGACY_SHA256 = /^[a-f0-9]{64}$/i;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function fromHex(value: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(value.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Length-independent, constant-time byte comparison. */
function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

async function derive(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

/** Hash a plaintext password for storage. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, ITERATIONS);
  return `${ALGORITHM}$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

/** True when a stored value predates PBKDF2 (unsalted SHA-256). */
export function isLegacyPasswordHash(stored: string): boolean {
  return LEGACY_SHA256.test(stored);
}

/**
 * True when a successful sign-in should re-hash the stored value: it is either
 * the legacy SHA-256 format or a PBKDF2 row written with fewer iterations than
 * the current setting.
 */
export function passwordHashNeedsUpgrade(stored: string): boolean {
  if (isLegacyPasswordHash(stored)) return true;
  const [algorithm, iterations] = stored.split("$");
  return algorithm !== ALGORITHM || Number(iterations) < ITERATIONS;
}

/** Check a plaintext password against a stored hash, whatever its format. */
export async function verifyPasswordHash(password: string, stored: string): Promise<boolean> {
  if (!stored) return false;

  // Legacy unsalted SHA-256: verify so the account still works, then upgrade.
  if (isLegacyPasswordHash(stored)) {
    const digest = new Uint8Array(createHash("sha256").update(password, "utf8").digest());
    return equalBytes(digest, fromHex(stored));
  }

  const [algorithm, rawIterations, rawSalt, rawHash] = stored.split("$");
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

  const expected = fromBase64(rawHash);
  const actual = await derive(password, fromBase64(rawSalt), iterations);
  return equalBytes(actual, expected);
}
