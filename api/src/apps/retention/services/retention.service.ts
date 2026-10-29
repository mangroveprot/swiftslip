import { ErrorResponse, ServiceResponse } from '../../../common/shared';
import { logger } from '../../../common/shared/services';
import { ActivityLogService } from '../../activity-log';
import { AttachmentService } from '../../attachments';
import type { SessionUser } from '@swiftslip/shared/types';
import {
  RETENTION_FORM_TYPES,
  type CleanupRunSummary,
  type RetentionFormType,
  type RetentionPreview,
  type RetentionSettings,
  type RetentionSettingsDoc,
} from '@swiftslip/shared/schemas';
import { BaseRepository } from '../../../core/engine';
import {
  CLEANUP_BATCH,
  RETENTION_TABLES,
  SELECTS,
  type ExpiredRow,
  type RetentionTable,
} from '../types';
import {
  CleanupRunsRepository,
  RetentionSettingsRepository,
} from '../repositories';
import {
  cutoffFor,
  isFinished,
  pathsOf,
  readCountMap,
  readFormTypes,
  sumCounts,
} from './retention.rules';

const toFailure = (error: unknown) => ({
  success: false as const,
  error:
    error instanceof ErrorResponse
      ? error
      : new ErrorResponse('INTERNAL_SERVER_ERROR', (error as Error).message),
});

/** The settings row's default, mirroring the migration's column defaults. */
const DEFAULT_SETTINGS: RetentionSettingsDoc = {
  enabled: false,
  days: 365,
  formTypes: [],
  updatedAt: '1970-01-01T00:00:00.000Z',
};

/**
 * One run at a time. Two admins pressing Run at once would double-count and
 * race on the same rows, so the second one is refused with
 * `CLEANUP_IN_PROGRESS`. Module-level on purpose: the guard is per server
 * instance, which is all a single-node deployment (Render free plan) needs.
 */
let runInProgress = false;

/** Split ids into delete-sized bites (PostgREST `in(...)` lists stay small). */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

/**
 * Settings → Data retention: the admin's one global auto-delete rule and the
 * manual cleanup that follows it. Nothing runs on a schedule — every deletion
 * comes from a pressed button after an explicit preview. Not a `BaseService`:
 * like AttachmentService it spans several tables (the five form tables), so
 * it holds one repository per table instead.
 */
class RetentionService {
  private readonly settingsRepo = new RetentionSettingsRepository();
  private readonly runsRepo = new CleanupRunsRepository();
  private readonly formRepos = new Map<
    RetentionTable,
    BaseRepository<RetentionTable>
  >();

  private formRepo(table: RetentionTable) {
    let repo = this.formRepos.get(table);
    if (!repo) {
      repo = new BaseRepository(table);
      this.formRepos.set(table, repo);
    }
    return repo;
  }

  /** The saved settings (defaults when the table has no row yet). */
  private async readSettings(): Promise<RetentionSettingsDoc> {
    const row = await this.settingsRepo.findSingle();
    if (!row) return DEFAULT_SETTINGS;
    return {
      enabled: row.enabled,
      days: row.days,
      formTypes: readFormTypes(row.form_types),
      updatedAt: row.updated_at,
    };
  }

  /** `GET /` — the setting as the page edits it. */
  async getSettings(): Promise<ServiceResponse<RetentionSettingsDoc>> {
    try {
      return { success: true, document: await this.readSettings() };
    } catch (error) {
      return toFailure(error);
    }
  }

  /** `PUT /` — save the single row (upserted, so the first save seeds it). */
  async saveSettings(
    input: RetentionSettings,
  ): Promise<ServiceResponse<RetentionSettingsDoc>> {
    try {
      const saved = await this.settingsRepo.upsert(
        {
          id: true,
          enabled: input.enabled,
          days: input.days,
          form_types: readFormTypes(input.formTypes),
          updated_at: new Date().toISOString(),
        },
        'id',
      );
      return {
        success: true,
        document: {
          enabled: saved.enabled,
          days: saved.days,
          formTypes: readFormTypes(saved.form_types),
          updatedAt: saved.updated_at,
        },
      };
    } catch (error) {
      return toFailure(error);
    }
  }

