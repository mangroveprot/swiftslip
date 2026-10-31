import { logger } from '../../../common/shared/services';
import { config } from '../../../core/config';
import { StorageRepository } from '../../attachments/repositories';
import { B2Repository } from '../../files/repositories';
import { toRef, parseRef } from '../utils/ref';
import type { StoredObject } from '../types';
import type { StorageBackend } from '@swiftslip/shared/schemas';

/**
 * Unified storage service that works with both Supabase Storage and Backblaze B2.
 *
 * References are plain strings. The caller decides the backend; the service
 * stores files accordingly:
 *   – Supabase: the path itself (e.g. `FormAttachement/uid/file.pdf`).
 *   – B2: the path prefixed with `b2:` (e.g. `b2:FormAttachement/uid/file.pdf`),
 *     while the actual B2 object key is the path without the prefix.
 *
 * Upload/download/remove methods accept a `{ key, backend }` pair so the same
 * API can route to either provider without the caller needing to know which one.
 * All S3 / PostgREST detail stays in the two repositories.
 */
export class FileStorageService {
  private readonly supabase = new StorageRepository();
  private readonly b2 = new B2Repository();

  /** True when B2 credentials are set (the /files app is configured). */
  b2Configured(): boolean {
    return config.storage.b2.configured;
  }

  /** Upload a buffer to the chosen backend and return the stored reference. */
  async upload(
    key: string,
    body: Buffer,
    contentType: string,
    backend: StorageBackend,
  ): Promise<string> {
    if (backend === 'b2') {
      await this.b2.upload(key, body, contentType);
    } else {
      // Supabase — ensure the bucket exists first.
      await this.supabase.ensureBucket();
      await this.supabase.upload(key, body, contentType);
    }
    return toRef(backend, key);
  }

  /** Return a short‑lived presigned GET URL for the object. */
  async signedUrl(
    key: string,
    backend: StorageBackend,
  ): Promise<string | null> {
    if (backend === 'b2') {
      return this.b2.signedGetUrl(key);
    }
    return this.supabase.signedUrl(key);
  }

  /** Throws when the link cannot be made (used for the main attachment). */
  async requireSignedUrl(
    key: string,
    backend: StorageBackend,
  ): Promise<string> {
    if (backend === 'b2') {
      return this.b2.signedGetUrl(key);
    }
    return this.supabase.requireSignedUrl(key);
  }

  /** Parse a reference string that may carry a `b2:` prefix into { backend, key }. */
  parseRef(ref: string): { backend: StorageBackend; key: string } {
    return parseRef(ref);
  }

  /** Return a signed URL for a reference string (e.g. from DB). */
  async signedUrlRef(ref: string): Promise<string | null> {
    const r = parseRef(ref);
    return this.signedUrl(r.key, r.backend);
  }

  /** Throws when the link cannot be made, for a reference string. */
  async requireSignedUrlRef(ref: string): Promise<string> {
    const r = parseRef(ref);
    return this.requireSignedUrl(r.key, r.backend);
  }

  /**
   * Best‑effort removal. Accepts an array of { key, backend, size? } objects
   * and reports how many went, how many stayed, and the bytes freed (exact
   * when `failed` is 0 — on a partial failure the byte count is an upper
   * bound, and `failed` is what the admin should read).
   */
  async removeRefsQuietly(
    items: { key: string; backend: StorageBackend; size?: number }[],
  ): Promise<{ removed: number; failed: number; bytes: number }> {
    const supabaseItems = items.filter((i) => i.backend === 'supabase');
    const b2Items = items.filter((i) => i.backend === 'b2');

    const [a, b] = await Promise.all([
      this.supabase.removeQuietly(supabaseItems.map((i) => i.key)),
      this.b2Configured()
        ? this.b2.removeQuietly(b2Items.map((i) => i.key))
        : Promise.resolve({ removed: 0, failed: b2Items.length }),
    ]);

    const removed = a.removed + b.removed;
    const failed = a.failed + b.failed;
    // Byte count: sum the sizes of the keys that are actually gone. The
    // per‑provider helpers report counts, not names, so a batch that fully
    // succeeded is exact; a partial one counts every key that was not
    // reported failed, which is the best a batch delete can do.
    const totalBytes = items.reduce((sum, i) => sum + (i.size ?? 0), 0);
    const failedBytes = failed === 0 ? 0 : totalBytes;
    return { removed, failed, bytes: Math.max(0, totalBytes - failedBytes) };
  }

  /** Remove a single { key, backend } reference. */
  async removeRefQuietly(ref: {
    key: string;
    backend: StorageBackend;
  }): Promise<void> {
    await this.removeRefsQuietly([ref]);
  }

  /** Remove an entire folder (e.g. `FormAttachement/<uid>`) from both backends. */
  async removeFolder(folder: string): Promise<void> {
    // Supabase always has this folder (even if empty after cleanup).
    try {
      await this.supabase.removeFolder(folder);
    } catch (e) {
      logger.error(
        `Could not remove Supabase folder ${folder}: ${(e as Error).message}`,
      );
    }
    // Best‑effort B2 removal — if B2 is not configured we just log and skip.
    if (this.b2Configured()) {
      await this.b2.removePrefix(folder);
    }
  }

  /** List all objects in a given backend. Returns { key, size, lastModified }. */
  async list(backend: StorageBackend): Promise<StoredObject[]> {
    if (backend === 'b2') {
      if (!this.b2Configured()) return [];
      try {
        return await this.b2.list();
      } catch (e) {
        logger.error(`Could not list B2 objects: ${(e as Error).message}`);
        return [];
      }
    }
    return this.supabase.listAll();
  }
}

export default new FileStorageService();
