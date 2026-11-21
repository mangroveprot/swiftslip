import type {
  ShowroomUpdate,
  ShowroomUpdateChange,
  ShowroomUpdateEvent,
  ShowroomUpdateSaveRequest,
} from '@swiftslip/shared/showroom-updates';
import type { SessionUser } from '@swiftslip/shared/types';
import { ErrorResponse } from '../../../common/shared';
import { RgcRepository } from '../../../core/engine';
import { utcNow } from '../../../core/framework/databases/postgres';
import type { ShowroomUpdateEventRow, ShowroomUpdateSeedRow } from '../types';

/**
 * The owner's sheet, transcribed once. The board seeds these rows when the
 * table is created; afterwards the rows are the owner's, not this file's.
 *
 * The column order matches the sheet: No. 1-18, then 20-23 (the sheet skips 19),
 * so the download still reads like the source document.
 */
const SEED_ROWS: ShowroomUpdateSeedRow[] = [
  {
    srNo: 1,
    showroomName: 'Mun. of Polanco',
    location: 'Obay, Polanco ZDN',
    status: 'open',
    requirements: 'Complete',
    actionRequired: 'Operational',
    responsiblePerson: 'jimmy',
    remarks: 'fully_operational',
    openDate: '2026-05-02',
    vehicle: 'with_sidecar',
  },
  {
    srNo: 2,
    showroomName: 'Mun. of Manukan',
    location: 'Poblacion, Manukan, ZDN',
    status: 'open',
    requirements: 'Complete',
    actionRequired: 'Operational',
    responsiblePerson: 'jimmy',
    remarks: 'fully_operational',
    openDate: '2026-06-15',
    vehicle: 'with_sidecar',
  },
  {
    srNo: 3,
    showroomName: 'Mun. of Katipunan',
    location: 'Uno. Katipunan, ZDN',
    status: 'open',
    requirements: 'Complete',
    actionRequired: 'Operational',
    responsiblePerson: 'jimmy',
    remarks: 'fully_operational',
    openDate: '2026-06-24',
    vehicle: 'with_sidecar',
  },
  {
    srNo: 4,
    showroomName: 'Mun. of Sergio Osmeña',
    location: 'Poblacion Alto, Sergio Osmeña, ZDN',
    status: 'open',
    requirements: 'Complete',
    actionRequired: 'Operational',
    responsiblePerson: 'jonnah',
    remarks: 'fully_operational',
    openDate: '2026-07-25',
    vehicle: 'with_and_without_sidecar',
  },
  {
    srNo: 5,
    showroomName: 'Brgy. Sicayab',
    location: 'Purok Bougainvilla, Brgy Sicayab, Dipolog City, ZDN',
    status: 'open',
    requirements: 'Complete',
    actionRequired: 'Operational',
    responsiblePerson: 'jonnah',
    remarks: 'fully_operational',
    openDate: '2026-07-31',
    vehicle: 'with_sidecar',
  },
  {
    srNo: 6,
    showroomName: 'Mun. of Liloy',
    location: 'Baybay, Liloy, ZDN',
    status: 'open',
    requirements: 'Complete',
    actionRequired: 'Operational',
    responsiblePerson: 'maynard',
    remarks: 'fully_operational',
    openDate: '2026-08-11',
    vehicle: 'with_sidecar',
  },
  {
    srNo: 7,
    showroomName: 'Mun. of Sindangan',
    location: 'Sector 1, Brgy. Ramon Magsaysay, Sindangan, ZDN',
    status: 'open',
    requirements: 'Complete',
    actionRequired: 'Operational',
    responsiblePerson: 'maynard',
    remarks: 'fully_operational',
    openDate: '2026-09-23',
    vehicle: 'with_sidecar',
  },
  {
    srNo: 8,
    showroomName: 'Mun. of Calamba',
    location: '1982-P, 02, Northern Poblacion, Calamba, Mis Occ',
    status: 'open',
    requirements: 'Complete',
    actionRequired: 'Operational',
    responsiblePerson: 'jeanette',
    remarks: 'fully_operational',
    openDate: '2026-09-19',
    vehicle: 'with_sidecar',
  },
  {
    srNo: 9,
    showroomName: 'Mun. of Jose Dalman',
    location: 'Clarc 3, Poblacion, Jose Dalman, ZDN',
    status: 'open',
    requirements: 'Complete',
    actionRequired: 'Operational',
    responsiblePerson: 'marvin',
    remarks: 'fully_operational',
    openDate: '2026-09-04',
    vehicle: 'requested',
  },
  {
    srNo: 10,
    showroomName: 'Mun. of Rizal',
    location: 'Purok 2, East Poblacion, Rizal, ZDN',
    status: 'open',
    requirements: 'Complete',
    actionRequired: 'Operational',
    responsiblePerson: 'jonnah',
    remarks: 'fully_operational',
    openDate: '2026-09-11',
    vehicle: 'with_sidecar',
  },
  {
    srNo: 11,
    showroomName: 'Mun. of Roxas',
    location: 'Brgy. Poblacion, Pres. Manuel A. Roxas, ZDN',
    status: 'open',
    requirements: 'Complete',
    actionRequired: 'Operational',
    responsiblePerson: 'ivanray',
    remarks: 'fully_operational',
    openDate: '2026-09-24',
    vehicle: 'requested',
  },
  {
    srNo: 12,
    showroomName: 'Mun. of Leon B. Postigo',
    location: 'Brgy. Poblacion, Leon B. Postigo(Bacungan), ZDN',
    status: 'open',
    requirements: 'Complete',
    actionRequired: 'Operational',
    responsiblePerson: 'ivanray',
    remarks: 'fully_operational',
    openDate: '2026-09-25',
    vehicle: 'requested',
  },
  {
    srNo: 13,
    showroomName: 'Oroquieta City',
    location: '071 Pastrano St., Purok 2, Pob 1, Oroquieta City, Mis Occ',
    status: 'open',
    requirements: 'Complete',
    actionRequired: 'Operational',
    responsiblePerson: 'jeanette',
    remarks: 'fully_operational',
    openDate: '2026-10-09',
    vehicle: 'with_sidecar',
  },
  {
    srNo: 14,
    showroomName: 'Mun. of Labason',
    location: 'Brgy. Antonino, Labason ZDN',
    status: 'ready',
    requirements: 'Complete',
    actionRequired: 'for Opening',
    responsiblePerson: 'maynard',
    remarks: 'ready_to_launch',
    openDate: null,
    vehicle: 'none',
  },
  {
    srNo: 15,
    showroomName: 'Mun. of Gutalac',
    location: 'Purok 4, Brgy Salvador, Gutalac, ZDN',
    status: 'ready',
    requirements: 'Complete',
    actionRequired: 'for Opening',
    responsiblePerson: 'jeanette',
    remarks: 'ready_to_launch',
    openDate: null,
    vehicle: 'requested',
  },
  {
    srNo: 16,
    showroomName: 'Dapitan City',
    location: 'Purok Bangus, National Highway, Brgy. Polo, Dapitan City, ZDN',
    status: 'ready',
    requirements: 'Complete',
    actionRequired: 'for Opening',
    responsiblePerson: 'jonnah',
    remarks: 'ready_to_launch',
    openDate: null,
    vehicle: 'none',
  },
  {
    srNo: 17,
    showroomName: 'Mun. of Piñan',
    location: 'National Highway, Brgy. Poblacion South, Piñan, ZDN',
    status: 'in_progress',
    requirements: null,
    actionRequired: null,
    responsiblePerson: 'jimmy',
    remarks: 'ongoing',
    openDate: null,
    vehicle: 'none',
  },
  {
    srNo: 18,
    showroomName: 'Mun. of Tudela',
    location: 'National Highway, Brgy. Basirang, Tudela, Mis. Occ.',
    status: 'pending',
    requirements: 'LGU permits',
    actionRequired: 'Occupancy permit that is currently approve by OBO',
    responsiblePerson: 'jeanette',
    remarks: null,
    openDate: null,
    vehicle: 'none',
  },
  {
    srNo: 20,
    showroomName: 'Brgy. Punta',
    location: 'Purok Bougainvilla, Brgy. Binalabag, Punta, Dipolog City, ZDN',
    status: 'pending',
    requirements: 'Lacking Contract of Lease',
    actionRequired: 'for approval',
    responsiblePerson: 'maynard',
    remarks: 'ongoing',
    openDate: null,
    vehicle: 'none',
  },
  {
    srNo: 21,
    showroomName: 'Mun. of Molave',
    location: 'Ramos St. Purok Sampaguita, Brgy. Madasigon, Molave, ZDS',
    status: 'in_progress',
    requirements: 'Leased of contract ready',
    actionRequired: 'For signing',
    responsiblePerson: 'marvin',
    remarks: 'ongoing',
    openDate: null,
    vehicle: 'none',
  },
  {
    srNo: 22,
    showroomName: 'Mun. of Clarin',
    location: 'New Road Purok 1, Brgy. Lapasan, Clarin, Misamis Occidental',
    status: 'in_progress',
    requirements: 'Leased of contract ready',
    actionRequired: 'For signing',
    responsiblePerson: 'ivanray',
    remarks: 'ongoing',
    openDate: null,
    vehicle: 'none',
  },
  {
    srNo: 23,
    showroomName: 'Mun. of Jimenez',
    location: 'Hon. J. Antonio SR Avenue,Rizal, Jimenez, Misamis Occidental',
    status: null,
    requirements: null,
    actionRequired: null,
    responsiblePerson: null,
    remarks: null,
    openDate: null,
    vehicle: null,
  },
];

