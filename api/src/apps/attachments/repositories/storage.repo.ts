import { ErrorResponse } from '../../../common/shared';
import { logger } from '../../../common/shared/services';
import { getDb } from '../../../core/framework/databases/supabase';
import { ATTACHMENT_MAX_BYTES } from '../utils';

const BUCKET = 'swiftslip';
/** Every user's documents live in their own folder: ApprovalSlip/<their id>/. */
export const STORAGE_ROOT = 'ApprovalSlip';
/** Signed download links live for an hour — long enough to view or re-download. */
const URL_TTL_SECONDS = 60 * 60;

/** The private Supabase Storage bucket. Storage calls live only here. */
export class StorageRepository {
  private bucket() {
    return getDb().storage.from(BUCKET);
  }

  /** Create the bucket on first upload — private, 10 MB, any MIME type. */
  async ensureBucket(): Promise<void> {
    const storage = getDb().storage;
    const { error } = await storage.getBucket(BUCKET);
    if (!error) return;
    const { error: createError } = await storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: ATTACHMENT_MAX_BYTES,
    });
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
   * Remove every file inside one folder (a deleted user's `ApprovalSlip/<id>`).
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
}
