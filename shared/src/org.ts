/**
 * The fixed Designation and Position choices.
 *
 * SCOPE — SwiftSlip's own profiles ONLY. The RGC Asset Inventory is a separate
 * database (`RGC_INVENTORY_DATABASE_URL`) with its own idea of branches and
 * floors; its values are deliberately NOT pulled in here, or this list would
 * drift toward designations nobody has ever used in SwiftSlip. Inventories that
 * need one can still be typed under "Others", and the App Access screen can
 * still create a rule for any value.
 *
 * These are free text on `profiles.area` / `profiles.designation` — there is no
 * org directory. The list exists so people stop inventing spellings, and
 * "Others" exists so a real new designation is never blocked by this file.
 * Adding one here is a one-line edit; it does not need a migration.
 */

/** Sentinel option meaning "the value isn't on the list". */
export const OTHERS = "__others__";

/** Designations (office / branch assignments) — shown to the user as
 *  "Designation", stored on `profiles.area`. The two Dipolog spellings are
 *  deliberately listed SEPARATELY (an account works at one of them), so
 *  neither is aliased into the other below. */
export const DESIGNATIONS = ["RGC Dipolog Sat Office", "RGC Dipolog Satellite"] as const;

/**
 * The fixed org structure: each Department owns a list of Positions, and a
 * Position lives under exactly one Department ("HR Officer" under "Human
 * Resources Department"). Everything else derives from this one map —
 * `DEPARTMENTS`, `POSITIONS`, `POSITION_DEPARTMENTS` below — so adding a
 * position here is the only edit needed.
 */
export const DEPARTMENT_POSITIONS: Record<string, readonly string[]> = {
  "Information Technology": ["IT Support", "IT Programmer"],
  Operations: ["Field Monitoring"],
};

export type DepartmentPositions = Record<string, readonly string[]>;

/** The admin-editable lists behind the pickers (migrations 0024 / 0025):
 *  designations, departments, and every position with the department it sits
 *  under, sorted by value. */
export type OrgLists = {
  designations: string[];
  departments: string[];
  positions: Array<{ value: string; department: string }>;
};

/** The three lists an admin can maintain from a picker's own row buttons. */
export type OrgOptionKind = "designation" | "department" | "position";

export const DEPARTMENTS = Object.keys(DEPARTMENT_POSITIONS);

export const POSITIONS = Object.values(DEPARTMENT_POSITIONS).flat();

/** Position → its department, derived from DEPARTMENT_POSITIONS above. */
export const POSITION_DEPARTMENTS: Record<string, string> = Object.fromEntries(
  DEPARTMENTS.flatMap((dept) =>
    (DEPARTMENT_POSITIONS[dept] ?? []).map((pos) => [pos, dept] as const),
  ),
);

/**
 * Spellings that were already on profiles before the dropdowns existed, mapped
 * to the canonical value. Read when loading so an account keeps working, and
 * applied on save so the old spelling does not come back.
 *
 * The Dipolog office had several spellings across a handful of profiles, which
 * silently broke access rules keyed on the designation. "RGC Dipolog Sat
 * Office" is NOT in here on purpose: it is a designation of its own now.
 */
export const DESIGNATION_ALIASES: Record<string, string> = {
  "IT DEP/RGC-DIPOLOG SAT OFFICE": "RGC Dipolog Satellite",
  "IT DEP RGC DIPOLOG SAT OFFICE": "RGC Dipolog Satellite",
  "RGC_Dipolog Sat Office": "RGC Dipolog Satellite",
  "RGC - Dipolog Satellite": "RGC Dipolog Satellite",
};

export const POSITION_ALIASES: Record<string, string> = {};

/** Canonical form of a designation, or the input untouched if it isn't known. */
export function normalizeDesignation(value: string): string {
  const trimmed = value.trim();
  return DESIGNATION_ALIASES[trimmed] ?? trimmed;
}

