import { ErrorResponse } from '../../../common/shared';
import { config } from '../../../core/config';

/**
 * The Google half of Settings → Backup: OAuth (authorization-code flow), the
 * Drive folder, and the resumable upload.
 *
 * Scope is `drive.file` only: the app sees the files IT created and nothing
 * else in the admin's Drive, which is the least privilege that can still make a
 * backup, needs no Google verification review, and keeps the token useless for
 * reading anything else if it ever leaks.
 *
 * No service account. A service account has no Drive storage quota of its own:
 * uploads fail with `storageQuotaExceeded` unless the file goes into a Shared
 * Drive or the account impersonates a user through Workspace delegation. A
 * plain OAuth refresh token for the admin's own account is the honest answer.
 */

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
const USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo';
const FILES_ENDPOINT = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_ENDPOINT = 'https://www.googleapis.com/upload/drive/v3/files';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const DUMP_MIME = 'application/gzip';

/**
 * The prefix every dump of one database is named with: `swiftslip-`, `inventory-`.
 *
 * Retention is counted per database, so the sweep needs to tell the two apart.
 * SwiftSlip keeps the prefix it has always used, so files from before the second
 * database existed are still counted (and pruned) correctly.
 */
export function dumpPrefix(targetId: string): string {
  return `${targetId}-`;
}

/** One Drive call may not hang forever behind a proxy. */
const TIMEOUT_MS = 60_000;

type GoogleError = {
  error?: string | { message?: string; code?: number };
  error_description?: string;
};

/** `{ error }` bodies come in two shapes; both are reduced to one sentence. */
function errorText(body: GoogleError | null, fallback: string): string {
  if (!body) return fallback;
  const nested =
    typeof body.error === 'object' ? body.error?.message : undefined;
  return (
    body.error_description ??
    nested ??
    (typeof body.error === 'string' ? body.error : fallback)
  );
}

async function googleFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new ErrorResponse(
      'DRIVE_ERROR',
      'Could not reach Google. Check that this server can make outbound HTTPS requests, then try again.',
      [],
      error instanceof Error ? error : undefined,
    );
  }
}

async function readJson(response: Response): Promise<GoogleError | null> {
  return (await response.json().catch(() => null)) as GoogleError | null;
}

/** The Connect button is honest about a missing OAuth client. */
export function isConfigured(): boolean {
  return config.backup.google.configured;
}

/** The exact redirect URI this deployment registered with Google. */
export function redirectUri(): string {
  return config.backup.google.redirectUri;
}

