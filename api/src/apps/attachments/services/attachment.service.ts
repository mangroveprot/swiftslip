import { ErrorResponse, ServiceResponse } from '../../../common/shared';
import type { SessionUser, StorageBackend } from '@swiftslip/shared/types';
import { ActivityLogService } from '../../activity-log';
import FileStorageService from '../../storage/services/file-storage.service';
import StorageService from '../../storage/services/storage.service';
import { backendOf } from '../../storage/utils/backend';
import { prefixedStorageKey } from '../../storage/utils/key';
import { AttachmentRepository, STORAGE_ROOT } from '../repositories';
import type {
  AttachmentTable,
  AttachmentTarget,
  OtherAttachmentTable,
} from '../types';
import { readOtherFiles, readUpload } from '../utils';

/** Cap on a form's additional supporting files. */
export const OTHER_ATTACHMENTS_MAX = 8;

type UploadInput = {
  id: string;
  filename: string;
  contentType: string;
  base64: string;
};

const toFailure = (error: unknown) => ({
  success: false as const,
  error:
    error instanceof ErrorResponse
      ? error
      : new ErrorResponse('INTERNAL_SERVER_ERROR', (error as Error).message),
});

/**
 * Documents attached to a form or DTR record. Unlike the other services this
 * one is not bound to a single table, every method takes the `target` the
 * route was mounted on, so it holds one repository per table instead of
 * extending `BaseService`.
 *
 * All storage calls go through the unified `FileStorageService` so the admin's
 * storage rule (supabase-first / b2-only / supabase-only) actually governs
 * where uploads land.
 */
class AttachmentService {
  private readonly repos = new Map<AttachmentTable, AttachmentRepository>();
  private readonly storage = FileStorageService;
  private readonly storageService = StorageService;

  private repo(table: AttachmentTable): AttachmentRepository {
    let repo = this.repos.get(table);
    if (!repo) {
      repo = new AttachmentRepository(table);
      this.repos.set(table, repo);
    }
    return repo;
  }

  /** The owner's row, or a 404 that names it ("Form not found."). */
  private async ownedRow(
    table: AttachmentTable,
    entity: string,
    id: string,
    ownerId: string,
  ) {
    const row = await this.repo(table).findOne({
      id,
      owner_id: ownerId,
    });
    if (!row)
      throw new ErrorResponse('NOT_FOUND_ERROR', `${entity} not found.`);
    return row as typeof row & {
      other_attachments?: unknown;
      attachment_backend?: string;
    };
  }

  /**
   * Store the document at `FormAttachement/<owner-id>/<uuid>.<ext>` and point
   * the row at it. A failed row update rolls the fresh upload back so no
   * orphan file is left. The backend is chosen by the admin's storage rule.
   */
  async upload(
    user: SessionUser,
    target: AttachmentTarget,
    input: UploadInput,
  ): Promise<ServiceResponse<{ name: string }>> {
    try {
      const row = await this.ownedRow(
        target.table,
        target.entity,
        input.id,
        user.id,
      );
      const { buffer, contentType, name } = readUpload(input);
      const backend = await this.storageService.pickBackend();
      const path = prefixedStorageKey(
        `${STORAGE_ROOT}/${user.id}`,
        contentType,
        name,
      );

      await this.storage.upload(path, buffer, contentType, backend);

      try {
        await this.repo(target.table).update(
          { id: row.id, owner_id: user.id },
          {
            attachment_path: path,
            attachment_name: name,
            attachment_backend: backend,
            updated_at: new Date().toISOString(),
          },
        );
      } catch (error) {
        // Roll the fresh upload back so a failed save can't leave an orphan.
        if (row.attachment_path !== path)
          await this.storage.removeRefQuietly({ key: path, backend });
        throw error;
      }

      // Same path = replaced in place; nothing to clean up.
      if (row.attachment_path && row.attachment_path !== path) {
        await this.storage.removeRefQuietly({
          key: row.attachment_path,
          backend: backendOf(row.attachment_backend),
        });
      }

      await ActivityLogService.logBy(user, {
        action: 'attachment.uploaded',
        target: `${target.logLabel} ${input.id}`,
        detail: name,
      });
      return { success: true, document: { name } };
    } catch (error) {
      return toFailure(error);
    }
  }

  /** Short-lived signed link to the attachment (no `document` when none). */
  async getUrl(
    userId: string,
    target: AttachmentTarget,
    id: string,
  ): Promise<ServiceResponse<{ url: string; name: string }>> {
    try {
      const row = await this.ownedRow(target.table, target.entity, id, userId);
      if (!row.attachment_path) return { success: true };
      const backend = backendOf(row.attachment_backend);
      const url = await this.storage.requireSignedUrl(
        row.attachment_path,
        backend,
      );
      return {
        success: true,
        document: { url, name: row.attachment_name ?? 'attachment' },
      };
    } catch (error) {
      return toFailure(error);
    }
  }

  /**
   * Detach the attachment; the stored file goes too. OB, LOA, COS and OT tie
   * their approval mark to the file, so removing it revokes the approval. DTR
   * records have no approval step.
   */
  async remove(
    user: SessionUser,
    target: AttachmentTarget,
    id: string,
  ): Promise<ServiceResponse<{ name: string }>> {
    try {
      const row = await this.ownedRow(target.table, target.entity, id, user.id);
      const clearApproval = target.table !== 'dtr_records';
      await this.repo(target.table).update(
        { id, owner_id: user.id },
        {
          attachment_path: null,
          attachment_name: null,
          ...(clearApproval ? { attachment_approved: false } : {}),
          updated_at: new Date().toISOString(),
        },
      );
      if (row.attachment_path) {
        await this.storage.removeRefQuietly({
          key: row.attachment_path,
          backend: backendOf(row.attachment_backend),
        });
      }
      const name = row.attachment_name ?? '';
      await ActivityLogService.logBy(user, {
        action: 'attachment.removed',
        target: `${target.logLabel} ${id}`,
        detail: name || null,
      });
      return { success: true, document: { name } };
    } catch (error) {
      return toFailure(error);
    }
  }

