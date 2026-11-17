import { ErrorResponse, ServiceResponse } from '../../../common/shared';
import { logger } from '../../../common/shared/services';
import { config } from '../../../core/config';
import type { Row } from '../../../core/engine';
import type { SessionUser } from '@swiftslip/shared/types';
import type {
  BackupDatabaseStatus,
  BackupOverview,
  BackupRun,
  BackupRunStatus,
  BackupSettingsInput,
  BackupTargetId,
  BackupTrigger,
} from '@swiftslip/shared/schemas';
import { BACKUP_TARGETS } from '@swiftslip/shared/schemas';
import { ActivityLogService } from '../../activity-log';
import {
  BackupRunsRepository,
  BackupSettingsRepository,
} from '../repositories';
import * as Drive from './drive.service';
import { dumpDatabase, pgDumpVersion } from './dump.service';
import { newCronToken, open, sameSecret, seal } from './secret-box';

/**
 * Settings → Backup: every database, weekly, into the admin's Google Drive.
 *
 * ONE run covers ONE file per configured database: the SwiftSlip project and
 * the RGC inventory database (whose connection string the stock pages already
 * need, so the second dump costs no extra secret). Attachments are NOT part of
 * it: they are gigabytes in Supabase Storage and B2, and pushing them through a
 * small host would cost more bandwidth than a free plan has (BACKUP_GUIDE.md).
 * A `pg_dump` of one of these databases is a few megabytes, which any host can
 * carry.
 *
 * Three invariants, each learned the hard way elsewhere in this codebase:
 *   - one run at a time, claimed synchronously so two cron hits cannot overlap;
 *   - a row per database is written BEFORE its dump, so a dead process leaves
 *     evidence;
 *   - a failure is reported, never swallowed: the page shows it against the
 *     database it belongs to, and a dump that worked is never thrown away
 *     because the other one failed.
 */

/** Runs hanging in `running` longer than this were killed by a restart. */
const STALE_RUN_MINUTES = 30;
/** An OAuth `state` older than this is refused (a stale tab, or a replay). */
const OAUTH_STATE_MINUTES = 15;

const DEFAULTS = {
  enabled: false,
  keepCount: 14,
  folderName: 'SwiftSlip Backups',
};

const toFailure = (error: unknown) => ({
  success: false as const,
  error:
    error instanceof ErrorResponse
      ? error
      : new ErrorResponse('INTERNAL_SERVER_ERROR', (error as Error).message),
});

export class BackupService {
  private readonly settingsRepo = new BackupSettingsRepository();
  private readonly runsRepo = new BackupRunsRepository();

  /**
   * The one-run-at-a-time lock.
   *
   * Static and set synchronously (before any `await`), because JavaScript runs
   * one task at a time: two cron hits in the same tick cannot both claim it.
   * The cron endpoint hands the claim to a background run, so this is the only
   * thing stopping a second dump from starting while the first uploads.
   */
  private static running = false;

  private static claim(): boolean {
    if (BackupService.running) return false;
    BackupService.running = true;
    return true;
  }

  private static release(): void {
    BackupService.running = false;
  }

  /** True while a dump is in flight (the page shows it as "running"). */
  static isRunning(): boolean {
    return BackupService.running;
  }

  /** The row, or null when migration 0043 has not been applied yet. */
  private async load(): Promise<Row<'backup_settings'> | null> {
    if (!(await this.settingsRepo.tableExists())) return null;
    const row = await this.settingsRepo.ensure();
    // A link is part of the product, not a step the admin has to discover:
    // the first read mints one so "copy this into your cron" always has a value.
    if (row.cron_token) return row;
    return this.settingsRepo.patch({ cron_token: newCronToken() });
  }

  private toRun(row: Row<'backup_runs'>): BackupRun {
    return {
      id: row.id,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      status: row.status as BackupRunStatus,
      trigger: row.triggered_by as BackupTrigger,
      target: (row.target as BackupTargetId | null) ?? null,
      sizeBytes: row.size_bytes === null ? null : Number(row.size_bytes),
      fileName: row.file_name,
      fileId: row.file_id,
      error: row.error,
      actorName: row.actor_name,
    };
  }

