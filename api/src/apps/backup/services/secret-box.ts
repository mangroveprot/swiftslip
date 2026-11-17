import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import { config } from '../../../core/config';

/**
 * The bits of crypto Settings → Backup needs, in one place.
 *
 * The Drive refresh token is a long-lived credential for the admin's own Google
 * account. It has to be writable from the page (unlike a `*_KEY` env var), so
 * it lives in `backup_settings.refresh_token` — sealed, never in clear. The key
 * is derived from SESSION_SECRET, the one secret the deployment already holds,
 * so a leaked database row alone cannot be replayed against Google. Rotating
 * SESSION_SECRET makes the stored copy unreadable: the admin just reconnects.
 */

const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

function key(): Buffer {
  return createHash('sha256')
    .update(`swiftslip:backup:${config.session.secret}`)
    .digest();
}

/** `v1.<iv>.<tag>.<ciphertext>`, each part base64url. */
export function seal(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

/** The plaintext, or null when the value is missing, damaged or another key's. */
export function open(sealed: string | null | undefined): string | null {
  if (!sealed) return null;
  const [version, ivPart, tagPart, cipherPart] = sealed.split('.');
  if (version !== VERSION || !ivPart || !tagPart || !cipherPart) return null;
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key(),
      Buffer.from(ivPart, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(cipherPart, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // Wrong key or tampered value: treat it as "not connected".
    return null;
  }
}

/** A fresh bearer token for the cron link. 24 bytes → 48 hex characters. */
export function newCronToken(): string {
  return randomBytes(24).toString('hex');
}

/**
 * Constant-time compare for the cron token.
 *
 * Both sides are hashed first, so the comparison takes the same time whatever
 * the attacker's string length is (timingSafeEqual throws on length mismatch,
 * which would itself leak the length).
 */
export function sameSecret(candidate: string, expected: string): boolean {
  if (!candidate || !expected) return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(candidate), digest(expected));
}
