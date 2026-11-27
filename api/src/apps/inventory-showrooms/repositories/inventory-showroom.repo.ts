import type {
  Showroom,
  ShowroomSaveRequest,
} from '@swiftslip/shared/showrooms';
import { RgcRepository } from '../../../core/engine';
import { utcNow } from '../../../core/framework/databases/postgres';
import { ErrorResponse } from '../../../common/shared';
import type {
  ShowroomListRow,
  ShowroomPhotoChange,
  ShowroomPhotoRow,
  ShowroomSeedRow,
} from '../types';

/**
 * The reference board's 18 showrooms, in the order the page showed them.
 * Used once, when the table is created; afterwards the rows are the owner's.
 * The serial ids follow this order, which is why the list orders by id.
 */
const SEED_ROWS: ShowroomSeedRow[] = [
  {
    showroomName: 'Roxas',
    cctvInstalled: 'active',
    cctvConnection: 'offline',
    cctvNote: null,
    internet: 'needs_request',
  },
  {
    showroomName: 'Pinan',
    cctvInstalled: 'active',
    cctvConnection: 'not_recorded',
    cctvNote: null,
    internet: 'needs_request',
  },
  {
    showroomName: 'Sindangan',
    cctvInstalled: 'active',
    cctvConnection: 'offline',
    cctvNote: 'Needs connecting',
    internet: 'active',
  },
  {
    showroomName: 'Jose Dalman',
    cctvInstalled: 'active',
    cctvConnection: 'offline',
    cctvNote: 'Needs connecting',
    internet: 'active',
  },
  {
    showroomName: 'Labason SR',
    cctvInstalled: 'active',
    cctvConnection: 'offline',
    cctvNote: 'Needs connecting',
    internet: 'active',
  },
  {
    showroomName: 'Sergio Osmeña SR',
    cctvInstalled: 'active',
    cctvConnection: 'online',
    cctvNote: 'Temporary',
    internet: 'ongoing',
  },
  {
    showroomName: 'Manukan SR',
    cctvInstalled: 'active',
    cctvConnection: 'not_recorded',
    cctvNote: null,
    internet: 'ongoing',
  },
  {
    showroomName: 'Liloy SR',
    cctvInstalled: 'active',
    cctvConnection: 'not_recorded',
    cctvNote: null,
    internet: 'ongoing',
  },
  {
    showroomName: 'Calamba SR',
    cctvInstalled: 'active',
    cctvConnection: 'online',
    cctvNote: null,
    internet: 'active',
  },
  {
    showroomName: 'Dapitan',
    cctvInstalled: 'active',
    cctvConnection: 'not_recorded',
    cctvNote: null,
    internet: 'not_recorded',
  },
  {
    showroomName: 'Dapitan warehouse (additional)',
    cctvInstalled: 'active',
    cctvConnection: 'not_recorded',
    cctvNote: null,
    internet: 'not_recorded',
  },
  {
    showroomName: 'Gutalac SR',
    cctvInstalled: 'active',
    cctvConnection: 'not_recorded',
    cctvNote: null,
    internet: 'active',
  },
  {
    showroomName: 'Katipunan SR',
    cctvInstalled: 'active',
    cctvConnection: 'online',
    cctvNote: null,
    internet: 'installed',
  },
  {
    showroomName: 'Leon B Postigo SR',
    cctvInstalled: 'active',
    cctvConnection: 'online',
    cctvNote: 'Temporary',
    internet: 'active',
  },
  {
    showroomName: 'Oroquieta',
    cctvInstalled: 'active',
    cctvConnection: 'online',
    cctvNote: null,
    internet: 'not_recorded',
  },
  {
    showroomName: 'Polanco SR',
    cctvInstalled: 'active',
    cctvConnection: 'online',
    cctvNote: null,
    internet: 'installed',
  },
  {
    showroomName: 'Rizal SR',
    cctvInstalled: 'active',
    cctvConnection: 'online',
    cctvNote: null,
    internet: 'active',
  },
  {
    showroomName: 'Sicayab SR',
    cctvInstalled: 'active',
    cctvConnection: 'online',
    cctvNote: null,
    internet: 'installed',
  },
];

/**
 * Seed for the one editable number in the header card: the reference install
 * starts at 24 devices. The card shows `available = total - installed` and the
 * owner edits this total when stock changes.
 */
const DEFAULT_CCTV_TOTAL_UNITS = 24;

/**
 * Set while the table is being created/seeded, so concurrent first requests
 * wait for one DDL pass instead of racing it. Cleared on failure so the next
 * request retries.
 */
let ready: Promise<void> | null = null;

