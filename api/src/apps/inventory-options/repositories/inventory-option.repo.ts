import type { ManagedOption, OptionKind } from '@swiftslip/shared/inventory';
import { RgcRepository } from '../../../core/engine';
import { utcNow } from '../../../core/framework/databases/postgres';
import { OPTION_TABLES } from '../types';

/** Raw SQL for the RGC lookup tables (branches, departments, statuses, …). */
export class InventoryOptionRepository extends RgcRepository {
  /** Every option of one kind with how many assets still use it. */
  listWithUsage(kind: OptionKind): Promise<ManagedOption[]> {
    const t = OPTION_TABLES[kind];
    return this.run(
      (sql) => sql<ManagedOption[]>`
        select o.${sql(t.idColumn)} as id,
               o.${sql(t.nameColumn)} as name,
               count(a.asset_id)::int as usage_count
        from ${sql(t.table)} o
        left join assets a on a.${sql(t.assetColumn)} = o.${sql(t.idColumn)}
        group by o.${sql(t.idColumn)}, o.${sql(t.nameColumn)}
        order by o.${sql(t.nameColumn)}`,
    );
  }

  /** Exact-name duplicate check, optionally ignoring the row being renamed. */
  nameExists(
    kind: OptionKind,
    name: string,
    exceptId?: number,
  ): Promise<boolean> {
    const t = OPTION_TABLES[kind];
    return this.run(async (sql) => {
      const rows =
        exceptId == null
          ? await sql`select 1 from ${sql(t.table)} where ${sql(t.nameColumn)} = ${name} limit 1`
          : await sql`select 1 from ${sql(t.table)} where ${sql(t.nameColumn)} = ${name} and ${sql(t.idColumn)} <> ${exceptId} limit 1`;
      return rows.length > 0;
    });
  }

  branchCodeExists(code: string): Promise<boolean> {
    return this.run(async (sql) => {
      const rows =
        await sql`select 1 from branches where branch_code = ${code} limit 1`;
      return rows.length > 0;
    });
  }

  /** Settings flow: a branch that is active and stamped with the creation time. */
  insertBranchActive(name: string, code: string): Promise<void> {
    return this.run(async (sql) => {
      await sql`
        insert into branches (branch_name, branch_code, status_indicator, created_at)
        values (${name}, ${code}, true, ${utcNow()})`;
    });
  }

  /** Drawer flow: let the column defaults fill the rest. Returns the new id. */
  insertBranchQuick(name: string, code: string): Promise<number | undefined> {
    return this.run(async (sql) => {
      const rows = await sql<[{ branch_id: number }]>`
        insert into branches (branch_name, branch_code) values (${name}, ${code})
        returning branch_id`;
      return rows[0]?.branch_id;
    });
  }

  /** Insert a non-branch option; returns the new id. */
  insertOption(
    kind: Exclude<OptionKind, 'branch'>,
    name: string,
    category?: string,
  ): Promise<number | undefined> {
    const t = OPTION_TABLES[kind];
    return this.run(async (sql) => {
      const rows =
        kind === 'assetType'
          ? await sql<[{ id: number }]>`
              insert into asset_type_options (type_name, category)
              values (${name}, ${category ?? 'peripheral'})
              returning type_id as id`
          : await sql<[{ id: number }]>`
              insert into ${sql(t.table)} (${sql(t.nameColumn)}) values (${name})
              returning ${sql(t.idColumn)} as id`;
      return rows[0]?.id;
    });
  }

  /** Returns how many rows were renamed. Branch codes stay untouched. */
  rename(kind: OptionKind, id: number, name: string): Promise<number> {
    const t = OPTION_TABLES[kind];
    return this.run(async (sql) => {
      const result = await sql`
        update ${sql(t.table)} set ${sql(t.nameColumn)} = ${name}
        where ${sql(t.idColumn)} = ${id}`;
      return result.count;
    });
  }

  countAssetsInBranch(id: number): Promise<number> {
    return this.run(async (sql) => {
      const rows = await sql<
        [{ n: number }]
      >`select count(*)::int as n from assets where branch_id = ${id}`;
      return rows[0]?.n ?? 0;
    });
  }

  /**
   * Delete one option. The guard triggers in the database refuse a delete that
   * would orphan assets; `run()` maps that to a REFERENCED_ERROR.
   * Locations cascade with their branch in Postgres.
   */
  remove(kind: OptionKind, id: number): Promise<void> {
    const t = OPTION_TABLES[kind];
    return this.run(async (sql) => {
      await sql`delete from ${sql(t.table)} where ${sql(t.idColumn)} = ${id}`;
    });
  }
}
