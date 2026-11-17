import { spawn } from 'node:child_process';
import { createGzip } from 'node:zlib';

import { ErrorResponse } from '../../../common/shared';
import { config } from '../../../core/config';
import type { BackupTargetInfo } from '@swiftslip/shared/schemas';

/**
 * `pg_dump` → gzip → one Buffer, for ONE database.
 *
 * Why the binary and not a JavaScript dumper: a correct logical dump has to
 * carry schema, data, constraints and sequences in dependency order, which is
 * exactly what `pg_dump` does and what the `postgres` client in this repo does
 * not. The Docker image installs the matching Postgres client (see Dockerfile).
 *
 * Memory is bounded on purpose. A free 512 MB host cannot buffer an unbounded
 * file, so the gzip stream is capped at BACKUP_MAX_MB and the process is killed
 * when it is passed. This database is a few megabytes gzipped; the cap is a
 * guard rail, not a target. The caller dumps one database at a time (never two
 * buffers at once), which is why this takes a target instead of looping.
 */

/** One database a run dumps: a connection string plus its labels. */
export type DumpTarget = BackupTargetInfo & { url: string };

const VERSION_TIMEOUT_MS = 10_000;
const DUMP_TIMEOUT_MS = 5 * 60_000;
const STDERR_LIMIT = 4_000;
const VERSION_TTL_MS = 5 * 60_000;

let versionCache: { at: number; value: string | null } | null = null;

/**
 * `pg_dump --version`, or null when the binary is missing.
 *
 * Cached: this runs on every Backup page load, and a spawn per page paint is
 * not worth it. `force` re-checks after an admin fixes the environment.
 */
export async function pgDumpVersion(force = false): Promise<string | null> {
  if (!force && versionCache && Date.now() - versionCache.at < VERSION_TTL_MS) {
    return versionCache.value;
  }

  const value = await new Promise<string | null>((resolve) => {
    let output = '';
    let settled = false;
    const finish = (result: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const child = spawn(config.backup.dumpPath, ['--version'], {
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(null);
    }, VERSION_TIMEOUT_MS);

    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
    });
    // ENOENT (not installed / wrong path) lands here.
    child.on('error', () => finish(null));
    child.on('close', (code) => finish(code === 0 ? output.trim() : null));
  });

  versionCache = { at: Date.now(), value };
  return value;
}

/**
 * The connection string → the `PG*` variables pg_dump reads.
 *
 * Passing the URL as an argument would put the database password in the
 * process list; environment variables do not show up there. `sslmode` comes
 * from the URL when present (Supabase needs TLS) and defaults to `require`.
 */
function connectionEnv(url: string, envKey: string): NodeJS.ProcessEnv {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ErrorResponse(
      'SERVICE_UNAVAILABLE',
      `${envKey} is not a valid connection string. It must look like postgresql://user:password@host:5432/database.`,
    );
  }

  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  if (!parsed.hostname || !database) {
    throw new ErrorResponse(
      'SERVICE_UNAVAILABLE',
      `${envKey} is missing the host or the database name.`,
    );
  }

  return {
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || '5432',
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGDATABASE: database,
    PGSSLMODE: parsed.searchParams.get('sslmode') ?? 'require',
  };
}

/**
 * `swiftslip-2026-11-17T02-30-00Z.sql.gz` — sortable, no characters Drive
 * dislikes, and prefixed with the target id so the two dumps of one run never
 * collide and the retention sweep can tell them apart.
 */
export function dumpFileName(targetId: string, now = new Date()): string {
  const stamp = now
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/:/g, '-');
  return `${targetId}-${stamp}.sql.gz`;
}

export type DumpResult = {
  bytes: Buffer;
  fileName: string;
  durationMs: number;
};

/**
 * Take the dump. Throws `ErrorResponse` for every failure the admin can act on
 * (invalid connection string, missing binary, server too new for this pg_dump,
 * size cap, timeout) and for a non-zero exit. The message names the target so a
 * two-database run says which one broke.
 */
