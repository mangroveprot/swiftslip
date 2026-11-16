/**
 * The signed-in session: a signed, httpOnly cookie that only POINTS at a row in
 * `sessions`. The database stays the source of truth, so on every request the
 * session and the user are re-read:
 *   - signing out deletes the row, so the cookie (and any copy taken before
 *     signing out) stops working at once,
 *   - a deleted account stops working at once,
 *   - a demoted admin loses admin powers at once,
 *   - a password change signs out every other device (the cookie carries a
 *     fingerprint of the password hash it was issued against).
 *
 * Cookie value:  base64url(JSON payload) + "." + base64url(HMAC-SHA256)
 */
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import type { CookieOptions, Request, Response } from 'express';
import type { Role, SessionUser } from '@swiftslip/shared/types';

import { config } from '../../../core/config';
import { ErrorResponse } from '../../../common/shared';
import { PasswordService } from '../../../common/shared/services/password.service';
import { UserRepository } from '../../users/repositories';
import { SessionRepository } from '../repositories';

type Payload = {
  /** Which session row this cookie names (random; the row id stays server-side). */
  sid: string;
  id: string;
  role: Role;
  label: string;
  idNumber: string;
  /** Fingerprint of the account's `password_hash` when this cookie was issued. */
  pw?: string;
  /** Expiry, epoch seconds. */
  exp: number;
};

export type SessionContext = {
  ip: string;
  userAgent: string;
  /** "Keep me signed in": the long lifetime instead of the ordinary one. */
  rememberMe: boolean;
};

/** A session's `last_seen_at` is refreshed at most this often. */
const TOUCH_INTERVAL_MS = 60_000;

/** A device that keeps signing in must not grow the table without limit. */
const MAX_SESSIONS_PER_USER = 10;

const sessionRepository = new SessionRepository();
const userRepository = new UserRepository();

const sign = (body: string): string =>
  createHmac('sha256', config.session.secret).update(body).digest('base64url');

/** What the table stores: never the value that is in the cookie. */
const hashId = (sessionId: string): string =>
  createHash('sha256').update(sessionId, 'utf8').digest('hex');

