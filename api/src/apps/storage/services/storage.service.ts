import { ErrorResponse, ServiceResponse } from '../../../common/shared';
import { logger } from '../../../common/shared/services';
import { config } from '../../../core/config';
import { StorageSettingsRepository } from '../repositories';
import { StorageReferenceRepository } from '../repositories';
import FileStorageService from './file-storage.service';
import { ActivityLogService } from '../../activity-log';
import type { SessionUser } from '@swiftslip/shared/types';
import type {
  StorageBackend,
  StorageBackendUsage,
  StorageOverview,
  StorageSettings,
  StorageSettingsDoc,
  StorageCleanupResult,
  StorageOrphanDeleteResult,
  StorageOrphanPreview,
  OrphanedFile,
} from '@swiftslip/shared/schemas';
import type { StoredObject } from '../types';
import { STORAGE_ROOT } from '../../attachments/repositories';

const toFailure = (error: unknown) => ({
  success: false as const,
  error:
    error instanceof ErrorResponse
      ? error
      : new ErrorResponse('INTERNAL_SERVER_ERROR', (error as Error).message),
});

const DEFAULT_MIN_FREE_PERCENT = config.storage.defaults.minFreePercent;

/** The settings row's default, mirroring the migration's column defaults. */
const DEFAULT_SETTINGS: StorageSettingsDoc = {
  rule: 'supabase-first',
  minFreePercent: DEFAULT_MIN_FREE_PERCENT,
  updatedAt: '1970-01-01T00:00:00.000Z',
  updatedByName: null,
};

/**
 * Settings → Storage: where new uploads go (Supabase first with a B2 overflow,
 * B2 only, or Supabase only), how much each backend holds, and the manual
 * orphan cleanup. Not a `BaseService`: it spans several tables (the five form
 * tables plus `files`) and two object stores, so it holds one repository per
 * concern instead.
 */
export class StorageService {
  private readonly settingsRepo = new StorageSettingsRepository();
  private readonly refRepo = new StorageReferenceRepository();
  private readonly fileStorage = FileStorageService;

  /** In‑memory cache for the last computed overview (seconds). */
  private overviewCache: {
    at: number;
    data: StorageOverview;
  } | null = null;
  private readonly cacheTtl = config.storage.usageCacheSeconds * 1000;

  /** Read the current settings row, falling back to code defaults. */
  private async readSettings(): Promise<StorageSettingsDoc> {
    const row = await this.settingsRepo.findSingle();
    if (!row) return DEFAULT_SETTINGS;
    return {
      rule: row.rule as StorageSettings['rule'],
      minFreePercent: row.min_free_percent,
      updatedAt: row.updated_at,
      updatedByName: row.updated_by_name,
    };
  }

  /** `GET /` — the overview the Storage page renders. */
  async getOverview(force = false): Promise<ServiceResponse<StorageOverview>> {
    try {
      // Cache hit?
      if (
        !force &&
        this.overviewCache &&
        Date.now() - this.overviewCache.at < this.cacheTtl
      ) {
        return { success: true, document: this.overviewCache.data };
      }

      const settings = await this.readSettings();
      const { main, other } = await this.refRepo.read();

      // Lookups keyed `backend:key` — an object only matches a reference on
      // the same backend it physically sits on.
      const mainSet = new Set(main.map((r) => `${r.backend}:${r.key}`));
      const otherSet = new Set(other.map((r) => `${r.backend}:${r.key}`));

      // List objects from both backends (fresh lists; the cache above is what
      // keeps this off the storage APIs on every page paint).
      const [supabaseObjs, b2Objs] = await Promise.all([
        this.fileStorage.list('supabase'),
        this.fileStorage.list('b2'),
      ]);

      // ---- Per‑backend usage, with the objects sorted into buckets ----
      const supabaseUsage = this.buildBackendUsage(
        'supabase',
        supabaseObjs,
        this.categoriseObjects('supabase', supabaseObjs, mainSet, otherSet),
        config.storage.limits.supabaseBytes,
      );
      const b2Usage = this.buildBackendUsage(
        'b2',
        b2Objs,
        this.categoriseObjects('b2', b2Objs, mainSet, otherSet),
        config.storage.limits.b2Bytes,
      );

      // ---- Overall totals ----
      const totalUsed = supabaseUsage.usedBytes + b2Usage.usedBytes;
      const totalFiles = supabaseUsage.files + b2Usage.files;
      const totalOrphanBytes = supabaseUsage.orphanBytes + b2Usage.orphanBytes;
      const totalOrphanFiles = supabaseUsage.orphanFiles + b2Usage.orphanFiles;

      // ---- Next backend decision (a misconfiguration must not 500 the page) ----
      let nextBackend: StorageBackend = 'supabase';
      try {
        nextBackend = await this.pickBackend();
      } catch {
        nextBackend = 'supabase';
      }

      const overview: StorageOverview = {
        settings,
        nextBackend,
        totals: {
          usedBytes: totalUsed,
          files: totalFiles,
          orphanBytes: totalOrphanBytes,
          orphanFiles: totalOrphanFiles,
        },
        supabase: supabaseUsage,
        b2: b2Usage,
      };

      // Cache it.
      this.overviewCache = { at: Date.now(), data: overview };
      return { success: true, document: overview };
    } catch (error) {
      return toFailure(error);
    }
  }

