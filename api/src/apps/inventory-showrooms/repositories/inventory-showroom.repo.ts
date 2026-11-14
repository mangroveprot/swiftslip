import type {
  Showroom,
  ShowroomSaveRequest,
} from '@swiftslip/shared/showrooms';
import { RgcRepository } from '../../../core/engine';
import { utcNow } from '../../../core/framework/databases/postgres';
import { ErrorResponse } from '../../../common/shared';
import type { ShowroomSeedRow } from '../types';

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
 * Set while the table is being created/seeded, so concurrent first requests
 * wait for one DDL pass instead of racing it. Cleared on failure so the next
 * request retries.
 */
let ready: Promise<void> | null = null;

/**
 * The owner has the 18 seeded showrooms on CCTV plus 6 spare units, so a fresh
 * install starts at 24 devices. The card shows `available = total - installed`
 * and the owner edits this total when stock changes.
 */
const DEFAULT_CCTV_TOTAL_UNITS = 24;

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

  /** Every showroom, alphabetical by name. */
  findAll(): Promise<Showroom[]> {
    return this.run(async (sql) => {
      await this.ensureReady();
      return sql<Showroom[]>`
        select showroom_id,
               showroom_name,
               cctv_installed,
               cctv_connection,
               cctv_note,
               internet,
               notes,
               created_at::text as created_at,
               updated_at::text as updated_at
        from showrooms
        order by lower(btrim(showroom_name)) asc, showroom_id asc`;
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
               created_at::text as created_at,
               updated_at::text as updated_at
        from showrooms
        where showroom_id = ${showroomId}
        limit 1`;
      return rows[0] ?? null;
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

  /** Insert (`showroomId` null) or update one showroom; returns its id. */
  save(showroomId: number | null, input: ShowroomSaveRequest): Promise<number> {
    return this.run(async (sql) => {
      await this.ensureReady();

      if (showroomId == null) {
        const rows = await sql<[{ showroom_id: number }]>`
          insert into showrooms
            (showroom_name, cctv_installed, cctv_connection, cctv_note, internet, notes)
          values
            (${input.showroomName}, ${input.cctvInstalled}, ${input.cctvConnection},
             ${input.cctvNote}, ${input.internet}, ${input.notes})
          returning showroom_id`;
        const id = rows[0]?.showroom_id;
        if (id == null) {
          throw new ErrorResponse('DATABASE_ERROR', 'Failed to save showroom.');
        }
        return id;
      }

      const rows = await sql<[{ showroom_id: number }]>`
        update showrooms set
          showroom_name = ${input.showroomName},
          cctv_installed = ${input.cctvInstalled},
          cctv_connection = ${input.cctvConnection},
          cctv_note = ${input.cctvNote},
          internet = ${input.internet},
          notes = ${input.notes},
          updated_at = ${utcNow()}
        where showroom_id = ${showroomId}
        returning showroom_id`;
      const id = rows[0]?.showroom_id;
      if (id == null) {
        throw new ErrorResponse('NOT_FOUND_ERROR', 'Showroom not found.');
      }
      return id;
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
}