const lifetimeSeconds = (rememberMe: boolean): number =>
  rememberMe
    ? config.session.rememberMaxAgeSeconds
    : config.session.maxAgeSeconds;

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
  /**
   * Delete the session this request already carries. Called before a new
   * sign-in issues its own row: a stale login tab in the same browser must not
   * leave the older cookie alive after the user signs out of the newer one.
   */
  static async revokePresented(req: Request): Promise<void> {
    const payload = decode(readCookie(req, config.session.cookieName));
    if (!payload?.sid) return;
    await sessionRepository.deleteMany({ token_hash: hashId(payload.sid) });
  }

  /**
   * Issue a cookie and the row it points at. The old behavior (a cookie with
   * everything inside) is gone: this is what makes sign-out final.
   */
  static async start(
    res: Response,
    user: SessionUser,
    context: SessionContext,
  ): Promise<string> {
    // Read the hash here rather than carrying it through SessionUser: the
    // sign-in response goes to the browser and must never contain it.
    const row = await userRepository.findOne(
      { id: user.id },
      { select: 'password_hash' },
    );

    const sid = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      Date.now() + lifetimeSeconds(context.rememberMe) * 1000,
    );

    const session = await sessionRepository.create({
      user_id: user.id,
      token_hash: hashId(sid),
      remembered: context.rememberMe,
      ip: (context.ip ?? '').slice(0, 100),
      user_agent: (context.userAgent ?? '').slice(0, 400),
      last_seen_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
    });

    const payload: Payload = {
      sid,
      id: user.id,
      role: user.role,
      label: user.label,
      idNumber: user.idNumber,
      exp: Math.floor(expiresAt.getTime() / 1000),
      ...(row?.password_hash
        ? { pw: PasswordService.fingerprint(row.password_hash) }
        : {}),
    };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    res.cookie(config.session.cookieName, `${body}.${sign(body)}`, {
      ...cookieOptions(),
      maxAge: Math.max(0, payload.exp * 1000 - Date.now()),
    });

    // Housekeeping, never worth failing a sign-in over.
    void sessionRepository.pruneExpired().catch(() => undefined);
    void SessionService.trim(user.id, session.id).catch(() => undefined);

    return session.id;
  }

  /**
   * Keep only the newest `MAX_SESSIONS_PER_USER` rows for one account. The row
   * just issued is never a candidate: `created_at` can tie inside one
   * millisecond, and the sign-in that is happening must not delete itself.
   */
  private static async trim(userId: string, keepId: string): Promise<void> {
    const rows = await sessionRepository.findAll(
      { user_id: userId },
      { select: 'id', sort: { created_at: 'desc' } },
    );
    const stale = rows
      .slice(MAX_SESSIONS_PER_USER)
      .map((row) => row.id)
      .filter((id) => id !== keepId);
    if (stale.length) await sessionRepository.deleteMany({ id: stale });
  }

  /**
   * Replace this device's session with a fresh one (new password fingerprint)
   * and sign every other device of the account out.
   */
  static async rotate(
    req: Request,
    res: Response,
    user: SessionUser,
  ): Promise<void> {
    const payload = decode(readCookie(req, config.session.cookieName));
    const current = payload?.sid
      ? await sessionRepository.findByTokenHash(hashId(payload.sid))
      : null;

    // The row was revoked between `authenticate` and here (an admin kick, or
    // signing out in another tab). Never mint a fresh session for it.
    if (!current) throw new ErrorResponse('UNAUTHORIZED');

    const id = await SessionService.start(res, user, {
      ip: req.ip ?? '',
      userAgent: req.headers['user-agent'] ?? '',
      rememberMe: current.remembered,
    });

    await sessionRepository.deleteMany({
      user_id: user.id,
      id: { neq: id },
    });
  }

  /** Revoke the session this request carries, then drop the cookie. */
  static async end(req: Request, res: Response): Promise<void> {
    const payload = decode(readCookie(req, config.session.cookieName));
    if (payload?.sid) {
      await sessionRepository.deleteMany({
        token_hash: hashId(payload.sid),
      });
    }
    res.clearCookie(config.session.cookieName, cookieOptions());
  }

  /** The signed-in user revalidated against the database, or `null`. */
  static async currentUser(
    req: Request,
    res: Response,
  ): Promise<SessionUser | null> {
    const payload = decode(readCookie(req, config.session.cookieName));
    if (!payload) return null;

    // A cookie from before sessions were stored server-side can no longer be
    // trusted: nothing revokes it. Sign that device in again.
    if (!payload.sid) {
      res.clearCookie(config.session.cookieName, cookieOptions());
      return null;
    }

    const session = await sessionRepository.findByTokenHash(
      hashId(payload.sid),
    );
    if (!session || session.user_id !== payload.id) {
      res.clearCookie(config.session.cookieName, cookieOptions());
      return null;
    }

    if (new Date(session.expires_at).getTime() <= Date.now()) {
      await sessionRepository.deleteMany({ id: session.id });
      res.clearCookie(config.session.cookieName, cookieOptions());
      return null;
    }

    const row = await userRepository.findOne(
      { id: payload.id },
      { select: 'id,role,id_number,password_hash' },
    );

    // Deleted while the cookie was alive, or a role we do not know.
    if (!row || (row.role !== 'admin' && row.role !== 'user')) {
      await sessionRepository.deleteMany({ id: session.id });
      res.clearCookie(config.session.cookieName, cookieOptions());
      return null;
    }

    // Password changed since this cookie was issued → signed out here.
    if (
      payload.pw &&
      row.password_hash &&
      payload.pw !== PasswordService.fingerprint(row.password_hash)
    ) {
      await sessionRepository.deleteMany({ id: session.id });
      res.clearCookie(config.session.cookieName, cookieOptions());
      return null;
    }

    // Cheap liveness for the admin panel's "Last seen" column. Failures are
    // irrelevant to the request that is already authorized.
    const seen = new Date(session.last_seen_at).getTime();
    if (Number.isFinite(seen) && Date.now() - seen > TOUCH_INTERVAL_MS) {
      void sessionRepository
        .updateMany(
          { id: session.id },
          { last_seen_at: new Date().toISOString() },
        )
        .catch(() => undefined);
    }

    req.sessionId = session.id;

    return {
      id: row.id,
      role: row.role,
      label: payload.label ?? '',
      // The admin can rename an ID number; the database is authoritative.
      idNumber: row.id_number ?? '',
    };
  }
}