  /** Categorise each object into approval / other / orphan buckets. */
  private categoriseObjects(
    backend: StorageBackend,
    objects: StoredObject[],
    mainSet: Set<string>,
    otherSet: Set<string>,
  ): {
    approvalBytes: number;
    approvalFiles: number;
    otherBytes: number;
    otherFiles: number;
    orphanBytes: number;
    orphanFiles: number;
  } {
    let approvalBytes = 0;
    let approvalFiles = 0;
    let otherBytes = 0;
    let otherFiles = 0;
    let orphanBytes = 0;
    let orphanFiles = 0;

    for (const obj of objects) {
      const ref = `${backend}:${obj.key}`;

      if (mainSet.has(ref)) {
        approvalBytes += obj.size;
        approvalFiles += 1;
      } else if (otherSet.has(ref)) {
        otherBytes += obj.size;
        otherFiles += 1;
      } else {
        // Unreferenced — but an upload that has not recorded its row yet must
        // not be counted (or deleted) as an orphan, so fresh objects count as
        // "other" until the grace period passes.
        const fresh =
          obj.lastModified &&
          Date.now() - obj.lastModified.getTime() <
            config.storage.orphanGraceSeconds * 1000;
        if (fresh) {
          otherBytes += obj.size;
          otherFiles += 1;
        } else {
          orphanBytes += obj.size;
          orphanFiles += 1;
        }
      }
    }

    return {
      approvalBytes,
      approvalFiles,
      otherBytes,
      otherFiles,
      orphanBytes,
      orphanFiles,
    };
  }

  /** Build a per‑backend usage object with categorisation. */
  private buildBackendUsage(
    backend: StorageBackend,
    objects: StoredObject[],
    cat: {
      approvalBytes: number;
      approvalFiles: number;
      otherBytes: number;
      otherFiles: number;
      orphanBytes: number;
      orphanFiles: number;
    },
    limitBytes: number,
  ): StorageBackendUsage {
    const usedBytes = objects.reduce((sum, o) => sum + o.size, 0);
    const freeBytes = Math.max(0, limitBytes - usedBytes);
    const files = objects.length;

    // Dashboard URL per backend.
    const dashboardUrl =
      backend === 'supabase'
        ? (config.storage.supabase.dashboardUrl ??
          this.supabaseDashboardUrlFromConfig())
        : config.storage.b2.dashboardUrl;

    return {
      backend,
      bucket:
        backend === 'supabase'
          ? config.storage.supabase.bucket
          : config.storage.b2.bucket,
      connected: backend === 'supabase' ? true : config.storage.b2.configured,
      limitBytes,
      usedBytes,
      freeBytes,
      files,
      approvalBytes: cat.approvalBytes,
      approvalFiles: cat.approvalFiles,
      otherBytes: cat.otherBytes,
      otherFiles: cat.otherFiles,
      orphanBytes: cat.orphanBytes,
      orphanFiles: cat.orphanFiles,
      dashboardUrl,
    };
  }

