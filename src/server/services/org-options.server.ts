import { getDb } from "@/server/db/client.server";
import {
  DEPARTMENT_POSITIONS,
  DESIGNATIONS,
  departmentForPosition,
  normalizePosition,
  type OrgLists,
  type OrgOptionKind,
} from "@/shared/org";

/**
 * The admin-editable Designation / Department / Position lists behind the
 * pickers. Stored in `org_designations` / `org_departments` / `org_positions`
 * (migrations 0024 and 0025), seeded from the constants in `shared/org`. Every
 * read falls back to the constants when a table is missing or has no rows, so
 * a database that hasn't run those migrations behaves exactly as before.
 *
 * Renames and deletions cascade: profiles hold the same strings by value, and
 * app_access_rules key on Department / Position. Leaving them behind would
 * silently orphan rules and print stale org data on forms.
 */

/** The constant fallback — also the source of the seed data. */
function fallbackLists(): OrgLists {
  return {
    designations: [...DESIGNATIONS],
    departments: Object.keys(DEPARTMENT_POSITIONS),
    positions: Object.entries(DEPARTMENT_POSITIONS).flatMap(([dept, positions]) =>
      positions.map((value) => ({ value, department: dept })),
    ),
  };
}

export async function listOrgOptions(): Promise<OrgLists> {
  const db = getDb();
  const [desRes, deptRes, posRes] = await Promise.all([
    db.from("org_designations").select("value").order("value"),
    db.from("org_departments").select("value").order("value"),
    db.from("org_positions").select("value,department").order("value"),
  ]);
  // Any table missing (pre-0024 / pre-0025) — the constants are the truth.
  if (desRes.error || deptRes.error || posRes.error) return fallbackLists();
  const fallback = fallbackLists();
  const designations = (desRes.data ?? []).map((d) => d.value);
  const departments = (deptRes.data ?? []).map((d) => d.value);
  const positions = (posRes.data ?? []).map((p) => ({
    value: p.value,
    department: p.department,
  }));
  // An emptied-out table is the same signal as a missing one, except
  // `designations`, where an empty list is a legitimate (if odd) state.
  const lists: OrgLists = {
    designations,
    departments: departments.length ? departments : fallback.departments,
    positions: positions.length ? positions : fallback.positions,
  };
  return lists;
}

type MutateInput = { kind: OrgOptionKind; value: string };

/** Every error that isn't "the table doesn't exist yet" is real. */
function rethrowNotMissing(error: { message: string } | null) {
  if (error && !error.message.includes("does not exist")) throw new Error(error.message);
}

/**
 * Rename one option everywhere it is stored: the list row, every profile
 * holding it, and (for Department / Position) every access rule keyed on it.
 */
export async function renameOrgOption(input: MutateInput & { next: string }): Promise<void> {
  const db = getDb();
  const next = input.next.trim();
  if (!next || next === input.value) return;

  // Designation: the office/branch, stored only on `profiles.area`. It is not
  // an access-rule scope, so there is nothing else to move.
  if (input.kind === "designation") {
    const { error: listErr } = await db
      .from("org_designations")
      .update({ value: next })
      .eq("value", input.value);
    rethrowNotMissing(listErr);
    const { error: profErr } = await db
      .from("profiles")
      .update({ area: next })
      .eq("area", input.value);
    rethrowNotMissing(profErr);
    return;
  }

  if (input.kind === "department") {
    const { error: listErr } = await db
      .from("org_departments")
      .update({ value: next })
      .eq("value", input.value);
    rethrowNotMissing(listErr);
    // The positions and profiles that sat under the old department move too.
    const { error: posErr } = await db
      .from("org_positions")
      .update({ department: next })
      .eq("department", input.value);
    rethrowNotMissing(posErr);
    const { error: profErr } = await db
      .from("profiles")
      .update({ department: next })
      .eq("department", input.value);
    rethrowNotMissing(profErr);
    const { error: ruleErr } = await db
      .from("app_access_rules")
      .update({ scope_value: next })
      .eq("scope", "department")
      .eq("scope_value", input.value);
    rethrowNotMissing(ruleErr);
    return;
  }

  // Position.
  const { error: listErr } = await db
    .from("org_positions")
    .update({ value: next })
    .eq("value", input.value);
  rethrowNotMissing(listErr);
  const { error: profErr } = await db
    .from("profiles")
    .update({ designation: next })
    .eq("designation", input.value);
  rethrowNotMissing(profErr);
  const { error: ruleErr } = await db
    .from("app_access_rules")
    .update({ scope_value: next })
    .eq("scope", "position")
    .eq("scope_value", input.value);
  rethrowNotMissing(ruleErr);
}

/**
 * Remove one option from the list. Profiles keep what they hold — the value
 * just stops being offered — but access rules keyed on it are deleted, since
 * a rule that matches nobody is a trap.
 */
export async function deleteOrgOption(input: MutateInput): Promise<void> {
  const db = getDb();
  if (input.kind === "designation") {
    const { error } = await db.from("org_designations").delete().eq("value", input.value);
    rethrowNotMissing(error);
    return;
  }
  if (input.kind === "department") {
    const { error } = await db.from("org_departments").delete().eq("value", input.value);
    rethrowNotMissing(error);
  } else {
    const { error } = await db.from("org_positions").delete().eq("value", input.value);
    rethrowNotMissing(error);
  }
  // A rule keyed on a value nobody can pick any more is a trap — drop it.
  const { error: ruleErr } = await db
    .from("app_access_rules")
    .delete()
    .eq("scope", input.kind)
    .eq("scope_value", input.value);
  rethrowNotMissing(ruleErr);
}

export type OrgAddInput =
  | { kind: "designation"; value: string }
  | { kind: "department"; value: string }
  | { kind: "position"; value: string; department?: string | undefined };

/**
 * Add an option that isn't on the list yet — the "Others…" typed value, saved
 * so the next picker shows it. Existing names are left alone (already there).
 */
export async function addOrgOption(input: OrgAddInput): Promise<void> {
  const db = getDb();
  const value = input.value.trim();
  if (!value) return;
  // Designation and Department are a bare name each; only Position carries the
  // department it belongs under.
  const result =
    input.kind === "designation"
      ? await db.from("org_designations").insert({ value })
      : input.kind === "department"
        ? await db.from("org_departments").insert({ value })
        : await db.from("org_positions").insert({
            value,
            department:
              (input.department ?? "").trim() || departmentForPosition(normalizePosition(value)),
          });
  // 23505 = unique violation — already on the list, nothing to do.
  const { error } = result;
  if (error && error.code !== "23505" && !error.message.includes("does not exist"))
    throw new Error(error.message);
}