  /** `GET /admin/backup` — everything the page renders, in one read. */
  async getOverview(): Promise<ServiceResponse<BackupOverview>> {
    try {
      const [row, version] = await Promise.all([this.load(), pgDumpVersion()]);

      const runs = row
        ? (await this.runsRepo.recent(config.backup.historyLimit)).map((run) =>
            this.toRun(run),
          )
        : [];

      const connected = Boolean(row?.refresh_token);
      const oauthConfigured = Drive.isConfigured();
      const configuredIds = new Set(config.backup.targets.map((t) => t.id));
      const databases: BackupDatabaseStatus[] = BACKUP_TARGETS.map(
        (target) => ({
          ...target,
          configured: configuredIds.has(target.id),
        }),
      );
      const anyConfigured = databases.some((database) => database.configured);
      const pgDumpAvailable = version !== null;
      // A run writes one row per database, which needs 0044's column.
      const targetColumnReady = row
        ? await this.runsRepo.targetColumnExists()
        : false;

      return {
        success: true,
        document: {
          settings: {
            enabled: row?.enabled ?? DEFAULTS.enabled,
            keepCount: row?.keep_count ?? DEFAULTS.keepCount,
            folderName: row?.folder_name ?? DEFAULTS.folderName,
            updatedAt: row?.updated_at ?? '1970-01-01T00:00:00.000Z',
            updatedByName: row?.updated_by_name ?? null,
          },
          oauthConfigured,
          googleRedirectUri: Drive.redirectUri(),
          drive: {
            connected,
            accountEmail: row?.account_email ?? null,
            connectedAt: row?.connected_at ?? null,
          },
          pgDump: { available: pgDumpAvailable, version },
          databases,
          ready:
            oauthConfigured &&
            connected &&
            anyConfigured &&
            pgDumpAvailable &&
            targetColumnReady,
          cronToken: row?.cron_token ?? null,
          migrationApplied: row !== null,
          targetColumnReady,
          runs,
        },
      };
    } catch (error) {
      return toFailure(error);
    }
  }

  /** `PUT /admin/backup` — only the two editable numbers/bools. */
  async saveSettings(
    actor: SessionUser,
    input: BackupSettingsInput,
  ): Promise<ServiceResponse<BackupOverview>> {
    try {
      const row = await this.load();
      if (!row) {
        throw new ErrorResponse(
          'BACKUP_FAILED',
          'The backup tables are missing. Run migration 0043_backup.sql in the Supabase SQL editor, then reload this page.',
        );
      }

      await this.settingsRepo.patch({
        enabled: input.enabled,
        keep_count: input.keepCount,
        updated_by_id: actor.id,
        updated_by_name: actor.label,
      });

      try {
        await ActivityLogService.logBy(actor, {
          action: 'backup.settings_changed',
          target: 'backup-settings',
          detail: `enabled=${input.enabled}, keepCount=${input.keepCount}`,
        });
      } catch (error) {
        logger.error(
          `Could not log the backup settings change: ${(error as Error).message}`,
        );
      }

      return await this.getOverview();
    } catch (error) {
      return toFailure(error);
    }
  }

  /**
   * `GET /admin/backup/google/start` — the consent URL to send the browser to.
   *
   * The state goes on the row rather than in a cookie: it is one admin, it is
   * single-use, and it is cleared by the callback that consumes it.
   */
  async beginConnect(
    actor: SessionUser,
  ): Promise<ServiceResponse<{ url: string }>> {
    try {
      if (!Drive.isConfigured()) {
        throw new ErrorResponse(
          'SERVICE_UNAVAILABLE',
          'Google Drive is not configured on this server: GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET are unset.',
          [
            `Add the redirect URI ${Drive.redirectUri()} to a Google OAuth client.`,
          ],
        );
      }

      const row = await this.load();
      if (!row) {
        throw new ErrorResponse(
          'BACKUP_FAILED',
          'The backup tables are missing. Run migration 0043_backup.sql first.',
        );
      }

      const state = newCronToken();
      await this.settingsRepo.patch({
        oauth_state: state,
        oauth_state_at: new Date().toISOString(),
        updated_by_id: actor.id,
        updated_by_name: actor.label,
      });

      return { success: true, document: { url: Drive.buildAuthUrl(state) } };
    } catch (error) {
      return toFailure(error);
    }
  }