  /**
   * Walk one form type's expired rows in batches and hand back the finished
   * ones with every storage path they own. Nothing is changed — preview and
   * run share this so both always agree on what "would go".
   */
  private async collect(type: RetentionFormType, cutoff: string) {
    const repo = this.formRepo(RETENTION_TABLES[type]);
    const rows: ExpiredRow[] = [];
    const paths: string[] = [];
    for (let offset = 0; ; offset += CLEANUP_BATCH) {
      const page = await repo.findAll(
        { created_at: { lt: cutoff } },
        {
          select: SELECTS[type],
          sort: { created_at: 'asc' },
          limit: CLEANUP_BATCH,
          offset,
        },
      );
      for (const raw of page as unknown as ExpiredRow[]) {
        if (!isFinished(type, raw)) continue;
        rows.push(raw);
        paths.push(...pathsOf(type, raw));
      }
      if (page.length < CLEANUP_BATCH) break;
    }
    return { rows, paths };
  }

  /**
   * `POST /preview` — count what a set of settings would delete. Defaults to
   * the saved settings when the draft is omitted. Changes nothing.
   *
   * Every type is counted, ticked or not, because the page shows each type's
   * pile before the admin ticks it; `totalForms` / `totalFiles` only add up
   * the chosen ones, so the confirm dialog repeats exactly what would go.
   */
  async preview(
    draft?: RetentionSettings,
  ): Promise<ServiceResponse<RetentionPreview>> {
    try {
      const settings = draft ?? (await this.readSettings());
      const chosen = readFormTypes(settings.formTypes);
      const cutoff = cutoffFor(settings.days);
      const perType: RetentionPreview['types'] = [];
      let totalForms = 0;
      let totalFiles = 0;
      for (const type of RETENTION_FORM_TYPES) {
        const { rows, paths } = await this.collect(type, cutoff);
        perType.push({ type, forms: rows.length, files: paths.length });
        if (chosen.includes(type)) {
          totalForms += rows.length;
          totalFiles += paths.length;
        }
      }

      return {
        success: true,
        document: {
          days: settings.days,
          cutoff,
          chosen,
          types: perType,
          totalForms,
          totalFiles,
        },
      };
    } catch (error) {
      return toFailure(error);
    }
  }

  /** Write the permanent history row and shape it for the wire. */
  private async recordRun(
    actor: SessionUser,
    settings: RetentionSettings,
    formsDeleted: Partial<Record<RetentionFormType, number>>,
    filesDeleted: Partial<Record<RetentionFormType, number>>,
    status: string,
  ): Promise<CleanupRunSummary> {
    const row = await this.runsRepo.create({
      ran_by_id: actor.id,
      ran_by_name: actor.label,
      ran_by_number: actor.idNumber,
      days: settings.days,
      form_types: readFormTypes(settings.formTypes),
      forms_deleted: formsDeleted,
      files_deleted: filesDeleted,
      status,
    });
    return {
      id: row.id,
      ranAt: row.ran_at,
      ranById: row.ran_by_id,
      ranByName: row.ran_by_name,
      ranByNumber: row.ran_by_number,
      days: row.days,
      formTypes: readFormTypes(row.form_types),
      formsDeleted: readCountMap(row.forms_deleted),
      filesDeleted: readCountMap(row.files_deleted),
      status: row.status,
    };
  }

