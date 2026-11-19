import type { StorageBackend } from '@swiftslip/shared/types';
import type {
  ShowroomPhotoUploadRequest,
  ShowroomPhotoUploadResult,
} from '@swiftslip/shared/showrooms';
import { ErrorResponse, ServiceResponse } from '../../../common/shared';
import { logger } from '../../../common/shared/services';
import type { SessionUser } from '@swiftslip/shared/types';
import { readThumbnail, readUpload } from '../../attachments/utils';
import FileStorageService from '../../storage/services/file-storage.service';
import StorageService from '../../storage/services/storage.service';
import {
  prefixedStorageKey,
  INVENTORY_MEDIA_ROOT,
} from '../../storage/utils/key';
import { parseRef, toRef } from '../../storage/utils/ref';
import { InventoryShowroomRepository } from '../repositories';

/** Everything staged by the inventory app lives under this prefix. */
export const INVENTORY_STAGED_ROOT = `${INVENTORY_MEDIA_ROOT}/staged`;

/** A staged upload is one showroom picture; that is the whole accepted set. */
const PHOTO_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
]);

/** An abandoned staging upload is swept after a day. */
const STAGED_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** The sweep lists both buckets, so it runs at most once an hour per process. */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

let lastSweepAt = 0;

/** `<root>/staged/<account>/…` - the only refs this account may attach. */
function stagedPrefix(userId: string): string {
  return `${INVENTORY_STAGED_ROOT}/${userId}`;
}

/** True when `ref` points at an upload staged by this account. */
export function isOwnedStagedRef(ref: string, userId: string): boolean {
  const { key } = parseRef(ref);
  return key.startsWith(`${stagedPrefix(userId)}/`);
}

/**
 * The preview stored beside a picture. Staging always names it by replacing
 * the extension with `.thumb.webp`, so a ref is enough to find (or discard) it.
 */
export function stagedThumbRef(ref: string): string {
  const { backend, key } = parseRef(ref);
  return toRef(backend, key.replace(/\.[^./]+$/, '.thumb.webp'));
}

const toFailure = (error: unknown): ServiceResponse<never> => ({
  success: false,
  error:
    error instanceof ErrorResponse
      ? error
      : new ErrorResponse('INTERNAL_SERVER_ERROR', (error as Error).message),
});

/**
 * Staging for the three showroom pictures.
 *
 * The drawer has to let the owner pick a picture before a showroom id exists,
 * so the bytes are uploaded first under `InventoryMedia/staged/<account>/` and
 * the save request carries the returned refs. Nothing is moved afterwards: the
 * DB stores the staged ref, which makes delete/replace/record-delete all work
 * from one string. Staged files are removed on cancel, and a once-an-hour
 * sweep clears anything a closed tab left behind after 24 hours.
 */
class InventoryPhotoService {
  private readonly repository = new InventoryShowroomRepository();

  /** `POST /inventory/showrooms/photos/staged`. */
  async stage(
    actor: SessionUser,
    input: ShowroomPhotoUploadRequest,
  ): Promise<ServiceResponse<ShowroomPhotoUploadResult>> {
    try {
      const { buffer, contentType, name } = readUpload(input);
      if (!PHOTO_TYPES.has(contentType)) {
        throw new ErrorResponse(
          'UNSUPPORTED_MEDIA_TYPE',
          'Showroom photos must be a JPG, PNG, WebP, GIF or BMP image.',
        );
      }

      const preview = readThumbnail(input.thumbBase64);
      const backend = await StorageService.pickBackend();
      const key = prefixedStorageKey(stagedPrefix(actor.id), contentType, name);
      const photoRef = await FileStorageService.upload(
        key,
        buffer,
        contentType,
        backend,
      );

      // A missing/failed preview only costs the board thumbnail; the picture
      // itself is already safe, so this is best-effort on purpose.
      let thumbRef: string | null = null;
      if (preview) {
        try {
          thumbRef = await FileStorageService.upload(
            key.replace(/\.[^./]+$/, '.thumb.webp'),
            preview.buffer,
            preview.contentType,
            backend,
          );
        } catch (error) {
          logger.error(
            `Could not store a showroom photo preview: ${(error as Error).message}`,
          );
        }
      }

      this.sweepSoon();
      return {
        success: true,
        document: {
          photoRef,
          thumbRef,
          filename: name,
          byteSize: buffer.byteLength,
        },
      };
    } catch (error) {
      return toFailure(error);
    }
  }