  /* ------------------------------------------------------------------
     Additional supporting files (LOA, OT and DTR records): up to
     OTHER_ATTACHMENTS_MAX per form beside the single certificate, stored in
     the row's `other_attachments` jsonb list.
     ------------------------------------------------------------------ */

  private assertHasOthers(
    table: AttachmentTable,
  ): asserts table is OtherAttachmentTable {
    if (
      table !== 'loa_forms' &&
      table !== 'ot_forms' &&
      table !== 'dtr_records'
    ) {
      throw new ErrorResponse(
        'BAD_REQUEST',
        'This form has no additional files.',
      );
    }
  }

  async uploadOther(
    user: SessionUser,
    target: AttachmentTarget,
    input: UploadInput,
  ): Promise<ServiceResponse<{ name: string }>> {
    try {
      this.assertHasOthers(target.table);
      const row = await this.ownedRow(
        target.table,
        target.otherEntity,
        input.id,
        user.id,
      );
      const current = readOtherFiles(row.other_attachments);
      if (current.length >= OTHER_ATTACHMENTS_MAX) {
        throw new ErrorResponse(
          'BAD_REQUEST',
          `A form can hold up to ${OTHER_ATTACHMENTS_MAX} additional files.`,
        );
      }

      const { buffer, contentType, name } = readUpload(input);
      const backend = await this.storageService.pickBackend();
      const path = prefixedStorageKey(
        `${STORAGE_ROOT}/${user.id}`,
        contentType,
        name,
      );

      await this.storage.upload(path, buffer, contentType, backend);
      try {
        await this.repo(target.table).update(
          { id: row.id, owner_id: user.id },
          {
            other_attachments: [...current, { path, name, backend }],
            updated_at: new Date().toISOString(),
          } as never,
        );
      } catch (error) {
        await this.storage.removeRefQuietly({ key: path, backend });
        throw error;
      }

      await ActivityLogService.logBy(user, {
        action: 'attachment.uploaded',
        target: `${target.logLabel} ${input.id}`,
        detail: name,
      });
      return { success: true, document: { name } };
    } catch (error) {
      return toFailure(error);
    }
  }

  /** Signed links for every additional file, keyed by storage path. */
  async otherUrls(
    userId: string,
    target: AttachmentTarget,
    id: string,
  ): Promise<ServiceResponse<Record<string, string>>> {
    try {
      this.assertHasOthers(target.table);
      const row = await this.ownedRow(
        target.table,
        target.otherEntity,
        id,
        userId,
      );
      const signed = await Promise.all(
        readOtherFiles(row.other_attachments).map(async (file) => {
          const url = await this.storage.signedUrl(
            file.path,
            file.backend ?? 'supabase',
          );
          // A file whose object is already gone simply drops out of the list.
          return url ? ([file.path, url] as const) : null;
        }),
      );
      const document = Object.fromEntries(
        signed.filter((e): e is readonly [string, string] => e !== null),
      );
      return { success: true, document };
    } catch (error) {
      return toFailure(error);
    }
  }

  async removeOther(
    user: SessionUser,
    target: AttachmentTarget,
    id: string,
    path: string,
  ): Promise<ServiceResponse<{ name: string }>> {
    try {
      this.assertHasOthers(target.table);
      const row = await this.ownedRow(
        target.table,
        target.otherEntity,
        id,
        user.id,
      );
      const files = readOtherFiles(row.other_attachments);
      const found = files.find((file) => file.path === path);
      if (!found) throw new ErrorResponse('NOT_FOUND_ERROR', 'File not found.');

      await this.repo(target.table).update({ id: row.id, owner_id: user.id }, {
        other_attachments: files.filter((file) => file.path !== path),
        updated_at: new Date().toISOString(),
      } as never);
      await this.storage.removeRefQuietly({
        key: path,
        backend: found.backend ?? 'supabase',
      });

      await ActivityLogService.logBy(user, {
        action: 'attachment.removed',
        target: `${target.logLabel} ${id}`,
        detail: found.name || null,
      });
      return { success: true, document: { name: found.name } };
    } catch (error) {
      return toFailure(error);
    }
  }

  /**
   * For form services deleting a row: drop its stored files, best effort.
   * Accepts either plain paths (legacy Supabase-only rows) or { key, backend }
   * objects so the correct backend is cleaned up.
   *
   * Never throws; the counts are there for callers that report the outcome.
   */
  async removeFiles(
    refs: (string | { key: string; backend?: StorageBackend })[],
  ): Promise<{ removed: number; failed: number }> {
    const items = refs
      .filter(
        (ref): ref is string | { key: string; backend?: StorageBackend } =>
          Boolean(ref),
      )
      .map((ref) =>
        typeof ref === 'string'
          ? { key: ref, backend: 'supabase' as StorageBackend }
          : { key: ref.key, backend: ref.backend ?? 'supabase' },
      );
    if (items.length === 0) return { removed: 0, failed: 0 };
    const result = await this.storage.removeRefsQuietly(items);
    return { removed: result.removed, failed: result.failed };
  }

  removeUserFiles(userId: string): Promise<void> {
    return this.storage.removeFolder(`${STORAGE_ROOT}/${userId}`);
  }
}

export default new AttachmentService();
