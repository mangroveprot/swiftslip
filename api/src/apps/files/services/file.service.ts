import { ErrorResponse, ServiceResponse } from '../../../common/shared';
import { logger } from '../../../common/shared/services';
import { config } from '../../../core/config';
import { BaseService } from '../../../core/engine';
import type { FileLink, StoredFile } from '@swiftslip/shared/api-types';
import type { SessionUser } from '@swiftslip/shared/types';
import { readUpload } from '../../attachments/utils';
import { B2Repository, FileRepository } from '../repositories';
import type { FileUploadInput } from '../types';
import { storageKey } from '../utils';

const toFailure = (error: unknown) => ({
  success: false as const,
  error:
    error instanceof ErrorResponse
      ? error
      : new ErrorResponse('INTERNAL_SERVER_ERROR', (error as Error).message),
});

/**
 * The optional B2 file store for future features. The existing form
 * attachments still go through `AttachmentService` / Supabase Storage — this
 * service shares nothing with them except the upload validator.
 *
 * Uploads are relayed by the API, so the same magic-byte check as an
 * attachment runs before anything is stored. Downloads are short-lived
 * presigned GET URLs, handed out only after an owner check.
 */
class FileService extends BaseService<'files', FileRepository> {
  private readonly storage = new B2Repository();

  constructor() {
    super(new FileRepository());
  }

  async upload(
    user: SessionUser,
    input: FileUploadInput,
  ): Promise<ServiceResponse<StoredFile>> {
    let key = '';
    try {
      this.storage.assertConfigured();
      // Decodes the bytes, confirms the real type from them, and refuses a
      // misleading filename — the exact gate the attachments use.
      const { buffer, contentType, name } = readUpload(input);
      if (!config.storage.allowedMime.includes(contentType)) {
        throw new ErrorResponse(
          'UNSUPPORTED_MEDIA_TYPE',
          `That file type isn't accepted here. Allowed: ${config.storage.allowedMime.join(', ')}.`,
        );
      }
      if (buffer.byteLength > config.storage.maxUploadBytes) {
        const limit = Math.round(config.storage.maxUploadBytes / (1024 * 1024));
        throw new ErrorResponse(
          'PAYLOAD_TOO_LARGE',
          `Files must be ${limit} MB or smaller.`,
        );
      }

      key = storageKey(contentType, name);
      await this.storage.upload(key, buffer, contentType);

      try {
        await this.repository.create({
          key,
          original_name: name,
          mime_type: contentType,
          size_bytes: buffer.byteLength,
          owner_id: user.id,
          entity_type: input.entityType ?? null,
          entity_id: input.entityId ?? null,
        });
      } catch (error) {
        // A row that failed to save must not leave an orphan object behind.
        await this.storage.removeQuietly([key]);
        throw error;
      }

      return { success: true, document: { key, name } };
    } catch (error) {
      return toFailure(error);
    }
  }

  /** Presigned GET after proving the caller owns the key. */
  async downloadUrl(
    userId: string,
    key: string,
  ): Promise<ServiceResponse<FileLink>> {
    try {
      this.storage.assertConfigured();
      const row = await this.repository.findOne({ key, owner_id: userId });
      if (!row) throw new ErrorResponse('NOT_FOUND_ERROR', 'File not found.');
      const url = await this.storage.signedGetUrl(row.key);
      return {
        success: true,
        document: { url, name: row.original_name, mimeType: row.mime_type },
      };
    } catch (error) {
      return toFailure(error);
    }
  }

  async remove(
    user: SessionUser,
    key: string,
  ): Promise<ServiceResponse<StoredFile>> {
    try {
      this.storage.assertConfigured();
      const row = await this.repository.findOne({ key, owner_id: user.id });
      if (!row) throw new ErrorResponse('NOT_FOUND_ERROR', 'File not found.');
      // Row first, bytes second: a leftover object is a harmless orphan, while
      // a row pointing at a missing object would show a broken file.
      await this.repository.delete({ id: row.id, owner_id: user.id });
      await this.storage.removeQuietly([row.key]);
      return {
        success: true,
        document: { key: row.key, name: row.original_name },
      };
    } catch (error) {
      return toFailure(error);
    }
  }

  /**
   * For the account-deletion path: drop every stored object and its row.
   * Best effort like the Supabase folder cleanup — failures are logged, never
   * thrown, because the account is already gone when this runs.
   */
  async removeUserFiles(userId: string): Promise<void> {
    // Nothing to do (and no table round-trip) while the backend is switched off.
    if (!config.storage.b2.configured) return;
    try {
      const rows = await this.repository.findAll({ owner_id: userId });
      if (rows.length === 0) return;
      await this.storage.removeQuietly(rows.map((row) => row.key));
      await this.repository.deleteMany({ owner_id: userId });
    } catch (error) {
      logger.error(
        `Could not remove stored files for a deleted user: ${(error as Error).message}`,
      );
    }
  }
}

export default new FileService();