/** Raw SQL for the RGC `showrooms` board. Nothing else may query it. */
export class InventoryShowroomRepository extends RgcRepository {
  /**
   * The inventory database has no migration runner, so the module owns its
   * schema: create the table on first use and seed the reference rows when it
   * is empty. Idempotent and cached per process.
   */
  private ensureReady(): Promise<void> {
    if (!ready) {
      ready = this.run(async (sql) => {
        await sql`
          create table if not exists showrooms (
            showroom_id serial primary key,
            showroom_name text not null,
            cctv_installed text not null default 'not_recorded',
            cctv_connection text not null default 'not_recorded',
            cctv_note text,
            internet text not null default 'not_recorded',
            notes text,
            created_at timestamp without time zone not null
              default (now() at time zone 'utc'),
            updated_at timestamp without time zone not null
              default (now() at time zone 'utc'),
            constraint showrooms_cctv_installed_check
              check (cctv_installed in ('active','not_installed','not_recorded')),
            constraint showrooms_cctv_connection_check
              check (cctv_connection in ('online','offline','not_recorded')),
            constraint showrooms_internet_check
              check (internet in ('active','installed','ongoing','needs_request','not_recorded'))
          )`;
        // Case-insensitive unique name, matching the service pre-check.
        await sql`
          create unique index if not exists showrooms_name_unique
          on showrooms (lower(btrim(showroom_name)))`;

        // The link to the "Summary of SR Status and Updates" row. The Summary
        // table lives in this same RGC database but is created by its own
        // module, so the column is added here and the foreign key is attempted
        // best-effort: when the Summary table does not exist yet the column
        // still works, and the next process start adds the key.
        await sql`
          alter table showrooms
            add column if not exists linked_update_id integer`;
        await sql`
          create unique index if not exists showrooms_linked_update_unique
          on showrooms (linked_update_id)
          where linked_update_id is not null`;
        await sql`
          do $$
          begin
            alter table showrooms
              add constraint showrooms_linked_update_fk
              foreign key (linked_update_id)
              references showroom_updates(update_id)
              on delete set null;
          exception
            when duplicate_object then null;
            when undefined_table then null;
          end $$`;

        // One row per showroom per picture slot. Object refs only (a `b2:`
        // prefix marks that backend), never URLs: signed links expire. The FK
        // cascades so deleting a showroom cannot leave picture rows behind;
        // the service removes the objects themselves.
        await sql`
          create table if not exists showroom_photos (
            showroom_id integer not null
              references showrooms(showroom_id) on delete cascade,
            slot text not null,
            photo_ref text not null,
            thumb_ref text,
            original_name text,
            byte_size integer,
            updated_at timestamp without time zone not null
              default (now() at time zone 'utc'),
            primary key (showroom_id, slot),
            constraint showroom_photos_slot_check
              check (slot in ('showroom','cctv','acknowledge_form'))
          )`;
        // Two display-only facts under the preview. Added separately so a
        // table created by an earlier build picks them up too.
        await sql`
          alter table showroom_photos
            add column if not exists original_name text`;
        await sql`
          alter table showroom_photos
            add column if not exists byte_size integer`;

        // One key/value row now; a table (not a column on a showroom) so the
        // settings survive deletes and the owner can add more later.
        await sql`
          create table if not exists showroom_settings (
            setting_key text primary key,
            setting_value integer not null,
            updated_at timestamp without time zone not null
              default (now() at time zone 'utc')
          )`;
        await sql`
          insert into showroom_settings (setting_key, setting_value)
          values ('cctv_total_units', ${DEFAULT_CCTV_TOTAL_UNITS})
          on conflict (setting_key) do nothing`;

        const counts = await sql<
          [{ n: number }]
        >`select count(*)::int as n from showrooms`;
        if ((counts[0]?.n ?? 0) > 0) return;

        // One transaction keeps the serial ids in seed order.
        await sql.begin(async (tx) => {
          for (const row of SEED_ROWS) {
            await tx`
              insert into showrooms
                (showroom_name, cctv_installed, cctv_connection, cctv_note, internet)
              values
                (${row.showroomName}, ${row.cctvInstalled}, ${row.cctvConnection},
                 ${row.cctvNote}, ${row.internet})`;
          }
        });
      }).catch((error: unknown) => {
        ready = null;
        throw error;
      });
    }
    return ready;
  }