  /** Derive a Supabase dashboard URL from SUPABASE_URL if not explicitly set. */
  private supabaseDashboardUrlFromConfig(): string | null {
    try {
      const host = new URL(config.db.supabase.url).hostname;
      const ref = host.split('.')[0];
      return ref
        ? `https://supabase.com/dashboard/project/${ref}/storage/buckets/${config.storage.supabase.bucket}`
        : null;
    } catch {
      return null;
    }
  }

  /** Decide which backend new uploads should use, based on the rule + usage. */
  async pickBackend(): Promise<StorageBackend> {
    const settings = await this.readSettings();

    if (settings.rule === 'supabase-only') return 'supabase';
    if (settings.rule === 'b2-only') {
      if (!config.storage.b2.configured) {
        throw new ErrorResponse(
          'SERVICE_UNAVAILABLE',
          'Storage rule is "b2-only" but B2 is not configured.',
        );
      }
      return 'b2';
    }
    // supabase-first
    if (!config.storage.b2.configured) return 'supabase';

    // Measure current Supabase usage.
    const objects = await this.fileStorage.list('supabase');
    const used = objects.reduce((s, o) => s + o.size, 0);
    const limit = config.storage.limits.supabaseBytes;
    if (limit <= 0) return 'supabase';

    const freePercent = ((limit - used) / limit) * 100;
    // e.g. minFree = 1 → keep at least 1% free; fall below that and the next
    // upload goes to B2 instead.
    return freePercent < settings.minFreePercent ? 'b2' : 'supabase';
  }

  /** `PUT /` — save the rule and log the change. */
  async saveSettings(
    actor: SessionUser,
    input: StorageSettings,
  ): Promise<ServiceResponse<StorageSettingsDoc>> {
    try {
      const now = new Date().toISOString();
      const patch = {
        rule: input.rule,
        min_free_percent: input.minFreePercent,
        updated_at: now,
        updated_by_id: actor.id,
        updated_by_name: actor.label,
      };

      const row = await this.settingsRepo.findSingle();
      if (row) {
        await this.settingsRepo.update({ id: true }, patch);
      } else {
        // The first save seeds the single row the table's CHECK allows.
        await this.settingsRepo.upsert({ id: true, ...patch }, 'id');
      }

      // Invalidate the overview cache so the next GET picks up the new rule.
      this.overviewCache = null;

      // Log the rule change.
      try {
        await ActivityLogService.logBy(actor, {
          action: 'storage.rule_changed',
          target: 'storage-settings',
          detail: `rule=${input.rule}, minFreePercent=${input.minFreePercent}`,
        });
      } catch (e) {
        logger.error(
          `Could not log storage rule change: ${(e as Error).message}`,
        );
      }

      return {
        success: true,
        document: {
          rule: input.rule,
          minFreePercent: input.minFreePercent,
          updatedAt: now,
          updatedByName: actor.label,
        },
      };
    } catch (error) {
      return toFailure(error);
    }
  }

  /** `POST /orphans` — clean one backend; returns how much went and what stayed. */
  async cleanupOrphans(
    actor: SessionUser,
    backend: StorageBackend,
  ): Promise<ServiceResponse<StorageCleanupResult>> {
    try {
      // Read fresh reference sets from the DB.
      const { main, other } = await this.refRepo.read();
      const mainSet = new Set(main.map((r) => `${r.backend}:${r.key}`));
      const otherSet = new Set(other.map((r) => `${r.backend}:${r.key}`));

      const graceMs = config.storage.orphanGraceSeconds * 1000;
      const objects = await this.fileStorage.list(backend);

      // Orphans only: unreferenced AND older than the grace period, so a
      // just‑finished upload whose row is still being written is never hit.
      const orphans = objects.filter((obj) => {
        const ref = `${backend}:${obj.key}`;
        if (mainSet.has(ref) || otherSet.has(ref)) return false;
        const fresh =
          obj.lastModified && Date.now() - obj.lastModified.getTime() < graceMs;
        return !fresh;
      });

      if (orphans.length === 0) {
        return {
          success: true,
          document: { backend, files: 0, bytes: 0, failed: 0 },
        };
      }

      // Best-effort delete: the counts say what happened, nothing throws.
      const result = await this.fileStorage.removeRefsQuietly(
        orphans.map((o) => ({ key: o.key, backend, size: o.size })),
      );

      // Invalidate the overview cache so the next GET is fresh.
      this.overviewCache = null;

      // Log the cleanup.
      try {
        await ActivityLogService.logBy(actor, {
          action: 'storage.orphans_cleaned',
          target: `${backend}-storage`,
          detail: `${result.removed} file(s), ${result.bytes} bytes removed from ${backend}`,
        });
      } catch (e) {
        logger.error(`Could not log orphan cleanup: ${(e as Error).message}`);
      }

      return {
        success: true,
        document: {
          backend,
          files: result.removed,
          bytes: result.bytes,
          failed: result.failed,
        },
      };
    } catch (error) {
      return toFailure(error);
    }
  }

