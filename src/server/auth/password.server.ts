import { createHash } from "node:crypto";

/**
 * NOTE: unsalted SHA-256 is what existing `access_codes.password_hash` rows use,
 * so it is kept for compatibility. Moving to a salted KDF (argon2/scrypt) means
 * a data migration — do it here, in one place, when you're ready.
 */
export function hashPassword(password: string): string {
  return createHash("sha256").update(password, "utf8").digest("hex");
}

/** Checks a plaintext password against a stored `password_hash` row. */
export function verifyPasswordHash(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}