  /** `GET /runs/last` — newest history row, or null when nothing ran yet. */
  async lastRun(): Promise<ServiceResponse<CleanupRunSummary | null>> {
    try {
      const row = await this.runsRepo.findLatest();
      if (!row) return { success: true, document: null };
      return {
        success: true,
        document: {
          id: row.id,
          ranAt: row.ran_at,
          ranById: row.ran_by_id,
          ranByName: row.ran_by_name,
          ranByNumber: row.ran_by_number,
          days: row.days,
          formTypes: readFormTypes(row.form_types),
          formsDeleted: readCountMap(row.forms_deleted),
          filesDeleted: readCountMap(row.files_deleted),
          status: row.status,
        },
      };
    } catch (error) {
      return toFailure(error);
    }
  }

  /**
   * `POST /run` — delete the expired, finished forms of the saved types.
   *
   * Order per type, deliberately: SELECT the rows and collect their file
   * paths → DELETE the rows (in batches) → only then remove the files. A
   * storage failure after the rows are gone just orphans bytes, which is
   * logged and reported in the run's status — it never leaves a live form
   * pointing at a file that no longer exists.
   */
  async run(actor: SessionUser): Promise<ServiceResponse<CleanupRunSummary>> {
    try {
      const settings = await this.readSettings();
      if (!settings.enabled) {
        throw new ErrorResponse('RETENTION_DISABLED');
      }
      if (runInProgress) {
        throw new ErrorResponse('CLEANUP_IN_PROGRESS');
      }
      const types = readFormTypes(settings.formTypes);
      if (!types.length) {
        throw new ErrorResponse(
          'BAD_REQUEST',
          'Choose at least one form type before running a cleanup.',
        );
      }

      runInProgress = true;
      const formsDeleted: Partial<Record<RetentionFormType, number>> = {};
      const filesDeleted: Partial<Record<RetentionFormType, number>> = {};
      let status = 'completed';

      try {
        const cutoff = cutoffFor(settings.days);
        for (const type of types) {
          const { rows, paths } = await this.collect(type, cutoff);
          if (!rows.length) continue;

          let deleted = 0;
          for (const ids of chunk(
            rows.map((row) => row.id),
            CLEANUP_BATCH,
          )) {
            const result = await this.formRepo(
              RETENTION_TABLES[type],
            ).deleteMany({
              id: { in: ids },
            });
            deleted += result.deletedCount;
          }
          if (deleted) formsDeleted[type] = deleted;

          // Rows are gone — now the bytes. `removeFiles` never throws; it
          // reports how many objects storage actually dropped, so a partial
          // failure is visible in the run's status instead of passing as a
          // clean run (the leftover files are orphans, nothing points at them).
          if (paths.length) {
            const { removed, failed } =
              await AttachmentService.removeFiles(paths);
            if (removed) filesDeleted[type] = removed;
            if (failed) {
              status = 'completed_with_file_errors';
              logger.error(
                `[retention] storage removed ${removed}/${paths.length} file(s) for ${type} after their rows were deleted`,
              );
            }
          }
        }
      } catch (error) {
        // A database failure mid-run leaves some rows already gone: record
        // the partial counts before reporting the failure, so the history
        // still says what actually happened.
        status = 'failed';
        try {
          await this.recordRun(
            actor,
            settings,
            formsDeleted,
            filesDeleted,
            status,
          );
        } catch (historyError) {
          logger.error(
            '[retention] could not record the failed run',
            historyError as Error,
          );
        }
        throw error;
      } finally {
        // Only the run that took the guard releases it — a second admin who
        // was refused above must not clear the flag under the first run.
        runInProgress = false;
      }

      const run = await this.recordRun(
        actor,
        settings,
        formsDeleted,
        filesDeleted,
        status,
      );
      const totalForms = sumCounts(formsDeleted);
      const totalFiles = sumCounts(filesDeleted);

      await ActivityLogService.logBy(actor, {
        action: 'cleanup.forms',
        target: `Deleted ${totalForms} form(s) and ${totalFiles} file(s)`,
        detail: `Kept ${settings.days} days · ${types.join(', ')} · ${status}`,
      });

      return { success: true, document: run };
    } catch (error) {
      return toFailure(error);
    }
  }
}

export default new RetentionService();