  /**
   * `GET /admin/backup/google/callback` — the browser comes back from Google.
   *
   * Returns the connected address so the controller can say who was linked, and
   * the folder is created here (once) so the first backup does not have to.
   */
  async finishConnect(
    actor: SessionUser,
    code: string,
    state: string,
  ): Promise<ServiceResponse<{ email: string | null }>> {
    try {
      const row = await this.load();
      if (!row) {
        throw new ErrorResponse(
          'BACKUP_FAILED',
          'The backup tables are missing.',
        );
      }

      const fresh =
        row.oauth_state_at !== null &&
        Date.now() - new Date(row.oauth_state_at).getTime() <=
          OAUTH_STATE_MINUTES * 60_000;
      if (!row.oauth_state || !fresh || !sameSecret(state, row.oauth_state)) {
        throw new ErrorResponse(
          'BAD_REQUEST',
          'This connection attempt expired or did not start here. Press Connect Google Drive again.',
        );
      }

      // Burn the state before the exchange: a replayed callback cannot pass twice.
      await this.settingsRepo.patch({
        oauth_state: null,
        oauth_state_at: null,
      });

      const tokens = await Drive.exchangeCode(code);
      const folderName = row.folder_name || DEFAULTS.folderName;
      const folderId = await Drive.ensureFolder(
        tokens.accessToken,
        null,
        folderName,
      );

      await this.settingsRepo.patch({
        refresh_token: seal(tokens.refreshToken),
        account_email: tokens.email,
        connected_at: new Date().toISOString(),
        folder_id: folderId,
        folder_name: folderName,
        updated_by_id: actor.id,
        updated_by_name: actor.label,
      });

      try {
        await ActivityLogService.logBy(actor, {
          action: 'backup.drive_connected',
          target: 'backup-settings',
          detail: tokens.email ?? 'Google Drive',
        });
      } catch (error) {
        logger.error(
          `Could not log the Drive connection: ${(error as Error).message}`,
        );
      }

      return { success: true, document: { email: tokens.email } };
    } catch (error) {
      return toFailure(error);
    }
  }

  /** `POST /admin/backup/google/disconnect` — forget the token, revoke it too. */
  async disconnect(
    actor: SessionUser,
  ): Promise<ServiceResponse<BackupOverview>> {
    try {
      const row = await this.load();
      if (!row) {
        throw new ErrorResponse(
          'BACKUP_FAILED',
          'The backup tables are missing.',
        );
      }

      const token = open(row.refresh_token);
      if (token) await Drive.revoke(token);

      await this.settingsRepo.patch({
        refresh_token: null,
        account_email: null,
        connected_at: null,
        folder_id: null,
        enabled: false,
        updated_by_id: actor.id,
        updated_by_name: actor.label,
      });

      try {
        await ActivityLogService.logBy(actor, {
          action: 'backup.drive_disconnected',
          target: 'backup-settings',
        });
      } catch (error) {
        logger.error(
          `Could not log the Drive disconnection: ${(error as Error).message}`,
        );
      }

      return await this.getOverview();
    } catch (error) {
      return toFailure(error);
    }
  }

  /** `POST /admin/backup/link` — replace the trigger token (old link dies). */
  async rotateLink(
    actor: SessionUser,
  ): Promise<ServiceResponse<BackupOverview>> {
    try {
      const row = await this.load();
      if (!row) {
        throw new ErrorResponse(
          'BACKUP_FAILED',
          'The backup tables are missing.',
        );
      }
      await this.settingsRepo.patch({
        cron_token: newCronToken(),
        updated_by_id: actor.id,
        updated_by_name: actor.label,
      });
      return await this.getOverview();
    } catch (error) {
      return toFailure(error);
    }
  }

  /** `POST /admin/backup/run` — the button. Works even when the schedule is off. */
  async runNow(
    actor: SessionUser,
    trigger: BackupTrigger = 'manual',
  ): Promise<ServiceResponse<BackupRun[]>> {
    if (!BackupService.claim()) {
      return {
        success: false,
        error: new ErrorResponse(
          'BACKUP_IN_PROGRESS',
          'A backup is already running. The page will show it when it finishes.',
        ),
      };
    }

    try {
      const row = await this.load();
      if (!row) {
        throw new ErrorResponse(
          'BACKUP_FAILED',
          'The backup tables are missing. Run migration 0043_backup.sql first.',
        );
      }
      return await this.execute(row, actor, trigger);
    } catch (error) {
      return toFailure(error);
    } finally {
      BackupService.release();
    }
  }