/** Where the admin is sent to grant access. `state` comes back on the callback. */
export function buildAuthUrl(state: string): string {
  const { clientId } = config.backup.google;
  const params = new URLSearchParams({
    client_id: clientId ?? '',
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'openid email https://www.googleapis.com/auth/drive.file',
    // offline + consent: without both, a repeat connection returns no
    // refresh_token at all and the backup would die when the access token does.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

/** Code → tokens. The refresh token is the part that is kept. */
export async function exchangeCode(code: string): Promise<{
  refreshToken: string;
  accessToken: string;
  email: string | null;
}> {
  const { clientId, clientSecret } = config.backup.google;
  const response = await googleFetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId ?? '',
      client_secret: clientSecret ?? '',
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  const body = await readJson(response);

  if (!response.ok) {
    throw new ErrorResponse(
      'DRIVE_ERROR',
      `Google refused the connection: ${errorText(body, 'unknown error')}.`,
      [
        `The redirect URI on the OAuth client must be exactly ${redirectUri()}.`,
        'The client must be of type "Web application".',
      ],
    );
  }

  const payload = body as unknown as {
    refresh_token?: string;
    access_token?: string;
  };
  if (!payload.refresh_token || !payload.access_token) {
    throw new ErrorResponse(
      'DRIVE_ERROR',
      'Google did not return a refresh token. Remove SwiftSlip from your Google account’s third-party access, then connect again.',
    );
  }
  return {
    refreshToken: payload.refresh_token,
    accessToken: payload.access_token,
    email: await emailFor(payload.access_token),
  };
}

/**
 * A saved refresh token → a one-hour access token.
 *
 * An `invalid_grant` here almost always means one of two things, both named on
 * the page: the connection was revoked in the Google account, or the OAuth app
 * is still in "Testing" (Google expires those refresh tokens after 7 days).
 */
export async function accessTokenFor(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = config.backup.google;
  const response = await googleFetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId ?? '',
      client_secret: clientSecret ?? '',
      grant_type: 'refresh_token',
    }),
  });
  const body = await readJson(response);

  if (!response.ok) {
    const invalid = body?.error === 'invalid_grant';
    throw new ErrorResponse(
      'BACKUP_NOT_CONNECTED',
      invalid
        ? 'Google no longer accepts the saved Drive connection. Reconnect Google Drive.'
        : `Google rejected the saved Drive connection: ${errorText(body, 'unknown error')}.`,
      invalid
        ? [
            'Publish the OAuth consent screen ("In production"): apps left in "Testing" get a refresh token that dies after 7 days.',
            'Or the access was removed in the Google account’s third-party access page.',
          ]
        : [],
    );
  }

  const payload = body as unknown as { access_token?: string };
  if (!payload.access_token) {
    throw new ErrorResponse(
      'BACKUP_NOT_CONNECTED',
      'Google returned no access token. Reconnect Google Drive.',
    );
  }
  return payload.access_token;
}

