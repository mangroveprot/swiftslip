/**
 * Lookup-option CRUD for the Settings page and the drawer's
 * "create a missing option on the fly" flow — the online replacement for the
 * original `Settings.razor` (`AddAsync`/`RenameAsync`/`DeleteAsync`) and the
 * `Create*Async` helpers on `Home.razor`.
 *
 * Delete guards live in the database (triggers) and are mapped to the same
 * friendly message the original C# `Friendly()` produced.
 */
import type {
  CreatedOption,
  ManagedOption,
  ManagedOptions,
  OptionKind,
  OptionMutationResult,
} from "@/shared/inventory";

import { errorMessage, getRgcSql, utcNow } from "./client.server";

const KIND_LABEL: Record<OptionKind, string> = {
  branch: "branch",
  department: "department",
  status: "status",
  condition: "condition",
  assetType: "asset type",
};

function warn(message: string): OptionMutationResult {
  return { ok: false, level: "warning", message };
}

function fail(message: string): OptionMutationResult {
  return { ok: false, level: "error", message };
}

/** C# `Friendly(Exception)`: referential-integrity noise becomes one clear sentence. */
function friendly(message: string): string {
  if (/FOREIGN KEY|still assigned|cannot delete/i.test(message))
    return "Cannot delete — still referenced by other records. Reassign or remove those first.";
  return message;
}

/** `HHmmss` in UTC — matches the original `DateTime.UtcNow:HHmmss` branch-code fallback. */
function timeSuffix(): string {
  return new Date().toISOString().slice(11, 19).replace(/:/g, "");
}

/* ------------------------------------------------------------------ read - */

/** Settings page lists: every option with how many assets still use it (C# `ManagedOption`). */
export async function listManagedOptions(): Promise<ManagedOptions> {
  const sql = getRgcSql();
  type Row = ManagedOption;

  const [branches, departments, statuses, conditions, assetTypes] = await Promise.all([
    sql<Row[]>`
      select b.branch_id as id, b.branch_name as name, count(a.asset_id)::int as usage_count
      from branches b left join assets a on a.branch_id = b.branch_id
      group by b.branch_id, b.branch_name
      order by b.branch_name`,
    sql<Row[]>`
      select d.department_id as id, d.department_name as name, count(a.asset_id)::int as usage_count
      from departments d left join assets a on a.department_id = d.department_id
      group by d.department_id, d.department_name
      order by d.department_name`,
    sql<Row[]>`
      select s.status_id as id, s.status_name as name, count(a.asset_id)::int as usage_count
      from status_options s left join assets a on a.status_id = s.status_id
      group by s.status_id, s.status_name
      order by s.status_name`,
    sql<Row[]>`
      select c.condition_id as id, c.condition_name as name, count(a.asset_id)::int as usage_count
      from condition_options c left join assets a on a.condition_id = c.condition_id
      group by c.condition_id, c.condition_name
      order by c.condition_name`,
    sql<Row[]>`
      select t.type_id as id, t.type_name as name, count(a.asset_id)::int as usage_count
      from asset_type_options t left join assets a on a.type_id = t.type_id
      group by t.type_id, t.type_name
      order by t.type_name`,
  ]);

  return { branches, departments, statuses, conditions, assetTypes };
}

/* ----------------------------------------------------------------- write - */

/**
 * Settings `AddAsync`: duplicate pre-checks (warning toasts) then insert.
 * Never throws for expected failures — returns the result to toast.
 */
export async function createManagedOption(
  kind: OptionKind,
  name: string,
  category?: string,
): Promise<OptionMutationResult> {
  const sql = getRgcSql();
  const label = KIND_LABEL[kind];

  try {
    switch (kind) {
      case "branch": {
        const dup = await sql`select 1 from branches where branch_name = ${name} limit 1`;
        if (dup.length) return warn(`That branch already exists.`);

        let code = name.toUpperCase().replace(/ /g, "-");
        const dupCode = await sql`select 1 from branches where branch_code = ${code} limit 1`;
        if (dupCode.length) code = `${code}-${timeSuffix()}`;

        await sql`
          insert into branches (branch_name, branch_code, status_indicator, created_at)
          values (${name}, ${code}, true, ${utcNow()})`;
        break;
      }
      case "department": {
        const dup = await sql`select 1 from departments where department_name = ${name} limit 1`;
        if (dup.length) return warn(`That department already exists.`);
        await sql`insert into departments (department_name) values (${name})`;
        break;
      }
      case "status": {
        const dup = await sql`select 1 from status_options where status_name = ${name} limit 1`;
        if (dup.length) return warn(`That status already exists.`);
        await sql`insert into status_options (status_name) values (${name})`;
        break;
      }
      case "condition": {
        const dup =
          await sql`select 1 from condition_options where condition_name = ${name} limit 1`;
        if (dup.length) return warn(`That condition already exists.`);
        await sql`insert into condition_options (condition_name) values (${name})`;
        break;
      }
      case "assetType": {
        const dup = await sql`select 1 from asset_type_options where type_name = ${name} limit 1`;
        if (dup.length) return warn(`That asset type already exists.`);
        const normalized =
          !category || !category.trim() ? "peripheral" : category.trim().toLowerCase();
        await sql`insert into asset_type_options (type_name, category) values (${name}, ${normalized})`;
        break;
      }
    }

    return { ok: true };
  } catch (error) {
    return fail(`Failed to add: ${friendly(errorMessage(error))}`);
  }
}