  /** `POST /orphans/everywhere` — both backends (the page's "clean up everywhere"). */
  async cleanupOrphansEveryone(actor: SessionUser): Promise<
    ServiceResponse<{
      supabase: StorageCleanupResult;
      b2: StorageCleanupResult;
    }>
  > {
    try {
      const [supabase, b2] = await Promise.all([
        this.cleanupOrphans(actor, 'supabase'),
        this.cleanupOrphans(actor, 'b2'),
      ]);
      if (!supabase.success) return supabase;
      if (!b2.success) return b2;
      if (!supabase.document || !b2.document) {
        return toFailure(
          new ErrorResponse(
            'INTERNAL_SERVER_ERROR',
            'Cleanup did not report a result.',
          ),
        );
      }
      return {
        success: true,
        document: { supabase: supabase.document, b2: b2.document },
      };
    } catch (error) {
      return toFailure(error);
    }
  }

  /**
   * `GET /orphans/preview` — the list behind the cleanup modal. Read-only:
   * same orphan rule as `cleanupOrphans` (unreferenced AND past the grace
   * period), but nothing is deleted and every file carries the facts the
   * admin reviews: which backend holds it, why it counts as orphaned, when
   * it was last touched, and how big it is.
   */
  async previewOrphans(
    _actor: SessionUser,
    backend: StorageBackend | 'everywhere',
  ): Promise<ServiceResponse<StorageOrphanPreview>> {
    try {
      const backends: StorageBackend[] =
        backend === 'everywhere' ? ['supabase', 'b2'] : [backend];

      const { main, other } = await this.refRepo.read();
      const mainSet = new Set(main.map((r) => `${r.backend}:${r.key}`));
      const otherSet = new Set(other.map((r) => `${r.backend}:${r.key}`));
      const graceMs = config.storage.orphanGraceSeconds * 1000;

      const listings = await Promise.all(
        backends.map((b) => this.fileStorage.list(b)),
      );

      // Every unreferenced, past-grace object, oldest first — the cleanup
      // deletes oldest-last, so the list reads as "what has been rotting".
      const orphans: { obj: StoredObject; backend: StorageBackend }[] = [];
      backends.forEach((b, index) => {
        for (const obj of listings[index] ?? []) {
          const ref = `${b}:${obj.key}`;
          if (mainSet.has(ref) || otherSet.has(ref)) continue;
          const fresh =
            obj.lastModified &&
            Date.now() - obj.lastModified.getTime() < graceMs;
          if (fresh) continue;
          orphans.push({ obj, backend: b });
        }
      });
      orphans.sort(
        (a, b) =>
          (a.obj.lastModified?.getTime() ?? 0) -
          (b.obj.lastModified?.getTime() ?? 0),
      );

      // "Why it's orphaned": keys are `FormAttachement/<user id>/<row id>-…`, so
      // a missing owner reads as an account deletion and a present one as a
      // deleted (or replaced) form. Anything else — e.g. the B2 `/files`
      // store, whose keys are bare uuids — simply has no record pointing at it.
      const ownerIds = [
        ...new Set(
          orphans
            .map(({ obj }) => this.ownerIdOf(obj.key))
            .filter((id): id is string => id !== null),
        ),
      ];
      const existing = await this.refRepo.existingUserIds(ownerIds);

      const describe = (key: string): string => {
        const ownerId = this.ownerIdOf(key);
        if (ownerId === null) return 'Not linked to any record';
        return existing.has(ownerId) ? 'Form deleted' : 'Account deleted';
      };

      const files: OrphanedFile[] = orphans.map(({ obj, backend: b }) => ({
        key: obj.key,
        backend: b,
        sizeBytes: obj.size,
        lastModified: obj.lastModified ? obj.lastModified.toISOString() : null,
        reason: describe(obj.key),
      }));

      return {
        success: true,
        document: {
          supabase: files.filter((f) => f.backend === 'supabase'),
          b2: files.filter((f) => f.backend === 'b2'),
          totals: {
            files: files.length,
            bytes: files.reduce((sum, f) => sum + f.sizeBytes, 0),
          },
          graceSeconds: config.storage.orphanGraceSeconds,
        },
      };
    } catch (error) {
      return toFailure(error);
    }
  }