  /** `DELETE /inventory/showrooms/photos/staged?ref=…` (drawer cancelled). */
  async discard(
    actor: SessionUser,
    ref: string,
  ): Promise<ServiceResponse<{ removed: number }>> {
    try {
      if (!isOwnedStagedRef(ref, actor.id)) {
        throw new ErrorResponse(
          'BAD_REQUEST',
          'That upload does not belong to this account.',
        );
      }

      // Saved pictures keep their staged key, so a cancel must never remove an
      // object the showroom rows already point at.
      const rows = await this.repository.allPhotoRefs();
      const { backend, key } = parseRef(ref);
      const saved = rows.some((row) =>
        [row.photo_ref, row.thumb_ref].some((value) => {
          if (!value) return false;
          const parsed = parseRef(value);
          return parsed.backend === backend && parsed.key === key;
        }),
      );
      if (saved) {
        throw new ErrorResponse(
          'BAD_REQUEST',
          'That photo is already saved to a showroom.',
        );
      }

      const result = await FileStorageService.removeRefsQuietly([
        parseRef(ref),
        parseRef(stagedThumbRef(ref)),
      ]);
      return { success: true, document: { removed: result.removed } };
    } catch (error) {
      return toFailure(error);
    }
  }

  /**
   * Delete abandoned staging objects older than a day from both backends.
   * Fire-and-forget: a failed sweep must never fail the upload that triggered
   * it, and the storage layer reports its own errors.
   */
  private sweepSoon(): void {
    const now = Date.now();
    if (now - lastSweepAt < SWEEP_INTERVAL_MS) return;
    lastSweepAt = now;
    void this.sweepStaged();
  }

  private async sweepStaged(): Promise<void> {
    try {
      // A saved photo keeps its staged key, so "old" is not enough: anything
      // the showroom rows still point at is live and must survive the sweep.
      const rows = await this.repository.allPhotoRefs();
      const inUse = new Set<string>();
      for (const row of rows) {
        for (const ref of [row.photo_ref, row.thumb_ref]) {
          if (!ref) continue;
          const { backend, key } = parseRef(ref);
          inUse.add(`${backend}:${key}`);
        }
      }

      const backends: StorageBackend[] = ['supabase', 'b2'];
      const listings = await Promise.all(
        backends.map((backend) => FileStorageService.list(backend)),
      );
      const now = Date.now();
      const stale: { key: string; backend: StorageBackend }[] = [];
      listings.forEach((objects, index) => {
        const backend = backends[index] ?? 'supabase';
        for (const object of objects) {
          if (!object.key.startsWith(`${INVENTORY_STAGED_ROOT}/`)) continue;
          if (inUse.has(`${backend}:${object.key}`)) continue;
          const modified = object.lastModified?.getTime();
          if (modified != null && now - modified < STAGED_MAX_AGE_MS) continue;
          stale.push({ key: object.key, backend });
        }
      });
      if (stale.length === 0) return;
      const result = await FileStorageService.removeRefsQuietly(stale);
      if (result.removed > 0) {
        logger.info(
          `Swept ${result.removed} abandoned showroom photo upload(s).`,
        );
      }
    } catch (error) {
      logger.error(
        `Could not sweep staged showroom photos: ${(error as Error).message}`,
      );
    }
  }
}

export default new InventoryPhotoService();