/** Canonical form of a position, or the input untouched if it isn't known. */
export function normalizePosition(value: string): string {
  const trimmed = value.trim();
  return POSITION_ALIASES[trimmed] ?? trimmed;
}

/**
 * The department a position belongs to ("" for a blank or off-list position).
 *
 * The profile stores its own department (migration 0023); this is the
 * fallback for rows that haven't been backfilled yet and the source for
 * auto-filling a fresh pick. Looked up in canonical form, so a legacy spelling
 * on an old profile still resolves.
 */
export function departmentForPosition(position: string, lists?: OrgLists): string {
  const normalized = normalizePosition(position);
  if (!normalized) return "";
  // The live table wins. A department an admin added, renamed, or moved a
  // position into is what the pickers show, so it must also be what the
  // position implies. Reading only the fixed constants here made a picker
  // snap a freshly chosen department straight back to the old constant name
  // (pick "IT DEP", the form reverts it to "Information Technology").
  const live = lists?.positions.find((p) => p.value === normalized);
  if (live) return live.department;
  return POSITION_DEPARTMENTS[normalized] ?? "";
}

/**
 * The value the OB / OT / LOA sheets print in their single "Department /
 * Location" box: the department, then the employee's Designation (the office /
 * branch), joined by the slash the box is named with — "IT DEP/RGC Dipolog Sat
 * Office".
 *
 * The office is not a department, which is why it is appended here rather than
 * being folded into the department itself: the two facts stay separately
 * sourced and only meet at the printed value, which is what the box asks for.
 * Either half may be blank, and the slash is dropped rather than printed
 * dangling, so a profile missing one of them still yields a clean string.
 */
export function departmentWithLocation(department: string, office: string): string {
  return [department.trim(), office.trim()].filter(Boolean).join("/");
}

/**
 * The positions offered under a department — "" (nothing picked yet) offers
 * every position, and an unknown department offers all of them too so the
 * picker is never a dead end.
 */
export function positionsForDepartment(department: string): readonly string[] {
  const trimmed = department.trim();
  if (!trimmed) return POSITIONS;
  return DEPARTMENT_POSITIONS[trimmed] ?? POSITIONS;
}

/**
 * Positions offered under a department, resolved against the live
 * `org_options` table when it is loaded and the value matches a department
 * the table actually owns, otherwise the fixed constants above. Without this
 * fallback a position whose department was edited out of the table would
 * silently disappear from the picker, and a profile still holding the old
 * value would suddenly read as inconsistent.
 */
export function positionsUnder(department: string, lists: OrgLists | undefined): readonly string[] {
  const trimmed = department.trim();
  if (trimmed && lists) {
    const live = lists.positions.filter((p) => p.department === trimmed).map((p) => p.value);
    // A department the table lists no positions under yet (one the admin just
    // added) must not be a dead end — fall through to the constant pairs and,
    // for a name nothing knows, to every position. An empty dropdown is what
    // makes a stored position look lost the moment its department moves.
    if (live.length) return live;
  }
  return positionsForDepartment(trimmed);
}

/**
 * What the picker should show for a stored value. A value that predates the
 * list (or came in through "Others") has no matching option, so it reports
 * OTHERS and the picker reveals the text so nothing is silently overwritten.
 */
export function optionFor(list: readonly string[], value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return (list as readonly string[]).includes(trimmed) ? trimmed : OTHERS;
}

/**
 * True when "Others…" is chosen but nothing has been typed into the box.
 *
 * `selected` is the picker's own choice, NOT a value the field can be asked
 * for: an empty value looks identical to "not set", so the form cannot tell
 * that Others is selected-but-unfilled. OrgSelect is the only thing that
 * knows, which is why it reports this upwards.
 *
 * Without the check, choosing Others and hitting Save sends an empty value and
 * quietly erases whatever the field held — the exact loss the picker exists to
 * prevent.
 */
export function needsSpecification(selected: string, value: string): boolean {
  return selected === OTHERS && value.trim().length === 0;
}