/** Which columns every read returns; one list so reads cannot drift apart. */
const COLUMNS = `
  update_id,
  sr_no,
  showroom_name,
  location,
  status,
  requirements,
  action_required,
  responsible_person,
  remarks,
  open_date::text as open_date,
  vehicle,
  updated_by,
  updated_at::text as updated_at
`;

let ready: Promise<void> | null = null;

/** Postgres says "duplicate key" with SQLSTATE 23505. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

/**
 * The board has a unique showroom name (the sheet must not list a place twice),
 * so a duplicate save/add answers with a readable conflict, not a 500.
 */
function rethrowUniqueShowroom(error: unknown): never {
  if (isUniqueViolation(error)) {
    throw new ErrorResponse(
      'UNIQUE_FIELD_ERROR',
      'A showroom with that name is already on the board.',
    );
  }
  throw error;
}

/**
 * `changes` is a jsonb array. Older rows (and an earlier insert bug) can hold a
 * jsonb string instead, so unwrap until an array appears rather than letting a
 * malformed row break the whole drawer.
 */
function parseChanges(value: string): ShowroomUpdateChange[] {
  try {
    let parsed: unknown = JSON.parse(value);
    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
    return Array.isArray(parsed) ? (parsed as ShowroomUpdateChange[]) : [];
  } catch {
    return [];
  }
}