  /**
   * `GET|POST /backup/cron/:token` — what the cron service calls.
   *
   * Answers 202 immediately and runs in the background: a free host cold-starts
   * in about a minute, and no cron service waits that long for a response. The
   * result is the run history on the page (and the activity log), not the body.
   */
  async triggerFromLink(
    token: string,
  ): Promise<ServiceResponse<{ started: boolean; at: string }>> {
    try {
      const row = await this.load();
      if (!row?.cron_token || !sameSecret(token, row.cron_token)) {
        throw new ErrorResponse(
          'UNAUTHORIZED',
          'This backup link is not valid.',
        );
      }
      if (!row.enabled) {
        throw new ErrorResponse(
          'BACKUP_FAILED',
          'Scheduled backups are turned off. Turn them on in Settings → Backup.',
        );
      }
      if (!BackupService.claim()) {
        throw new ErrorResponse(
          'BACKUP_IN_PROGRESS',
          'A backup is already running.',
        );
      }

      void this.execute(row, null, 'cron')
        .then((result) => {
          if (!result.success) {
            logger.warn(`Scheduled backup failed: ${result.error.message}`);
          }
        })
        .catch((error: unknown) => {
          logger.error('Scheduled backup crashed', error as Error);
        })
        .finally(() => BackupService.release());

      return {
        success: true,
        document: { started: true, at: new Date().toISOString() },
      };
    } catch (error) {
      return toFailure(error);
    }
  }

