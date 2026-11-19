import { BaseRepository } from '../../../core/engine';
import type { TableName } from '../../../core/engine';
import type { StorageReference } from '@swiftslip/shared/schemas';
import { isImagePath, thumbPathOf } from '@swiftslip/shared/attachment-files';
import {
  ATTACHMENT_TABLES,
  hasOtherAttachments,
} from '../../attachments/types';

const PAGE = 1000;

/**
 * `users.id` is a uuid column. A storage key is free text, and one segment is
 * used as an owner id, so a hand-renamed (or otherwise malformed) object can
 * carry a value that is not a uuid at all.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Form tables that carry `attachment_path` and `attachment_backend`, built from
 * the same list the upload routes accept.
 *
 * This used to be a hand-kept list, which is how `liq_forms` (Statement of
 * Liquidation) was missed: every LIQ attachment and its thumbnail read as
 * unreferenced, so the cleanup offered a live form's file for deletion.
 * `AttachmentTable` now has a runtime value and the upload guard uses it too,
 * so a form cannot be uploadable without being scannable.
 */
const FORM_TABLES: {
  table: TableName;
  /** The main attachment column, approval slips live here. */
  col: string;
  /** The backend marker column added by migration 0031. */
  backendCol: string;
  /** The jsonb sibling column holding extra attachments, when the table has one. */
  others: string | null;
}[] = ATTACHMENT_TABLES.map((table) => ({
  table: table as TableName,
  col: 'attachment_path',
  backendCol: 'attachment_backend',
  others: hasOtherAttachments(table) ? 'other_attachments' : null,
}));

/** Strip the internal `b2:` prefix from a stored path, if present. */
function stripB2Prefix(path: string): string {
  return path.startsWith('b2:') ? path.slice(3) : path;
}

import { backendOf } from '../utils/backend';

/** Read every row that references a stored file, split by backend and kind. */
export class StorageReferenceRepository {
  /** One page of rows from a table, in key order. Throws on a DB error. */
  private async readPage(
    table: TableName,
    columns: string,
    offset: number,
    filter: object = {},
  ): Promise<Record<string, unknown>[]> {
    const repo = new BaseRepository(table);
    const rows = await repo.findAll(filter, {
      select: columns,
      limit: PAGE,
      offset,
    });
    return rows as Record<string, unknown>[];
  }

  /** Scan all form tables and the `files` table, returning { main, other } refs. */
  async read(): Promise<{
    main: StorageReference[];
    other: StorageReference[];
  }> {
    const main: StorageReference[] = [];
    const other: StorageReference[] = [];

    // ---- Form tables ----
    for (const { table, col, backendCol, others } of FORM_TABLES) {
      let offset = 0;
      for (;;) {
        const rows = await this.readPage(
          table,
          others ? `${col},${backendCol},${others}` : `${col},${backendCol}`,
          offset,
        );
        if (rows.length === 0) break;
        for (const row of rows) {
          const path = row[col] as string | null;
          if (!path) continue;
          const backend = backendOf(row[backendCol]);
          const key = stripB2Prefix(path);
          // Main attachment: always counted as "approval" regardless of backend.
          main.push({ backend, key });
          // Its preview is referenced too. Without this the orphan cleanup
          // would read a thumbnail as garbage and delete it.
          if (isImagePath(key)) {
            main.push({ backend, key: thumbPathOf(key) });
          }

          if (others) {
            const extras = row[others];
            if (Array.isArray(extras)) {
              for (const entry of extras) {
                if (!entry || typeof entry !== 'object') continue;
                const extraPath = (
                  entry as { path?: unknown; backend?: unknown }
                ).path;
                if (typeof extraPath === 'string' && extraPath) {
                  const be = backendOf(
                    (entry as { backend?: unknown }).backend,
                  );
                  const extraKey = stripB2Prefix(extraPath);
                  other.push({ backend: be, key: extraKey });
                  if (isImagePath(extraKey)) {
                    other.push({ backend: be, key: thumbPathOf(extraKey) });
                  }
                }
              }
            }
          }
        }
        if (rows.length < PAGE) break;
        offset += PAGE;
      }
    }

    // ---- files table (the /api/files B2 store, every row is a B2 object) ----
    let offset = 0;
    for (;;) {
      const rows = await this.readPage('files' as TableName, 'key', offset);
      if (rows.length === 0) break;
      for (const row of rows) {
        const key = row.key as string | null;
        if (!key) continue;
        other.push({ backend: 'b2', key });
      }
      if (rows.length < PAGE) break;
      offset += PAGE;
    }

    // ---- profiles: each person's photo, `ProfilePhoto/<user id>.<ext>` ----
    // They sit in this same bucket, so a scan that reads only the form tables
    // reads every profile picture as garbage and the cleanup deletes them all.
    // The column can still hold a legacy `data:` URL or a full link (a row
    // written before photos moved to object storage, or hand-fixed); only a
    // stored path is an object reference. Always Supabase: the one backend a
    // photo is ever written to.
    let photoOffset = 0;
    for (;;) {
      const rows = await this.readPage(
        'profiles' as TableName,
        'photo',
        photoOffset,
      );
      if (rows.length === 0) break;
      for (const row of rows) {
        const photo = row.photo as string | null;
        if (!photo || photo.startsWith('data:') || photo.startsWith('http'))
          continue;
        other.push({ backend: 'supabase', key: photo });
      }
      if (rows.length < PAGE) break;
      photoOffset += PAGE;
    }

    return { main, other };
  }

  /** Which of these user ids still have an account row. */
  async existingUserIds(ids: string[]): Promise<Set<string>> {
    // Postgres casts every `in` value to the column's uuid type, so one
    // malformed key segment would fail the whole query (22P02) and the orphan
    // preview with it. Such a segment cannot name an account anyway: skipping
    // it simply reads as "no account", which is what the caller reports.
    const valid = ids.filter((id) => UUID_RE.test(id));
    const found = new Set<string>();
    for (let i = 0; i < valid.length; i += PAGE) {
      const rows = await this.readPage('users' as TableName, 'id', 0, {
        id: { in: valid.slice(i, i + PAGE) },
      });
      for (const row of rows) found.add(row.id as string);
    }
    return found;
  }
}