/** The signed-in Google address, shown on the page so the admin knows whose Drive it is. */
async function emailFor(accessToken: string): Promise<string | null> {
  const response = await googleFetch(USERINFO_ENDPOINT, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  const body = (await readJson(response)) as unknown as {
    email?: string;
  } | null;
  return body?.email ?? null;
}

/**
 * The dump folder: the saved one when it still exists, otherwise the one named
 * on the settings row, created on the spot. `drive.file` means the search only
 * ever sees folders this app made, so no other "SwiftSlip Backups" is found.
 */
export async function ensureFolder(
  accessToken: string,
  savedFolderId: string | null,
  folderName: string,
): Promise<string> {
  const auth = { authorization: `Bearer ${accessToken}` };

  if (savedFolderId) {
    const check = await googleFetch(
      `${FILES_ENDPOINT}/${encodeURIComponent(savedFolderId)}?fields=id,trashed&supportsAllDrives=true`,
      { headers: auth },
    );
    if (check.ok) {
      const body = (await readJson(check)) as unknown as {
        trashed?: boolean;
      } | null;
      if (!body?.trashed) return savedFolderId;
    }
    // Deleted or unreachable: make a new one rather than failing the backup.
  }

  const query = [
    `name = '${folderName.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`,
    `mimeType = '${FOLDER_MIME}'`,
    'trashed = false',
    "'root' in parents",
  ].join(' and ');
  const found = await googleFetch(
    `${FILES_ENDPOINT}?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=10&supportsAllDrives=true`,
    { headers: auth },
  );
  if (found.ok) {
    const body = (await readJson(found)) as unknown as {
      files?: { id?: string }[];
    } | null;
    const id = body?.files?.[0]?.id;
    if (id) return id;
  }

  const created = await googleFetch(
    `${FILES_ENDPOINT}?fields=id&supportsAllDrives=true`,
    {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({
        name: folderName,
        mimeType: FOLDER_MIME,
        parents: ['root'],
      }),
    },
  );
  const body = (await readJson(created)) as unknown as { id?: string } | null;
  if (!created.ok || !body?.id) {
    throw new ErrorResponse(
      'DRIVE_ERROR',
      `Could not create the "${folderName}" folder in Google Drive: ${errorText(body as GoogleError | null, 'unknown error')}.`,
    );
  }
  return body.id;
}

/**
 * Upload one gzipped dump through a resumable session.
 *
 * Resumable (not `uploadType=media`) because that is the only form that both
 * names the file and carries a parent folder in one call, and it is the same
 * code path a big database would need later.
 */
export async function uploadDump(
  accessToken: string,
  folderId: string,
  fileName: string,
  bytes: Buffer,
  label: string,
): Promise<{ id: string; name: string; size: number }> {
  const auth = { authorization: `Bearer ${accessToken}` };
  const session = await googleFetch(
    `${UPLOAD_ENDPOINT}?uploadType=resumable&supportsAllDrives=true&fields=id,name,size`,
    {
      method: 'POST',
      headers: {
        ...auth,
        'content-type': 'application/json; charset=UTF-8',
        'x-upload-content-type': DUMP_MIME,
        'x-upload-content-length': String(bytes.length),
      },
      body: JSON.stringify({
        name: fileName,
        parents: [folderId],
        mimeType: DUMP_MIME,
        description: `${label} database backup (pg_dump, gzip)`,
      }),
    },
  );

  const location = session.headers.get('location');
  if (!session.ok || !location) {
    const body = await readJson(session);
    throw new ErrorResponse(
      'DRIVE_ERROR',
      `Google Drive refused the upload: ${errorText(body, 'no upload session was created')}.`,
      [
        'Check that the Drive account still has free space.',
        'If the connection is old, reconnect Google Drive.',
      ],
    );
  }

  const upload = await googleFetch(location, {
    method: 'PUT',
    headers: {
      'content-type': DUMP_MIME,
      'content-length': String(bytes.length),
    },
    body: new Uint8Array(bytes),
  });
  const body = (await readJson(upload)) as unknown as {
    id?: string;
    name?: string;
    size?: string;
  } | null;
  if (!upload.ok || !body?.id) {
    throw new ErrorResponse(
      'DRIVE_ERROR',
      `Google Drive refused the file: ${errorText(body as GoogleError | null, 'unknown error')}.`,
    );
  }
  return {
    id: body.id,
    name: body.name ?? fileName,
    size: Number(body.size ?? bytes.length),
  };
}

/**
 * Keep the newest `keep` dumps of ONE database, delete the rest.
 *
 * Runs after a successful upload, best effort: a failed sweep must never turn a
 * finished backup into a failed one, so the caller logs and moves on. Called
 * once per database, because "keep the latest 14" means 14 of each, not 14
 * files shared between them.
 */
export async function pruneDumps(
  accessToken: string,
  folderId: string,
  keep: number,
  prefix: string,
): Promise<number> {
  const auth = { authorization: `Bearer ${accessToken}` };
  const query = [
    `'${folderId}' in parents`,
    'trashed = false',
    `name contains '${prefix}'`,
  ].join(' and ');
  const listed = await googleFetch(
    `${FILES_ENDPOINT}?q=${encodeURIComponent(query)}&orderBy=createdTime desc&pageSize=200&fields=files(id,name,createdTime)&supportsAllDrives=true`,
    { headers: auth },
  );
  if (!listed.ok) return 0;

  const body = (await readJson(listed)) as unknown as {
    files?: { id?: string }[];
  } | null;
  const files = body?.files ?? [];
  let removed = 0;
  for (const file of files.slice(Math.max(0, keep))) {
    if (!file.id) continue;
    const response = await googleFetch(
      `${FILES_ENDPOINT}/${encodeURIComponent(file.id)}?supportsAllDrives=true`,
      { method: 'DELETE', headers: auth },
    );
    if (response.ok) removed += 1;
  }
  return removed;
}

/** Disconnect: remove the grant on Google's side too, not just the local copy. */
export async function revoke(refreshToken: string): Promise<void> {
  await googleFetch(
    `${REVOKE_ENDPOINT}?token=${encodeURIComponent(refreshToken)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    },
  ).catch(() => undefined);
}
