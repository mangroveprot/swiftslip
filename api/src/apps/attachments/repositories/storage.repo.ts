import { ErrorResponse } from '../../../common/shared';
import { config } from '../../../core/config';
import { logger } from '../../../common/shared/services';
import { getDb } from '../../../core/framework/databases/supabase';
import { ATTACHMENT_MAX_BYTES } from '../utils';

/**
 * The folder every form attachment lives under.
 *
 * It used to be `ApprovalSlip` — named after the first form that ever had an
 * attachment, long before DTR/OB/LOA/COS/OT all did. Renaming it is a three-part
 * move, never a drag-and-drop in the dashboard: `0033_rename_storage_root.sql`
 * repoints the stored paths, `scripts/rename-storage-root.ts` moves the objects,
 * and this constant decides where new uploads go. Change one without the others
 * and every download 404s, or the orphan scan starts reporting live files as
 * unowned (`ownerIdOf` below matches this name exactly).
 */
export const STORAGE_ROOT = 'FormAttachement';
/** Signed download links live for an hour — long enough to view or re-download. */
const URL_TTL_SECONDS = 60 * 60;

/** The private Supabase Storage bucket. Storage calls live only here. */
export class StorageRepository {
  private bucket() {
    return getDb().storage.from(config.storage.supabase.bucket);
  }

  /** Create the bucket on first upload — private, 10 MB, any MIME type. */
  async ensureBucket(): Promise<void> {
    const storage = getDb().storage;
    const { error } = await storage.getBucket(config.storage.supabase.bucket);
    if (!error) return;
    const { error: createError } = await storage.createBucket(
      config.storage.supabase.bucket,
      {
        public: false,
        fileSizeLimit: ATTACHMENT_MAX_BYTES,
      },
    );
    // Someone creating it at the same moment is fine — it's there either way.
    if (createError && !/exists|duplicate/i.test(createError.message)) {
      throw new ErrorResponse('GENERAL_ERROR', createError.message);
    }
  }

  async upload(path: string, body: Buffer, contentType: string): Promise<void> {
    const { error } = await this.bucket().upload(path, body, {
      contentType: contentType || 'application/octet-stream',
      upsert: true,
    });
    if (error) throw new ErrorResponse('GENERAL_ERROR', error.message);
  }

  /** Returns `null` when the object is already gone. */
  async signedUrl(path: string): Promise<string | null> {
    const { data, error } = await this.bucket().createSignedUrl(
      path,
      URL_TTL_SECONDS,
    );
    return error || !data ? null : data.signedUrl;
  }

  /**
   * Duplicate an object to another key. Used by the storage-root rename, which
   * copies first so the old path keeps working until the database has been
   * repointed — a plain `move` would leave a window where every download 404s.
   */
  async copy(from: string, to: string): Promise<void> {
    const { error } = await this.bucket().copy(from, to);
    if (error) throw new ErrorResponse('GENERAL_ERROR', error.message);
  }

  /** Throws when the link cannot be made (used for the main attachment). */
  async requireSignedUrl(path: string): Promise<string> {
    const { data, error } = await this.bucket().createSignedUrl(
      path,
      URL_TTL_SECONDS,
    );
    if (error || !data) {
      throw new ErrorResponse(
        'GENERAL_ERROR',
        error?.message ?? 'Could not create a download link.',
      );
    }
    return data.signedUrl;
  }

  /**
   * Best-effort cleanup: an orphaned file is harmless, a failed delete is not.
   * Never throws — the counts say what happened, so a caller that must report
   * the outcome (the retention cleanup) can, and the rest can ignore them.
   */
  async removeQuietly(
    paths: string[],
  ): Promise<{ removed: number; failed: number }> {
    if (paths.length === 0) return { removed: 0, failed: 0 };
    const { data, error } = await this.bucket().remove(paths);
    if (error) {
      logger.error(`Could not remove stored file: ${error.message}`);
      return { removed: 0, failed: paths.length };
    }
    return { removed: data?.length ?? 0, failed: 0 };
  }

  /**
   * Remove every file inside one folder (a deleted user's `FormAttachement/<id>`).
   * Best effort like `removeQuietly`: failures are logged, never thrown.
   */
  async removeFolder(folder: string): Promise<void> {
    const PAGE = 1000;
    // Hard cap (20 000 files) so a bad response can never loop forever.
    for (let round = 0; round < 20; round++) {
      const { data, error } = await this.bucket().list(folder, {
        limit: PAGE,
      });
      if (error) {
        logger.error(`Could not list files in ${folder}: ${error.message}`);
        return;
      }
      const paths = (data ?? [])
        .filter((entry) => entry.id !== null)
        .map((entry) => `${folder}/${entry.name}`);
      if (paths.length === 0) return;

      const { error: removeError } = await this.bucket().remove(paths);
      if (removeError) {
        logger.error(
          `Could not remove files in ${folder}: ${removeError.message}`,
        );
        return;
      }
      if ((data ?? []).length < PAGE) return;
    }
  }

  /**
   * Every object in the bucket (or under a folder), for the storage
   * dashboard's usage numbers. `list()` only returns one level, and the
   * attachments live at `FormAttachement/<uid>/<file>`, so this walks down.
   * Throws on a failed listing — the caller decides whether that is fatal.
   * Read-only: the attachment upload/download/delete paths above are
   * unchanged by it.
   */
  async listAll(
    folder = '',
  ): Promise<{ key: string; size: number; lastModified: Date | null }[]> {
    const PAGE = 1000;
    // Caps so a bad response can never loop forever: 20 pages per folder,
    // 8 levels of nesting, 50 000 objects in total.
    const MAX_ROUNDS = 20;
    const MAX_DEPTH = 8;
    const MAX_OBJECTS = 50_000;

    const objects: { key: string; size: number; lastModified: Date | null }[] =
      [];

    const walk = async (path: string, depth: number): Promise<void> => {
      if (objects.length >= MAX_OBJECTS || depth > MAX_DEPTH) return;
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const { data, error } = await this.bucket().list(path, {
          limit: PAGE,
          offset: round * PAGE,
        });
        if (error) {
          throw new ErrorResponse('GENERAL_ERROR', error.message);
        }
        for (const entry of data ?? []) {
          const key = path ? `${path}/${entry.name}` : entry.name;
          if (entry.id === null) {
            // A folder — descend into it.
            await walk(key, depth + 1);
          } else {
            objects.push({
              key,
              size: entry.metadata?.size ?? 0,
              lastModified: entry.created_at
                ? new Date(entry.created_at)
                : null,
            });
          }
          if (objects.length >= MAX_OBJECTS) return;
        }
        if ((data ?? []).length < PAGE) return;
      }
    };

    await walk(folder, 0);
    return objects;
  }
}
