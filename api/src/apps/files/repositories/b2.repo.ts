import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ErrorResponse } from '../../../common/shared';
import { logger } from '../../../common/shared/services';
import { config } from '../../../core/config';

/** Presigned links are short-lived, per the storage guide (5 minutes). */
const URL_TTL_SECONDS = 5 * 60;

const toError = (error: unknown, action: string) =>
  new ErrorResponse(
    'GENERAL_ERROR',
    `Could not ${action} the stored file: ${(error as Error).message}`,
  );

/**
 * Backblaze B2 through its S3-compatible API. This is the optional SECOND
 * storage backend for new features; the existing attachments stay on Supabase
 * Storage and never reach this repository.
 *
 * Only the backend holds the upload key. The browser uploads bytes to the API
 * (never straight to B2), and receives a short-lived presigned GET URL back —
 * so a file stays owner-only while the bucket stays private.
 */
export class B2Repository {
  private client: S3Client | null = null;

  /** Refuse early (503) while the B2 variables are unset. */
  assertConfigured(): void {
    if (!config.storage.b2.configured) {
      throw new ErrorResponse(
        'SERVICE_UNAVAILABLE',
        'File storage is not configured. Add the B2_* variables to api/.env.',
      );
    }
  }

  private b2(): S3Client {
    this.assertConfigured();
    const { endpoint, region, uploadKeyId, uploadAppKey } = config.storage.b2;
    if (!this.client) {
      this.client = new S3Client({
        region,
        endpoint,
        credentials: {
          accessKeyId: uploadKeyId as string,
          secretAccessKey: uploadAppKey as string,
        },
      });
    }
    return this.client;
  }

  private bucket(): string {
    return config.storage.b2.bucket;
  }

  async upload(key: string, body: Buffer, contentType: string): Promise<void> {
    try {
      await this.b2().send(
        new PutObjectCommand({
          Bucket: this.bucket(),
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    } catch (error) {
      if (error instanceof ErrorResponse) throw error;
      throw toError(error, 'store');
    }
  }

  /** A 5-minute presigned GET URL for one object. */
  async signedGetUrl(key: string): Promise<string> {
    try {
      return await getSignedUrl(
        this.b2(),
        new GetObjectCommand({ Bucket: this.bucket(), Key: key }),
        { expiresIn: URL_TTL_SECONDS },
      );
    } catch (error) {
      if (error instanceof ErrorResponse) throw error;
      throw toError(error, 'link');
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await this.b2().send(
        new DeleteObjectCommand({ Bucket: this.bucket(), Key: key }),
      );
    } catch (error) {
      if (error instanceof ErrorResponse) throw error;
      throw toError(error, 'remove');
    }
  }

  /**
   * Best-effort cleanup: an orphaned object is harmless, a failed request is
   * not. Never throws — the counts say what happened, so the account-delete
   * path can log a partial cleanup without failing the request.
   */
  async removeQuietly(
    keys: string[],
  ): Promise<{ removed: number; failed: number }> {
    let removed = 0;
    let failed = 0;
    for (const key of keys) {
      try {
        await this.remove(key);
        removed += 1;
      } catch (error) {
        failed += 1;
        logger.error(
          `Could not remove stored file ${key}: ${(error as Error).message}`,
        );
      }
    }
    return { removed, failed };
  }

  /**
   * Every object under a prefix (the whole bucket when the prefix is empty),
   * for the storage dashboard's usage numbers. Throws on a failed listing —
   * the caller decides whether that is fatal.
   */
  async list(
    prefix = '',
  ): Promise<{ key: string; size: number; lastModified: Date | null }[]> {
    const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
    const objects: { key: string; size: number; lastModified: Date | null }[] =
      [];
    let token: string | undefined;
    do {
      const data = await this.b2().send(
        new ListObjectsV2Command({
          Bucket: this.bucket(),
          Prefix: prefix,
          ContinuationToken: token,
        }),
      );
      for (const object of data.Contents ?? []) {
        if (!object.Key) continue;
        objects.push({
          key: object.Key,
          size: object.Size ?? 0,
          lastModified: object.LastModified
            ? new Date(object.LastModified)
            : null,
        });
      }
      token = data.IsTruncated ? data.NextContinuationToken : undefined;
    } while (token);
    return objects;
  }

  /** Remove every object under a prefix. Best effort: failures are logged. */
  async removePrefix(prefix: string): Promise<void> {
    try {
      const objects = await this.list(prefix);
      await this.removeQuietly(objects.map((object) => object.key));
    } catch (error) {
      logger.error(
        `Could not remove stored files under ${prefix}: ${(error as Error).message}`,
      );
    }
  }
}