/** Raw SQL for the Showroom Updates board. Nothing else may query it. */
export class ShowroomUpdateRepository extends RgcRepository {
  /**
   * The inventory database has no migration runner, so the module owns its
   * schema: create the tables on first use and seed the owner's 22 rows when
   * the board is empty. Idempotent and cached per process.
   */
  private ensureReady(): Promise<void> {
    if (!ready) {
      ready = this.run(async (sql) => {
        await sql`
          create table if not exists showroom_updates (
            update_id serial primary key,
            sr_no integer not null,
            showroom_name text not null,
            location text not null,
            status text,
            requirements text,
            action_required text,
            responsible_person text,
            remarks text,
            open_date date,
            vehicle text,
            updated_by text,
            created_at timestamp without time zone not null
              default (now() at time zone 'utc'),
            updated_at timestamp without time zone not null
              default (now() at time zone 'utc'),
            constraint showroom_updates_status_check
              check (status in ('open','ready','in_progress','pending')),
            constraint showroom_updates_remarks_check
              check (remarks in ('fully_operational','ready_to_launch','ongoing')),
            constraint showroom_updates_vehicle_check
              check (vehicle in ('with_sidecar','with_and_without_sidecar','requested','none')),
            constraint showroom_updates_responsible_check
              check (responsible_person in ('jimmy','jonnah','maynard','jeanette','marvin','ivanray'))
          )`;
        await sql`
          create unique index if not exists showroom_updates_sr_no_unique
          on showroom_updates (sr_no)`;
        await sql`
          create unique index if not exists showroom_updates_name_unique
          on showroom_updates (lower(btrim(showroom_name)))`;

        // One audit row per save. The FK cascades, so a removed showroom cannot
        // leave history behind.
        await sql`
          create table if not exists showroom_update_events (
            event_id serial primary key,
            update_id integer not null
              references showroom_updates(update_id) on delete cascade,
            actor_id text,
            actor_label text not null,
            changes jsonb not null default '[]'::jsonb,
            created_at timestamp without time zone not null
              default (now() at time zone 'utc')
          )`;
        await sql`
          create index if not exists showroom_update_events_update_idx
          on showroom_update_events (update_id, event_id desc)`;

        // Earlier builds wrote `changes` through `JSON.stringify(...)::jsonb`,
        // which postgres.js stored as a jsonb *string* instead of an array.
        // Recover those rows in place (idempotent, string-typed rows only).
        await sql`
          update showroom_update_events
          set changes = (changes #>> '{}')::jsonb
          where jsonb_typeof(changes) = 'string'`;

        const counts = await sql<
          [{ n: number }]
        >`select count(*)::int as n from showroom_updates`;
        if ((counts[0]?.n ?? 0) > 0) return;

        await sql.begin(async (tx) => {
          for (const row of SEED_ROWS) {
            await tx`
              insert into showroom_updates
                (sr_no, showroom_name, location, status, requirements,
                 action_required, responsible_person, remarks, open_date, vehicle)
              values
                (${row.srNo}, ${row.showroomName}, ${row.location}, ${row.status},
                 ${row.requirements}, ${row.actionRequired}, ${row.responsiblePerson},
                 ${row.remarks}, ${row.openDate}, ${row.vehicle})`;
          }
        });
      }).catch((error: unknown) => {
        ready = null;
        throw error;
      });
    }
    return ready;
  }