  /**
   * `POST /orphans/delete` — the modal's "Delete N files". The file list is
   * re-checked server-side before anything is removed: an object that has
   * gained a form reference since the preview (or is inside the grace
   * window) is skipped, so ticking a stale row can never take a live file.
   */
  async deleteOrphanedFiles(
    actor: SessionUser,
    files: { key: string; backend: StorageBackend }[],
  ): Promise<ServiceResponse<StorageOrphanDeleteResult[]>> {
    try {
      if (files.length === 0) {
        return { success: true, document: [] };
      }

      const { main, other } = await this.refRepo.read();
      const mainSet = new Set(main.map((r) => `${r.backend}:${r.key}`));
      const otherSet = new Set(other.map((r) => `${r.backend}:${r.key}`));
      const graceMs = config.storage.orphanGraceSeconds * 1000;

      // Fresh listings give each key its size (for an exact byte count) and
      // its age (so the grace rule holds at delete time, not just at preview).
      const backends = [
        ...new Set(files.map((f) => f.backend)),
      ] as StorageBackend[];
      const listings = await Promise.all(
        backends.map((b) => this.fileStorage.list(b)),
      );
      const live = new Map<string, StoredObject>();
      listings.forEach((objects, index) => {
        for (const obj of objects) {
          live.set(`${backends[index]}:${obj.key}`, obj);
        }
      });

      const safe = files.filter((f) => {
        const obj = live.get(`${f.backend}:${f.key}`);
        if (!obj) return false; // already gone
        const ref = `${f.backend}:${f.key}`;
        if (mainSet.has(ref) || otherSet.has(ref)) return false; // linked now
        const fresh =
          obj.lastModified && Date.now() - obj.lastModified.getTime() < graceMs;
        return !fresh;
      });

      const results: StorageOrphanDeleteResult[] = [];
      for (const b of backends) {
        const batch = safe
          .filter((f) => f.backend === b)
          .map((f) => ({
            key: f.key,
            backend: b,
            size: live.get(`${b}:${f.key}`)?.size ?? 0,
          }));
        if (batch.length === 0) continue;
        const result = await this.fileStorage.removeRefsQuietly(batch);
        results.push({
          backend: b,
          removed: result.removed,
          failed: result.failed,
          bytes: result.bytes,
        });
      }

      // Invalidate the overview cache so the next GET is fresh.
      this.overviewCache = null;

      const removed = results.reduce((sum, r) => sum + r.removed, 0);
      const bytes = results.reduce((sum, r) => sum + r.bytes, 0);
      try {
        await ActivityLogService.logBy(actor, {
          action: 'storage.orphans_cleaned',
          target: 'storage-orphans',
          detail: `${removed} selected file(s), ${bytes} bytes removed (${files.length - safe.length} skipped as no longer orphaned)`,
        });
      } catch (e) {
        logger.error(`Could not log orphan cleanup: ${(e as Error).message}`);
      }

      return { success: true, document: results };
    } catch (error) {
      return toFailure(error);
    }
  }

  /** `FormAttachement/<user id>/…` → the owner's id, or null for any other layout. */
  private ownerIdOf(key: string): string | null {
    const parts = key.split('/');
    return parts.length >= 3 && parts[0] === STORAGE_ROOT && parts[1]
      ? parts[1]
      : null;
  }
}

// One service per server: the overview cache must survive between requests.
export default new StorageService();