  /** Every showroom, alphabetical by name, with its board thumbnail ref. */
  findAll(): Promise<ShowroomListRow[]> {
    return this.run(async (sql) => {
      await this.ensureReady();
      return sql<ShowroomListRow[]>`
        select showrooms.showroom_id,
               showrooms.showroom_name,
               showrooms.cctv_installed,
               showrooms.cctv_connection,
               showrooms.cctv_note,
               showrooms.internet,
               showrooms.notes,
               showrooms.linked_update_id,
               showrooms.created_at::text as created_at,
               showrooms.updated_at::text as updated_at,
               photos.thumb_ref as photo_thumb_ref
        from showrooms
        left join showroom_photos photos
          on photos.showroom_id = showrooms.showroom_id
         and photos.slot = 'showroom'
        order by lower(btrim(showrooms.showroom_name)) asc, showrooms.showroom_id asc`;
    });
  }

  /** One showroom, or null when it is already gone. */
  findById(showroomId: number): Promise<Showroom | null> {
    return this.run(async (sql) => {
      await this.ensureReady();
      const rows = await sql<Showroom[]>`
        select showroom_id,
               showroom_name,
               cctv_installed,
               cctv_connection,
               cctv_note,
               internet,
               notes,
               linked_update_id,
               created_at::text as created_at,
               updated_at::text as updated_at
        from showrooms
        where showroom_id = ${showroomId}
        limit 1`;
      return rows[0] ?? null;
    });
  }

  /** Every link currently set, so the picker can grey out rows already taken. */
  findLinks(): Promise<
    Array<{
      linked_update_id: number;
      showroom_id: number;
      showroom_name: string;
    }>
  > {
    return this.run(async (sql) => {
      await this.ensureReady();
      return sql<
        Array<{
          linked_update_id: number;
          showroom_id: number;
          showroom_name: string;
        }>
      >`
        select linked_update_id, showroom_id, showroom_name
        from showrooms
        where linked_update_id is not null`;
    });
  }

  /** Case-insensitive duplicate name check, optionally ignoring the row being edited. */
  nameExists(name: string, exceptId?: number): Promise<boolean> {
    return this.run(async (sql) => {
      await this.ensureReady();
      const rows =
        exceptId == null
          ? await sql`
              select 1 from showrooms
              where lower(btrim(showroom_name)) = lower(btrim(${name}))
              limit 1`
          : await sql`
              select 1 from showrooms
              where lower(btrim(showroom_name)) = lower(btrim(${name}))
                and showroom_id <> ${exceptId}
              limit 1`;
      return rows.length > 0;
    });
  }

  /**
   * Insert (`showroomId` null) or update one showroom and its picture changes
   * in ONE transaction: a failed photo row must not leave the form half saved.
   * Returns the showroom id.
   */
  save(
    showroomId: number | null,
    input: ShowroomSaveRequest,
    photoChanges: ShowroomPhotoChange[] = [],
  ): Promise<number> {
    return this.run(async (sql) => {
      await this.ensureReady();

      return sql.begin(async (tx) => {
        let id: number;

        if (showroomId == null) {
          const rows = await tx<[{ showroom_id: number }]>`
            insert into showrooms
              (showroom_name, cctv_installed, cctv_connection, cctv_note, internet, notes,
               linked_update_id)
            values
              (${input.showroomName}, ${input.cctvInstalled}, ${input.cctvConnection},
               ${input.cctvNote}, ${input.internet}, ${input.notes},
               ${input.linkedUpdateId})
            returning showroom_id`;
          const created = rows[0]?.showroom_id;
          if (created == null) {
            throw new ErrorResponse(
              'DATABASE_ERROR',
              'Failed to save showroom.',
            );
          }
          id = created;
        } else {
          const rows = await tx<[{ showroom_id: number }]>`
            update showrooms set
              showroom_name = ${input.showroomName},
              cctv_installed = ${input.cctvInstalled},
              cctv_connection = ${input.cctvConnection},
              cctv_note = ${input.cctvNote},
              internet = ${input.internet},
              notes = ${input.notes},
              linked_update_id = ${input.linkedUpdateId},
              updated_at = ${utcNow()}
            where showroom_id = ${showroomId}
            returning showroom_id`;
          const updated = rows[0]?.showroom_id;
          if (updated == null) {
            throw new ErrorResponse('NOT_FOUND_ERROR', 'Showroom not found.');
          }
          id = updated;
        }

        for (const change of photoChanges) {
          if (change.photoRef === null) {
            await tx`
              delete from showroom_photos
              where showroom_id = ${id} and slot = ${change.slot}`;
            continue;
          }
          await tx`
            insert into showroom_photos
              (showroom_id, slot, photo_ref, thumb_ref, original_name, byte_size, updated_at)
            values
              (${id}, ${change.slot}, ${change.photoRef}, ${change.thumbRef},
               ${change.filename}, ${change.byteSize}, ${utcNow()})
            on conflict (showroom_id, slot) do update set
              photo_ref = excluded.photo_ref,
              thumb_ref = excluded.thumb_ref,
              original_name = excluded.original_name,
              byte_size = excluded.byte_size,
              updated_at = excluded.updated_at`;
        }

        return id;
      });
    }).catch((error: unknown) => this.linkConflict(error));
  }