  /** Every row, in sheet order (No. 1-18, 20-23). */
  findAll(): Promise<ShowroomUpdate[]> {
    return this.run(async (sql) => {
      await this.ensureReady();
      return sql<ShowroomUpdate[]>`
        select ${sql.unsafe(COLUMNS)}
        from showroom_updates
        order by sr_no asc`;
    });
  }

  /** One row, or null when it is already gone. */
  findById(updateId: number): Promise<ShowroomUpdate | null> {
    return this.run(async (sql) => {
      await this.ensureReady();
      const rows = await sql<ShowroomUpdate[]>`
        select ${sql.unsafe(COLUMNS)}
        from showroom_updates
        where update_id = ${updateId}
        limit 1`;
      return rows[0] ?? null;
    });
  }

  /**
   * Write one edit and its audit line in one transaction, so a save can never
   * land without a history entry (or the reverse).
   */
  save(
    updateId: number,
    input: ShowroomUpdateSaveRequest,
    actor: SessionUser,
    changes: ShowroomUpdateChange[],
  ): Promise<ShowroomUpdate> {
    return this.run(async (sql) => {
      await this.ensureReady();
      return sql.begin(async (tx) => {
        const rows = await tx<ShowroomUpdate[]>`
          update showroom_updates set
            showroom_name = ${input.showroomName},
            location = ${input.location},
            status = ${input.status},
            requirements = ${input.requirements},
            action_required = ${input.actionRequired},
            responsible_person = ${input.responsiblePerson},
            remarks = ${input.remarks},
            open_date = ${input.openDate},
            vehicle = ${input.vehicle},
            updated_by = ${actor.label},
            updated_at = ${utcNow()}
          where update_id = ${updateId}
          returning ${tx.unsafe(COLUMNS)}`;
        const saved = rows[0];
        if (!saved) {
          throw new ErrorResponse(
            'NOT_FOUND_ERROR',
            'That showroom is no longer on the board.',
          );
        }
        await tx`
          insert into showroom_update_events (update_id, actor_id, actor_label, changes)
          values (${updateId}, ${actor.id}, ${actor.label}, ${tx.json(changes)})`;
        return saved;
      });
    }).catch(rethrowUniqueShowroom);
  }

