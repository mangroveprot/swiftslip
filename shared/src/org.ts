/**
 * Shared behaviour for the Designation / Department / Position pickers.
 *
 * SCOPE — SwiftSlip's own profiles ONLY. The RGC Asset Inventory is a separate
 * database (`RGC_INVENTORY_DATABASE_URL`) with its own idea of branches and
 * floors; its values are deliberately NOT pulled in here, or this list would
 * drift toward designations nobody has ever used in SwiftSlip. Inventories that
 * need one can still be typed under "Others", and the App Access screen can
 * still create a rule for any value.
 *
 * The CHOICES live in the database — `org_designations`, `org_departments` and
 * `org_positions` (migrations 0024 / 0025) — and reach the pickers as an
 * `OrgLists`. Nothing here hard-codes a Designation / Department / Position any
 * more: a value an administrator deleted stays deleted instead of coming back
 * from a constant, which is how "IT Support" and "IT Programmer" kept appearing
 * under a Field Monitoring department that had never held them. Adding a value
 * is a row, not a code change. (The employer list below is the one deliberate
 * exception — it is a fixed company choice, not an editable org list.)
 *
 * The columns are still free text on `profiles.area` / `profiles.designation`;
 * the lists exist so people stop inventing spellings, and "Others" exists so a
 * real new value is never blocked.
 */

/** Sentinel option meaning "the value isn't on the list". */
export const OTHERS = "__others__";

/**
 * The two employers an account can belong to, stored as smallint codes:
 * 0 = Regasco, 1 = Mindbridge.
 *
 * Fixed on purpose: this is the company the person works for, not an
 * admin-maintained org list like Designation / Department / Position. The code
 * is what the database and API carry; the helpers below are the ONE converter
 * between that code and the label the screen shows, so the frontend never has
 * to remember which number means which company.
 */
export const EMPLOYERS = [
  { value: 0, label: "Regasco" },
  { value: 1, label: "Mindbridge" },
] as const;

/** A stored employer code: 0 = Regasco, 1 = Mindbridge. */
export type Employer = (typeof EMPLOYERS)[number]["value"];

/** The default the database column uses (and the fallback for an unknown code). */
export const DEFAULT_EMPLOYER: Employer = 1;

/** The labels in picker order — what the frontend offers and prints. */
export const EMPLOYER_LABELS = EMPLOYERS.map((employer) => employer.label);

/**
 * Stored code → the company name the screen prints. Unknown or missing values
 * fall back to the column default (Mindbridge) so a legacy row still reads.
 */
export function employerLabel(value: number | null | undefined): string {
  return (
    EMPLOYERS.find((employer) => employer.value === value)?.label ??
    EMPLOYERS.find((employer) => employer.value === DEFAULT_EMPLOYER)?.label ??
    "Mindbridge"
  );
}

/**
 * Company name → the stored code. Case-insensitive, and unknown/blank input
 * falls back to the column default (Mindbridge) so a picker can never write an
 * invalid code.
 */
export function employerCode(label: string | null | undefined): Employer {
  const wanted = (label ?? "").trim().toLowerCase();
  return (
    EMPLOYERS.find((employer) => employer.label.toLowerCase() === wanted)?.value ?? DEFAULT_EMPLOYER
  );
}

/** The admin-editable lists behind the pickers (migrations 0024 / 0025):
 *  designations, departments, and every position with the department it sits
 *  under — read from `org_designations` / `org_departments` / `org_positions`,
 *  the only place the choices themselves live. */
export type OrgLists = {
  designations: string[];
  departments: string[];
  positions: Array<{ value: string; department: string }>;
};

/** The three lists an admin can maintain from a picker's own row buttons. */
export type OrgOptionKind = "designation" | "department" | "position";

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
 * The department a position belongs to ("" when the lists aren't loaded, the
 * position is blank, or nothing in `org_positions` holds it).
 *
 * The profile stores its own department (migration 0023); this is the
 * fallback for rows that haven't been backfilled yet and the source for
 * auto-filling a fresh pick. Looked up in canonical form, so a legacy spelling
 * on an old profile still resolves — and only against the live table, so a
 * department an admin added, renamed, or moved a position into is what the
 * pickers show and what the position implies. There is no constant left to
 * fall back on: a value deleted from the table must not reappear here either.
 */
export function departmentForPosition(position: string, lists?: OrgLists): string {
  const normalized = normalizePosition(position);
  if (!normalized || !lists) return "";
  return lists.positions.find((p) => p.value === normalized)?.department ?? "";
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
 * The positions offered under a department — straight from `org_positions`,
 * so the picker offers exactly what an administrator filed there and nothing
 * else.
 *
 * - Nothing chosen yet: every position on the list, so a fresh account can
 *   pick one and let the department follow (the "e.g. IT Support" placeholder
 *   is for exactly that state).
 * - A department chosen: only the positions filed under it. A department with
 *   none — one just added, or one whose positions were deleted — offers an
 *   empty list rather than every other department's, which is how "IT
 *   Support" and "IT Programmer" kept turning up under Field Monitoring.
 * - Lists not loaded yet: empty too, never a set of hard-coded values the
 *   table may not hold.
 */
export function positionsUnder(department: string, lists: OrgLists | undefined): readonly string[] {
  if (!lists) return [];
  const trimmed = department.trim();
  if (!trimmed) return lists.positions.map((p) => p.value);
  return lists.positions.filter((p) => p.department === trimmed).map((p) => p.value);
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