/** Settings `RenameAsync`: duplicate pre-check, then rename (branch codes stay untouched). */
export async function renameManagedOption(
  kind: OptionKind,
  id: number,
  name: string,
): Promise<OptionMutationResult> {
  const sql = getRgcSql();

  try {
    switch (kind) {
      case "branch": {
        const dup =
          await sql`select 1 from branches where branch_name = ${name} and branch_id <> ${id} limit 1`;
        if (dup.length) return warn(`That branch already exists.`);
        const updated =
          await sql`update branches set branch_name = ${name} where branch_id = ${id}`;
        if (!updated.count) return fail("Failed to update: record not found.");
        break;
      }
      case "department": {
        const dup =
          await sql`select 1 from departments where department_name = ${name} and department_id <> ${id} limit 1`;
        if (dup.length) return warn(`That department already exists.`);
        const updated =
          await sql`update departments set department_name = ${name} where department_id = ${id}`;
        if (!updated.count) return fail("Failed to update: record not found.");
        break;
      }
      case "status": {
        const dup =
          await sql`select 1 from status_options where status_name = ${name} and status_id <> ${id} limit 1`;
        if (dup.length) return warn(`That status already exists.`);
        const updated =
          await sql`update status_options set status_name = ${name} where status_id = ${id}`;
        if (!updated.count) return fail("Failed to update: record not found.");
        break;
      }
      case "condition": {
        const dup =
          await sql`select 1 from condition_options where condition_name = ${name} and condition_id <> ${id} limit 1`;
        if (dup.length) return warn(`That condition already exists.`);
        const updated =
          await sql`update condition_options set condition_name = ${name} where condition_id = ${id}`;
        if (!updated.count) return fail("Failed to update: record not found.");
        break;
      }
      case "assetType": {
        const dup =
          await sql`select 1 from asset_type_options where type_name = ${name} and type_id <> ${id} limit 1`;
        if (dup.length) return warn(`That asset type already exists.`);
        const updated =
          await sql`update asset_type_options set type_name = ${name} where type_id = ${id}`;
        if (!updated.count) return fail("Failed to update: record not found.");
        break;
      }
    }

    return { ok: true };
  } catch (error) {
    return fail(`Failed to update: ${friendly(errorMessage(error))}`);
  }
}

/** Settings `DeleteAsync`: branch usage pre-check; everything else relies on the DB guard triggers. */
export async function deleteManagedOption(
  kind: OptionKind,
  id: number,
): Promise<OptionMutationResult> {
  const sql = getRgcSql();

  try {
    switch (kind) {
      case "branch": {
        const used = await sql<
          [{ n: number }]
        >`select count(*)::int as n from assets where branch_id = ${id}`;
        const inUse = used[0]?.n ?? 0;
        if (inUse > 0)
          return warn(
            `Cannot delete branch — still used by ${inUse} asset${inUse === 1 ? "" : "s"}.`,
          );
        // Locations cascade with the branch in Postgres (the original cleared
        // them explicitly only because of SQLite's FK quirks).
        await sql`delete from branches where branch_id = ${id}`;
        break;
      }
      case "department":
        await sql`delete from departments where department_id = ${id}`;
        break;
      case "status":
        await sql`delete from status_options where status_id = ${id}`;
        break;
      case "condition":
        await sql`delete from condition_options where condition_id = ${id}`;
        break;
      case "assetType":
        await sql`delete from asset_type_options where type_id = ${id}`;
        break;
    }

    return { ok: true };
  } catch (error) {
    return fail(friendly(errorMessage(error)));
  }
}

/**
 * Drawer flow (original `Create*Async` helpers): insert straight away and
 * return the new row so the drawer can select it. Throws on failure — the
 * caller shows the toast.
 */
export async function quickCreateOption(
  kind: OptionKind,
  name: string,
  category?: string,
): Promise<CreatedOption> {
  const sql = getRgcSql();

  try {
    switch (kind) {
      case "branch": {
        const code = name.toUpperCase().replace(/ /g, "-");
        const rows = await sql<[{ branch_id: number }]>`
          insert into branches (branch_name, branch_code) values (${name}, ${code})
          returning branch_id`;
        const id = rows[0]?.branch_id;
        if (id == null) throw new Error("Failed to add the new branch.");
        return { id, name };
      }
      case "department": {
        const rows = await sql<[{ department_id: number }]>`
          insert into departments (department_name) values (${name})
          returning department_id`;
        const id = rows[0]?.department_id;
        if (id == null) throw new Error("Failed to add the new department.");
        return { id, name };
      }
      case "status": {
        const rows = await sql<[{ status_id: number }]>`
          insert into status_options (status_name) values (${name})
          returning status_id`;
        const id = rows[0]?.status_id;
        if (id == null) throw new Error("Failed to add the new status.");
        return { id, name };
      }
      case "condition": {
        const rows = await sql<[{ condition_id: number }]>`
          insert into condition_options (condition_name) values (${name})
          returning condition_id`;
        const id = rows[0]?.condition_id;
        if (id == null) throw new Error("Failed to add the new condition.");
        return { id, name };
      }
      case "assetType": {
        const normalized =
          !category || !category.trim() ? "peripheral" : category.trim().toLowerCase();
        const rows = await sql<[{ type_id: number }]>`
          insert into asset_type_options (type_name, category) values (${name}, ${normalized})
          returning type_id`;
        const id = rows[0]?.type_id;
        if (id == null) throw new Error("Failed to add the new asset type.");
        return { id, name, category: normalized };
      }
    }
  } catch (error) {
    const label = KIND_LABEL[kind];
    throw new Error(`Failed to add the new ${label}: ${errorMessage(error)}`);
  }
}
