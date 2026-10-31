import { BaseRepository } from '../../../core/engine';
import type { TableName } from '../../../core/engine';
import type { StorageReference } from '@swiftslip/shared/schemas';

const PAGE = 1000;

/** Form tables that carry `attachment_path` and `attachment_backend`. */
const FORM_TABLES: {
  table: TableName;
  /** The main attachment column — approval slips live here. */
  col: string;
  /** The backend marker column added by migration 0031. */
  backendCol: string;
  /** The jsonb sibling column holding extra attachments, when the table has one. */
  others: string | null;
}[] = [
  {
    table: 'dtr_records' as TableName,
    col: 'attachment_path',
    backendCol: 'attachment_backend',
    others: null,
  },
  {
    table: 'ob_forms' as TableName,
    col: 'attachment_path',
    backendCol: 'attachment_backend',
    others: null,
  },
  {
    table: 'loa_forms' as TableName,
    col: 'attachment_path',
    backendCol: 'attachment_backend',
    others: 'other_attachments',
  },
  {
    table: 'cos_forms' as TableName,
    col: 'attachment_path',
    backendCol: 'attachment_backend',
    others: null,
  },
  {
    table: 'ot_forms' as TableName,
    col: 'attachment_path',
    backendCol: 'attachment_backend',
    others: 'other_attachments',
  },
];

/** Strip the internal `b2:` prefix from a stored path, if present. */
function stripB2Prefix(path: string): string {
  return path.startsWith('b2:') ? path.slice(3) : path;
}

/** Backend from a stored marker value; defaults to supabase when unrecognized. */
function backendOf(value: unknown): 'supabase' | 'b2' {
  return value === 'b2' ? 'b2' : 'supabase';
}

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
          if (backend === 'supabase') main.push({ backend, key });
          else other.push({ backend, key });

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
                  other.push({ backend: be, key: stripB2Prefix(extraPath) });
                }
              }
            }
          }
        }
        if (rows.length < PAGE) break;
        offset += PAGE;
      }
    }

    // ---- files table (the /api/files B2 store — every row is a B2 object) ----
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

    return { main, other };
  }

  /** Which of these user ids still have an account row. */
  async existingUserIds(ids: string[]): Promise<Set<string>> {
    const found = new Set<string>();
    for (let i = 0; i < ids.length; i += PAGE) {
      const rows = await this.readPage('users' as TableName, 'id', 0, {
        id: { in: ids.slice(i, i + PAGE) },
      });
      for (const row of rows) found.add(row.id as string);
    }
    return found;
  }
}
