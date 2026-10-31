import { randomUUID } from 'crypto';
import { ErrorResponse, ServiceResponse } from '../../../common/shared';
import type { SessionUser } from '@swiftslip/shared/types';
import { ActivityLogService } from '../../activity-log';
import {
  AttachmentRepository,
  STORAGE_ROOT,
  StorageRepository,
} from '../repositories';
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
 * one is not bound to a single table — every method takes the `target` the
 * route was mounted on — so it holds one repository per table instead of
 * extending `BaseService`.
 */
class AttachmentService {
  private readonly repos = new Map<AttachmentTable, AttachmentRepository>();
  private readonly storage = new StorageRepository();

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
    return row as typeof row & { other_attachments?: unknown };
  }

  /**
   * Store the document at `FormAttachement/<owner-id>/<row-id>-<filename>` and
   * point the row at it. A failed row update rolls the fresh upload back so
   * no orphan file is left.
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
      const path = `${STORAGE_ROOT}/${user.id}/${row.id}-${name}`;

      await this.storage.ensureBucket();
      await this.storage.upload(path, buffer, contentType);

      try {
        await this.repo(target.table).update(
          { id: row.id, owner_id: user.id },
          {
            attachment_path: path,
            attachment_name: name,
            updated_at: new Date().toISOString(),
          },
        );
      } catch (error) {
        // Roll the fresh upload back so a failed save can't leave an orphan.
        if (row.attachment_path !== path)
          await this.storage.removeQuietly([path]);
        throw error;
      }

      // Same path = replaced in place; nothing to clean up.
      if (row.attachment_path && row.attachment_path !== path) {
        await this.storage.removeQuietly([row.attachment_path]);
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
      const url = await this.storage.requireSignedUrl(row.attachment_path);
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
        await this.storage.removeQuietly([row.attachment_path]);
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
     Additional supporting files (LOA and OT only): up to
     OTHER_ATTACHMENTS_MAX per form beside the single certificate, stored in
     the row's `other_attachments` jsonb list.
     ------------------------------------------------------------------ */

  private assertHasOthers(
    table: AttachmentTable,
  ): asserts table is OtherAttachmentTable {
    if (table !== 'loa_forms' && table !== 'ot_forms') {
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
      // The random segment means two files that share a name never collide.
      const unique = randomUUID().slice(0, 8);
      const path = `${STORAGE_ROOT}/${user.id}/${row.id}-extra-${unique}-${name}`;

      await this.storage.ensureBucket();
      await this.storage.upload(path, buffer, contentType);
      try {
        await this.repo(target.table).update(
          { id: row.id, owner_id: user.id },
          {
            other_attachments: [...current, { path, name }],
            updated_at: new Date().toISOString(),
          } as never,
        );
      } catch (error) {
        await this.storage.removeQuietly([path]);
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
          const url = await this.storage.signedUrl(file.path);
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
      await this.storage.removeQuietly([path]);

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
   * Never throws; the counts are there for callers that report the outcome.
   */
  removeFiles(
    paths: (string | null | undefined)[],
  ): Promise<{ removed: number; failed: number }> {
    return this.storage.removeQuietly(
      paths.filter((path): path is string => Boolean(path)),
    );
  }

  removeUserFiles(userId: string): Promise<void> {
    return this.storage.removeFolder(`${STORAGE_ROOT}/${userId}`);
  }
}

export default new AttachmentService();