export async function dumpDatabase(target: DumpTarget): Promise<DumpResult> {
  const startedAt = Date.now();

  const version = await pgDumpVersion();
  if (!version) {
    throw new ErrorResponse(
      'SERVICE_UNAVAILABLE',
      `pg_dump was not found on this server (looked for "${config.backup.dumpPath}").`,
      [
        'In the Docker image it comes from the postgresql-client package.',
        'On a Windows development machine set PG_DUMP_PATH to the full path of pg_dump.exe.',
      ],
    );
  }

  const maxBytes = config.backup.maxDumpBytes;
  const fileName = dumpFileName(target.id);

  const bytes = await new Promise<Buffer>((resolvePromise, rejectPromise) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let stderr = '';
    let gzipDone = false;
    let exited = false;
    let exitCode: number | null = null;
    let settled = false;

    const child = spawn(
      config.backup.dumpPath,
      [
        '--no-owner',
        '--no-privileges',
        '--clean',
        '--if-exists',
        '--format=plain',
        '--encoding=UTF8',
      ],
      {
        // `process.env` is passed THROUGH to the child, not read for
        // configuration: pg_dump needs PATH to start (and SystemRoot on
        // Windows). Every value this module configures comes from `config`.
        // eslint-disable-next-line no-restricted-properties
        env: { ...process.env, ...connectionEnv(target.url, target.envKey) },
        windowsHide: true,
      },
    );
    const gzip = createGzip({ level: 6 });

    const stop = (error: ErrorResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill('SIGKILL');
      rejectPromise(error);
    };

    /** Runs on the last of the two "finished" signals: child exit + gzip end. */
    const settle = () => {
      if (settled || !gzipDone || !exited) return;
      settled = true;
      clearTimeout(timer);
      if (exitCode !== 0) {
        rejectPromise(
          new ErrorResponse(
            'BACKUP_FAILED',
            `${target.label}: pg_dump failed (exit ${exitCode}). ${firstLines(stderr)}`.trim(),
            [
              'If it mentions a server/client version mismatch, the Postgres client in the image is older than the database.',
              `If it mentions authentication, check the password in ${target.envKey} (URL-encode special characters).`,
            ],
          ),
        );
        return;
      }
      resolvePromise(Buffer.concat(chunks, size));
    };

    const timer = setTimeout(() => {
      stop(
        new ErrorResponse(
          'BACKUP_FAILED',
          `${target.label}: the dump took longer than 5 minutes and was stopped.`,
        ),
      );
    }, DUMP_TIMEOUT_MS);

    // Missing binary, or not executable.
    child.on('error', (error) => {
      stop(
        new ErrorResponse(
          'SERVICE_UNAVAILABLE',
          `Could not run pg_dump ("${config.backup.dumpPath}"): ${error.message}`,
        ),
      );
    });

    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < STDERR_LIMIT) stderr += chunk.toString('utf8');
    });

    child.on('close', (code) => {
      exited = true;
      exitCode = code;
      settle();
    });

    gzip.on('data', (chunk: Buffer) => {
      if (settled) return;
      size += chunk.length;
      if (size > maxBytes) {
        stop(
          new ErrorResponse(
            'BACKUP_FAILED',
            `${target.label}: the dump grew past the ${Math.round(maxBytes / 1024 / 1024)} MB limit before upload, so it was stopped.`,
            [
              'Raise BACKUP_MAX_MB if this host has the memory for it.',
              'A 512 MB host should stay at or below 128 MB.',
            ],
          ),
        );
        return;
      }
      chunks.push(chunk);
    });

    gzip.on('error', (error) => {
      stop(
        new ErrorResponse(
          'BACKUP_FAILED',
          `${target.label}: could not compress the dump: ${error.message}`,
        ),
      );
    });

    gzip.on('end', () => {
      gzipDone = true;
      settle();
    });

    child.stdout.pipe(gzip);
  });

  return { bytes, fileName, durationMs: Date.now() - startedAt };
}

/** pg_dump writes progress on stderr; keep the first useful line only. */
function firstLines(text: string): string {
  const line = text
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find(Boolean);
  return line ? line.slice(0, 300) : '';
}