  /**
   * Add a row at the bottom of the sheet. The No. is the next integer after the
   * highest one on the board (24 today), assigned here so two quick adds cannot
   * both pick the same number. The audit line is written in the same
   * transaction as the insert.
   */
  create(
    input: ShowroomUpdateSaveRequest,
    actor: SessionUser,
    changes: ShowroomUpdateChange[],
  ): Promise<ShowroomUpdate> {
    return this.run(async (sql) => {
      await this.ensureReady();
      return sql.begin(async (tx) => {
        const counted = await tx<[{ next_no: number }]>`
          select coalesce(max(sr_no), 0) + 1 as next_no from showroom_updates`;
        const nextNo = counted[0]?.next_no ?? 1;
        const rows = await tx<ShowroomUpdate[]>`
          insert into showroom_updates
            (sr_no, showroom_name, location, status, requirements,
             action_required, responsible_person, remarks, open_date, vehicle,
             updated_by, updated_at)
          values
            (${nextNo}, ${input.showroomName}, ${input.location}, ${input.status},
             ${input.requirements}, ${input.actionRequired},
             ${input.responsiblePerson}, ${input.remarks}, ${input.openDate},
             ${input.vehicle}, ${actor.label}, ${utcNow()})
          returning ${tx.unsafe(COLUMNS)}`;
        const created = rows[0];
        if (!created) {
          throw new ErrorResponse(
            'DATABASE_ERROR',
            'The showroom could not be added.',
          );
        }
        await tx`
          insert into showroom_update_events (update_id, actor_id, actor_label, changes)
          values (${created.update_id}, ${actor.id}, ${actor.label},
                  ${tx.json(changes)})`;
        return created;
      });
    }).catch(rethrowUniqueShowroom);
  }

  /**
   * Remove the ticked rows. The events table's FK cascades, so a showroom's
   * history goes with it. Returns the rows that existed, for the audit line.
   */
  deleteMany(
    ids: number[],
  ): Promise<
    Array<Pick<ShowroomUpdate, 'update_id' | 'sr_no' | 'showroom_name'>>
  > {
    return this.run(async (sql) => {
      await this.ensureReady();
      return sql<
        Array<Pick<ShowroomUpdate, 'update_id' | 'sr_no' | 'showroom_name'>>
      >`
        delete from showroom_updates
        where update_id = any(${ids})
        returning update_id, sr_no, showroom_name`;
    });
  }

  /** Newest first, for the drawer's history list. */
  findEvents(updateId: number): Promise<ShowroomUpdateEvent[]> {
    return this.run(async (sql) => {
      await this.ensureReady();
      const rows = await sql<ShowroomUpdateEventRow[]>`
        select event_id,
               update_id,
               actor_id,
               actor_label,
               changes::text as changes,
               created_at::text as created_at
        from showroom_update_events
        where update_id = ${updateId}
        order by event_id desc`;
      return rows.map((row) => ({
        ...row,
        changes: parseChanges(row.changes),
      }));
    });
  }
}