  /**
   * Write one picture row immediately (the drawer's edit-mode upload). A form
   * save never touches photos on its own; this is the only path that sets one
   * outside the create transaction, so a refresh right after an upload still
   * finds the picture.
   */
  setPhoto(showroomId: number, change: ShowroomPhotoChange): Promise<void> {
    return this.run(async (sql) => {
      await this.ensureReady();
      await sql`
        insert into showroom_photos
          (showroom_id, slot, photo_ref, thumb_ref, original_name, byte_size, updated_at)
        values
          (${showroomId}, ${change.slot}, ${change.photoRef}, ${change.thumbRef},
           ${change.filename}, ${change.byteSize}, ${utcNow()})
        on conflict (showroom_id, slot) do update set
          photo_ref = excluded.photo_ref,
          thumb_ref = excluded.thumb_ref,
          original_name = excluded.original_name,
          byte_size = excluded.byte_size,
          updated_at = excluded.updated_at`;
    });
  }

  /** The three picture rows for one showroom (absent slots are simply missing). */
  findPhotos(showroomId: number): Promise<ShowroomPhotoRow[]> {
    return this.run(async (sql) => {
      await this.ensureReady();
      return sql<ShowroomPhotoRow[]>`
        select slot, photo_ref, thumb_ref, original_name, byte_size
        from showroom_photos
        where showroom_id = ${showroomId}
        order by slot`;
    });
  }

  /**
   * Every ref the database currently points at, across all showrooms. The
   * staging sweep needs this: saved pictures KEEP their staged key (nothing is
   * moved or renamed after a save), so age alone cannot tell an abandoned
   * upload from a live photo.
   */
  allPhotoRefs(): Promise<{ photo_ref: string; thumb_ref: string | null }[]> {
    return this.run(async (sql) => {
      await this.ensureReady();
      return sql<{ photo_ref: string; thumb_ref: string | null }[]>`
        select photo_ref, thumb_ref from showroom_photos`;
    });
  }

  /** Remove one slot's row; returns how many were deleted. */
  removePhoto(
    showroomId: number,
    slot: ShowroomPhotoRow['slot'],
  ): Promise<number> {
    return this.run(async (sql) => {
      await this.ensureReady();
      const result = await sql`
        delete from showroom_photos
        where showroom_id = ${showroomId} and slot = ${slot}`;
      return result.count;
    });
  }

  /** Returns how many rows were deleted (0 = already gone). */
  remove(showroomId: number): Promise<number> {
    return this.run(async (sql) => {
      await this.ensureReady();
      const result = await sql`
        delete from showrooms where showroom_id = ${showroomId}`;
      return result.count;
    });
  }

  /** The owner's total CCTV units (installed + spare). */
  getCctvTotalUnits(): Promise<number> {
    return this.run(async (sql) => {
      await this.ensureReady();
      const rows = await sql<
        [{ setting_value: number }]
      >`select setting_value from showroom_settings
        where setting_key = 'cctv_total_units'`;
      return rows[0]?.setting_value ?? 0;
    });
  }

  /** Create or overwrite the total; returns what was stored. */
  setCctvTotalUnits(units: number): Promise<number> {
    return this.run(async (sql) => {
      await this.ensureReady();
      const rows = await sql<[{ setting_value: number }]>`
        insert into showroom_settings (setting_key, setting_value, updated_at)
        values ('cctv_total_units', ${units}, ${utcNow()})
        on conflict (setting_key) do update
          set setting_value = excluded.setting_value,
              updated_at = excluded.updated_at
        returning setting_value`;
      const saved = rows[0]?.setting_value;
      if (saved == null) {
        throw new ErrorResponse(
          'DATABASE_ERROR',
          'Failed to save the CCTV total.',
        );
      }
      return saved;
    });
  }

  /**
   * One Summary row can feed one inventory showroom: the unique index is the
   * real guard, and this turns its violation into the sentence the drawer
   * shows instead of the generic "value already used".
   */
  private linkConflict(error: unknown): never {
    const original =
      error instanceof ErrorResponse ? error.originalError : undefined;
    if (
      (original as { constraint?: string } | undefined)?.constraint ===
      'showrooms_linked_update_unique'
    ) {
      throw new ErrorResponse(
        'UNIQUE_FIELD_ERROR',
        'That SwiftSlip showroom is already linked to another showroom.',
      );
    }
    throw error;
  }
}