  /**
   * Dump every configured database, upload, prune, record. Throws on a failure
   * that stops the whole run (no Drive token, nothing configured); a failure of
   * ONE database is recorded against its own row and the rest still run.
   *
   * Shared by the button and the cron link so the two can never drift: same
   * checks, same file naming, same history rows. Databases are dumped one at a
   * time on purpose: two gzipped buffers in memory at once would double the
   * peak of a small host for no benefit.
   */
  private async execute(
    row: Row<'backup_settings'>,
    actor: SessionUser | null,
    trigger: BackupTrigger,
  ): Promise<ServiceResponse<BackupRun[]>> {
    try {
      const targets = config.backup.targets;

      const refreshToken = open(row.refresh_token);
      if (!refreshToken) {
        throw new ErrorResponse(
          'BACKUP_NOT_CONNECTED',
          'Google Drive is not connected. Connect it in Settings → Backup first.',
        );
      }
      if (targets.length === 0) {
        throw new ErrorResponse(
          'SERVICE_UNAVAILABLE',
          'Database backups are not configured: no connection string is set on this server.',
          [
            'Set SUPABASE_DB_URL (SwiftSlip) and/or RGC_INVENTORY_DATABASE_URL (inventory).',
            'Supabase → Project Settings → Database → Connection string (session pooler, port 5432).',
            'Restart the service after adding them.',
          ],
        );
      }
      if (!(await this.runsRepo.targetColumnExists())) {
        throw new ErrorResponse(
          'BACKUP_FAILED',
          'One more migration is needed: run 0044_backup_target.sql in the Supabase SQL editor, then try again.',
        );
      }

      // A previous run left "running" by a restart is closed before the new one
      // starts, so the history never shows two live runs.
      await this.runsRepo.failStale(STALE_RUN_MINUTES);

      // The Drive token is checked first: a dead connection should fail in a
      // second, not after a minute of dumping a database nobody will receive.
      const accessToken = await Drive.accessTokenFor(refreshToken);

      const folderName = row.folder_name || DEFAULTS.folderName;
      const folderId = await Drive.ensureFolder(
        accessToken,
        row.folder_id,
        folderName,
      );
      if (folderId !== row.folder_id) {
        await this.settingsRepo.patch({
          folder_id: folderId,
          folder_name: folderName,
        });
      }

      const runs: BackupRun[] = [];
      const saved: string[] = [];
      const failed: string[] = [];
      let pruned = 0;

      for (const target of targets) {
        const started = await this.runsRepo.start({
          triggeredBy: trigger,
          target: target.id,
          actorId: actor?.id ?? null,
          actorName: actor?.label ?? null,
        });
        const startedAt = new Date().toISOString();

        try {
          const dump = await dumpDatabase(target);
          const uploaded = await Drive.uploadDump(
            accessToken,
            folderId,
            dump.fileName,
            dump.bytes,
            target.label,
          );
          const size = uploaded.size || dump.bytes.length;
          const finished = await this.runsRepo.finish(started.id, {
            status: 'succeeded',
            finished_at: new Date().toISOString(),
            size_bytes: size,
            file_id: uploaded.id,
            file_name: uploaded.name,
            error: null,
          });
          runs.push(
            this.toRun(
              finished ?? {
                ...started,
                status: 'succeeded',
                finished_at: new Date().toISOString(),
                size_bytes: size,
                file_id: uploaded.id,
                file_name: uploaded.name,
                error: null,
              },
            ),
          );
          saved.push(
            `${target.label}: ${uploaded.name} (${formatMegabytes(size)})`,
          );

          // Retention is a courtesy, not part of the guarantee: a failed sweep
          // must not mark a saved backup as failed. Counted per database, so
          // "keep 14" means 14 of each. Only a database that actually uploaded
          // is swept: a run where every dump failed must never delete old ones.
          try {
            pruned += await Drive.pruneDumps(
              accessToken,
              folderId,
              row.keep_count,
              Drive.dumpPrefix(target.id),
            );
          } catch (error) {
            logger.warn(
              `Backup saved, but the old-dump sweep failed: ${(error as Error).message}`,
            );
          }
        } catch (error) {
          // One database failing must not cost the other its dump: record this
          // row, tell the page, and carry on with the next target.
          const failure =
            error instanceof ErrorResponse
              ? error
              : new ErrorResponse('BACKUP_FAILED', (error as Error).message);
          await this.runsRepo
            .finish(started.id, {
              status: 'failed',
              finished_at: new Date().toISOString(),
              error: failure.message,
            })
            .catch((updateError: unknown) => {
              logger.error(
                `Could not record the failed ${target.label} backup: ${(updateError as Error).message}`,
              );
            });
          runs.push(
            this.toRun({
              ...started,
              started_at: startedAt,
              status: 'failed',
              finished_at: new Date().toISOString(),
              error: failure.message,
            }),
          );
          failed.push(failure.message);
        }
      }

      try {
        const detail = [
          saved.join(' · '),
          failed.length > 0 ? `${failed.length} failed` : '',
          pruned > 0 ? `${pruned} old dump(s) removed` : '',
        ]
          .filter(Boolean)
          .join(' · ');
        if (actor) {
          await ActivityLogService.logBy(actor, {
            action: 'backup.run',
            target: 'database',
            detail,
          });
        } else {
          await ActivityLogService.log({
            action: 'backup.run',
            actorName: 'Scheduled backup',
            target: 'database',
            detail,
          });
        }
      } catch (error) {
        logger.error(
          `Could not log the backup run: ${(error as Error).message}`,
        );
      }

      // Nothing reached Drive: this is the one case the page must show as a
      // whole-run failure, because there is no successful row to look at.
      if (saved.length === 0) {
        return {
          success: false,
          error: new ErrorResponse(
            'BACKUP_FAILED',
            failed[0] ?? 'No database could be dumped.',
            [
              'Each database has its own row in Recent backups with its reason.',
            ],
          ),
        };
      }

      // Only a run that actually delivered something counts as done; the page
      // shows this as "last run". A failed run must not move it forward.
      await this.settingsRepo.patch({
        last_run_at: new Date().toISOString(),
      });

      return { success: true, document: runs };
    } catch (error) {
      const failure =
        error instanceof ErrorResponse
          ? error
          : new ErrorResponse('BACKUP_FAILED', (error as Error).message);

      // A dead refresh token is worth forgetting: the page must show the Connect
      // button again instead of pretending the Drive is still linked.
      if (failure.code === 'BACKUP_NOT_CONNECTED') {
        await this.settingsRepo
          .patch({ refresh_token: null, connected_at: null })
          .catch(() => undefined);
      }

      logger.warn(`Backup failed (${trigger}): ${failure.message}`);
      return { success: false, error: failure };
    }
  }
}

function formatMegabytes(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** The singleton the controllers use, so `isRunning()` reflects every request. */
export const backupService = new BackupService();
