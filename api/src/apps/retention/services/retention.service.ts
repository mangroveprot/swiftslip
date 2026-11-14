import { ErrorResponse, ServiceResponse } from '../../../common/shared';
import { logger } from '../../../common/shared/services';
import { ActivityLogService } from '../../activity-log';
import { AttachmentService } from '../../attachments';
import { NotificationService } from '../../notifications';
import type { SessionUser, StorageBackend } from '@swiftslip/shared/types';
import {
  RETENTION_FORM_LABELS,
  RETENTION_FORM_TYPES,
  type CleanupRunResult,
  type CleanupRunSummary,
  type RetentionFormItem,
  type RetentionFormType,
  type RetentionPreview,
  type RetentionRunForm,
  type RetentionSettings,
  type RetentionSettingsDoc,
} from '@swiftslip/shared/schemas';
import { BaseRepository } from '../../../core/engine';
import {
  CLEANUP_BATCH,
  FORM_LINKS,
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
  isEligible,
  itemOf,
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

/**
 * Split ids into delete-sized bites (PostgREST `in(...)` lists stay small).
 */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

/**
 * "Oct 4, 2026" for a date-only ISO string, read at UTC so the stored day never
 * slides into another. The shared `formatDate` formats a `Date` in the
 * machine's zone; a notification body must read the same on any server.
 */
function dayLabel(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return iso;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** One deleted form, kept with its owner so the run can tell them. */
type DeletedForm = {
  item: RetentionFormItem;
  ownerId: string | null;
};

/**
 * Settings → Data retention: the admin's one global auto-delete rule and the
 * manual cleanup that follows it. Nothing runs on a schedule, every deletion
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

  /** `GET /`, the setting as the page edits it. */
  async getSettings(): Promise<ServiceResponse<RetentionSettingsDoc>> {
    try {
      return { success: true, document: await this.readSettings() };
    } catch (error) {
      return toFailure(error);
    }
  }

  /** `PUT /`, save the single row (upserted, so the first save seeds it). */
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
   * Walk one form type's expired rows in batches and hand back the eligible
   * ones with every storage path they own. Nothing is changed, preview and
   * run share this so both always agree on what "would go".
   */
  private async collect(type: RetentionFormType, cutoff: string) {
    const repo = this.formRepo(RETENTION_TABLES[type]);
    const rows: ExpiredRow[] = [];
    const paths: { key: string; backend: StorageBackend }[] = [];
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
        if (!isEligible(type, raw)) continue;
        rows.push(raw);
        paths.push(...pathsOf(type, raw));
      }
      if (page.length < CLEANUP_BATCH) break;
    }
    return { rows, paths };
  }

  /**
   * `POST /preview`, count what a set of settings would delete. Defaults to
   * the saved settings when the draft is omitted. Changes nothing.
   *
   * Every type is counted, ticked or not, because the page shows each type's
   * pile before the admin ticks it; `totalForms` / `totalFiles` only add up
   * the chosen ones, so the review window repeats exactly what would go.
   *
   * `includeItems` adds the forms themselves, oldest first, for the review
   * window's list. Only the ticked types are listed, so the list and the
   * totals can never disagree.
   */
  async preview(
    draft?: RetentionSettings,
    includeItems = false,
  ): Promise<ServiceResponse<RetentionPreview>> {
    try {
      const settings = draft ?? (await this.readSettings());
      const chosen = readFormTypes(settings.formTypes);
      const cutoff = cutoffFor(settings.days);
      const perType: RetentionPreview['types'] = [];
      const items: RetentionFormItem[] = [];
      let totalForms = 0;
      let totalFiles = 0;
      for (const type of RETENTION_FORM_TYPES) {
        const { rows, paths } = await this.collect(type, cutoff);
        perType.push({ type, forms: rows.length, files: paths.length });
        if (!chosen.includes(type)) continue;
        totalForms += rows.length;
        totalFiles += paths.length;
        if (includeItems) {
          for (const row of rows) {
            items.push(itemOf(type, row, pathsOf(type, row).length));
          }
        }
      }
      if (includeItems) {
        items.sort(
          (a, b) =>
            (a.date ? Date.parse(a.date) : 0) -
            (b.date ? Date.parse(b.date) : 0),
        );
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
          items,
        },
      };
    } catch (error) {
      return toFailure(error);
    }
  }

  /**
   * The ids the review window sent, re-read from that type's table, keeping
   * only rows still past the cutoff and still eligible. The admin approved a
   * list a moment ago; an id that has since gone, or that is no longer old
   * enough, is skipped rather than trusted.
   */
  private async pickRows(
    type: RetentionFormType,
    ids: string[],
    cutoff: string,
  ): Promise<ExpiredRow[]> {
    const rows: ExpiredRow[] = [];
    for (const batch of chunk(ids, CLEANUP_BATCH)) {
      const page = await this.formRepo(RETENTION_TABLES[type]).findAll(
        { id: { in: batch }, created_at: { lt: cutoff } },
        { select: SELECTS[type], limit: batch.length },
      );
      for (const raw of page as unknown as ExpiredRow[]) {
        if (isEligible(type, raw)) rows.push(raw);
      }
    }
    return rows;
  }

  /**
   * Delete one type's rows, then the bytes they owned. Rows first, always: a
   * storage failure after the rows are gone just orphans bytes, it never
   * leaves a live form pointing at a file that no longer exists.
   */
  private async purge(type: RetentionFormType, rows: ExpiredRow[]) {
    const paths = rows.flatMap((row) => pathsOf(type, row));
    let deleted = 0;
    for (const ids of chunk(
      rows.map((row) => row.id),
      CLEANUP_BATCH,
    )) {
      const result = await this.formRepo(RETENTION_TABLES[type]).deleteMany({
        id: { in: ids },
      });
      deleted += result.deletedCount;
    }
    let removed = 0;
    let failed = 0;
    if (paths.length) {
      ({ removed, failed } = await AttachmentService.removeFiles(paths));
    }
    return { deleted, removed, failed, files: paths.length };
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

  /** `GET /runs/last`, newest history row, or null when nothing ran yet. */
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
   * `POST /run`, delete the expired forms of the saved types.
   *
   * With `selection`, only those forms: the ids the review window sent, each
   * re-checked against the cutoff and the scaffold rule first. Without it,
   * every form the saved rule covers, the old sweep.
   *
   * The answer carries the deleted forms back with the history row, so the
   * page can list what went instead of only its totals.
   *
   * Order per type, deliberately: SELECT the rows and collect their file
   * paths → DELETE the rows (in batches) → only then remove the files. A
   * storage failure after the rows are gone just orphans bytes, which is
   * logged and reported in the run's status, it never leaves a live form
   * pointing at a file that no longer exists.
   */
  async run(
    actor: SessionUser,
    selection?: RetentionRunForm[],
  ): Promise<ServiceResponse<CleanupRunResult>> {
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

      // Group the ticked forms by table. A type the saved rule does not cover
      // is dropped: naming a form never widens the rule.
      let picked: Map<RetentionFormType, string[]> | null = null;
      if (selection) {
        const byType = new Map<RetentionFormType, Set<string>>();
        for (const form of selection) {
          if (!types.includes(form.type)) continue;
          const ids = byType.get(form.type) ?? new Set<string>();
          ids.add(form.id);
          byType.set(form.type, ids);
        }
        if (!byType.size) {
          throw new ErrorResponse(
            'BAD_REQUEST',
            'Select at least one form to delete.',
          );
        }
        picked = new Map(
          [...byType].map(([type, ids]) => [type, [...ids]] as const),
        );
      }

      const runTypes = picked ? [...picked.keys()] : types;
      const runSettings: RetentionSettings = {
        ...settings,
        formTypes: runTypes,
      };
      const cutoff = cutoffFor(settings.days);

      runInProgress = true;
      const formsDeleted: Partial<Record<RetentionFormType, number>> = {};
      const filesDeleted: Partial<Record<RetentionFormType, number>> = {};
      const deletedForms: DeletedForm[] = [];
      /** Ids the selection asked for, so the answer can say what it dropped. */
      let requested = 0;
      let status = 'completed';

      try {
        for (const type of runTypes) {
          const ids = picked?.get(type);
          requested += ids?.length ?? 0;
          const rows: ExpiredRow[] = ids
            ? await this.pickRows(type, ids, cutoff)
            : (await this.collect(type, cutoff)).rows;
          if (!rows.length) continue;

          const result = await this.purge(type, rows);
          if (result.deleted) {
            formsDeleted[type] = result.deleted;
            // Once the delete returns, every picked row is gone: this run took
            // it, or it vanished between the preview and now. Those are exactly
            // the forms the result panel can name, and whose owners get told.
            deletedForms.push(
              ...rows.map((row) => ({
                item: itemOf(type, row, pathsOf(type, row).length),
                ownerId: row.owner_id ?? null,
              })),
            );
          }
          // `removeFiles` never throws; it reports how many objects storage
          // actually dropped, so a partial failure is visible in the run's
          // status instead of passing as a clean run (the leftover files are
          // orphans, nothing points at them).
          if (result.removed) filesDeleted[type] = result.removed;
          if (result.failed) {
            status = 'completed_with_file_errors';
            logger.error(
              `[retention] storage removed ${result.removed}/${result.files} file(s) for ${type} after their rows were deleted`,
            );
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
            runSettings,
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
        // Only the run that took the guard releases it, a second admin who
        // was refused above must not clear the flag under the first run.
        runInProgress = false;
      }

      const run = await this.recordRun(
        actor,
        runSettings,
        formsDeleted,
        filesDeleted,
        status,
      );
      const totalForms = sumCounts(formsDeleted);
      const totalFiles = sumCounts(filesDeleted);

      await ActivityLogService.logBy(actor, {
        action: 'cleanup.forms',
        target: `Deleted ${totalForms} form(s) and ${totalFiles} file(s)`,
        detail: `Kept ${settings.days} days · ${runTypes.join(', ')} · ${status}`,
      });

      // Only after the run is recorded: the bell says a form is gone, so it
      // must never fire for a run the history does not have. Best effort by
      // design — `notify` swallows its own failures, and a recipient whose
      // owner id is missing cannot be reached at all. The try/catch is the
      // belt to that suspenders: a notification bug must not turn a finished
      // cleanup into an error answer.
      try {
        await this.notifyOwners(deletedForms, settings.days);
      } catch (notifyError) {
        logger.error(
          '[retention] could not notify owners',
          notifyError as Error,
        );
      }

      return {
        success: true,
        document: {
          ...run,
          // Oldest first, the same order the review window listed them in.
          deleted: deletedForms
            .map((form) => form.item)
            .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')),
          skipped: Math.max(0, requested - deletedForms.length),
        },
      };
    } catch (error) {
      return toFailure(error);
    }
  }

  /**
   * Tell each owner what the run took from them: one notification per person,
   * not per form. A first run can delete 200 forms; 200 bell rows would bury
   * every other notification, so the forms are listed (up to three, then
   * "and N more") inside one row.
   *
   * Sent as the system, deliberately: `actorId` is left out so the bell shows
   * no "by <admin>" line. Whose button did it is the admin's business; the
   * employee only needs to know the form is gone and why.
   *
   * The link opens the type's list, because the record itself no longer
   * exists. A form filed before ownership existed has no `owner_id`; it is
   * deleted all the same, just silently.
   */
  private async notifyOwners(
    deleted: DeletedForm[],
    days: number,
  ): Promise<void> {
    const byOwner = new Map<string, RetentionFormItem[]>();
    for (const { item, ownerId } of deleted) {
      if (!ownerId) continue;
      const items = byOwner.get(ownerId) ?? [];
      items.push(item);
      byOwner.set(ownerId, items);
    }

    for (const [recipient, items] of byOwner) {
      const named = items
        .slice(0, 3)
        .map(
          (item) =>
            `${RETENTION_FORM_LABELS[item.type]} · ${
              item.date ? dayLabel(item.date) : 'no date'
            }`,
        )
        .join(', ');
      const more = items.length > 3 ? ` and ${items.length - 3} more` : '';
      const period = `${days}-day`;

      await NotificationService.notify({
        recipients: [recipient],
        kind: 'form_deleted',
        title:
          items.length === 1
            ? 'Your form was deleted'
            : `Your ${items.length} forms were deleted`,
        body: `Past the ${period} keep period: ${named}${more}.`,
        link: FORM_LINKS[items[0]!.type],
      });
    }
  }
}

export default new RetentionService();
