/**
 * The signed-in session: a signed, httpOnly cookie that only POINTS at an
 * account. The database stays the source of truth, so on every request the
 * user is re-read:
 *   - a deleted account stops working at once,
 *   - a demoted admin loses admin powers at once,
 *   - a password change signs out every other device (the cookie carries a
 *     fingerprint of the password hash it was issued against).
 *
 * Cookie value:  base64url(JSON payload) + "." + base64url(HMAC-SHA256)
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { CookieOptions, Request, Response } from 'express';
import type { Role, SessionUser } from '@swiftslip/shared/types';

import { config } from '../../../core/config';
import { PasswordService } from '../../../common/shared/services/password.service';
import { UserRepository } from '../../users/repositories';

type Payload = {
  id: string;
  role: Role;
  label: string;
  idNumber: string;
  /** Fingerprint of the account's `password_hash` when this cookie was issued. */
  pw?: string;
  /** Expiry, epoch seconds. */
  exp: number;
};

const userRepository = new UserRepository();

const sign = (body: string): string =>
  createHmac('sha256', config.session.secret).update(body).digest('base64url');

const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: config.runningProd,
  sameSite: 'lax',
  path: '/',
});

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

function decode(token: string | undefined): Payload | null {
  if (!token) return null;
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return null;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    ) as Payload;
    if (!payload.id || typeof payload.exp !== 'number') return null;
    if (payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export class SessionService {
  /** Issue (or re-issue) the cookie for `user`, bound to their current password. */
  static async start(res: Response, user: SessionUser): Promise<void> {
    // Read the hash here rather than carrying it through SessionUser: the
    // sign-in response goes to the browser and must never contain it.
    const row = await userRepository.findOne(
      { id: user.id },
      { select: 'password_hash' },
    );
    const payload: Payload = {
      id: user.id,
      role: user.role,
      label: user.label,
      idNumber: user.idNumber,
      exp: Math.floor(Date.now() / 1000) + config.session.maxAgeSeconds,
      ...(row?.password_hash
        ? { pw: PasswordService.fingerprint(row.password_hash) }
        : {}),
    };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    res.cookie(config.session.cookieName, `${body}.${sign(body)}`, {
      ...cookieOptions(),
      maxAge: config.session.maxAgeSeconds * 1000,
    });
  }

  static end(res: Response): void {
    res.clearCookie(config.session.cookieName, cookieOptions());
  }

  /** The signed-in user revalidated against the database, or `null`. */
  static async currentUser(
    req: Request,
    res: Response,
  ): Promise<SessionUser | null> {
    const payload = decode(readCookie(req, config.session.cookieName));
    if (!payload) return null;

    const row = await userRepository.findOne(
      { id: payload.id },
      { select: 'id,role,id_number,password_hash' },
    );

    // Deleted while the cookie was alive, or a role we do not know.
    if (!row || (row.role !== 'admin' && row.role !== 'user')) {
      SessionService.end(res);
      return null;
    }

    // Password changed since this cookie was issued → signed out here.
    if (
      payload.pw &&
      row.password_hash &&
      payload.pw !== PasswordService.fingerprint(row.password_hash)
    ) {
      SessionService.end(res);
      return null;
    }

    return {
      id: row.id,
      role: row.role,
      label: payload.label ?? '',
      // The admin can rename an ID number; the database is authoritative.
      idNumber: row.id_number ?? '',
    };
  }
}
