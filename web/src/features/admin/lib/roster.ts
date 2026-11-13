import { departmentForPosition, type OrgLists } from "@swiftslip/shared/org";
import type { Role } from "@swiftslip/shared/types";

/**
 * What the roster's order and profile badge read from an account. Every row
 * the User management table draws satisfies it; keeping it structural means
 * the sorting can be tested without dragging the component's view model in.
 */
export type RosterRow = {
  /** The employee's real full name from their profile ("" when unset). */
  full_name: string;
  /** Profile `area`, the office/branch. */
  designation: string;
  /** Profile `department`; blank rows fall back to their position's department. */
  department: string;
  /** Profile `designation`, the job title. */
  position: string;
  id_number: string;
  role: Role;
};

/** Which tab is selected above the list. */
export type RosterFilter = "all" | "admin" | "user" | "incomplete";

/**
 * The department a row shows: the one stored on the profile, or the one its
 * position implies for rows that were never backfilled / predate migration
 * 0023, resolved against the live `org_positions` rows, never a built-in
 * copy. The office branch is never a department, so `designation` is not used.
 */
export function displayDepartment(a: RosterRow, lists?: OrgLists) {
  return a.department.trim() || departmentForPosition(a.position, lists);
}

/**
 * A profile is incomplete until it says who the person is and where they work:
 * the real name, the Designation (office), the Department, and the Position.
 * Anything less and the forms that auto-fill from the profile print blanks.
 *
 * This is the single definition: the "Incomplete profile" badge, the tab count
 * and the roster order all call it.
 */
export function isIncomplete(a: RosterRow, lists?: OrgLists) {
  return (
    !a.full_name.trim() ||
    !a.designation.trim() ||
    !displayDepartment(a, lists) ||
    !a.position.trim()
  );
}

/** Administrators first (rank 0), staff after (rank 1). */
const ROLE_RANK: Record<string, number> = { admin: 0, user: 1 };

const roleRank = (row: RosterRow) => ROLE_RANK[row.role] ?? 2;

/** "9" before "10": IDs compare by value, not as plain text. */
const byIdNumber = (a: RosterRow, b: RosterRow) =>
  a.id_number.localeCompare(b.id_number, undefined, { numeric: true });

/**
 * Roster order, which is not creation order.
 *
 * 1. Administrators first. They hold the most power, so they are the rows an
 *    admin is most likely to audit; the ID number is not what anyone scans for.
 * 2. Inside a role, complete profiles come first, name A–Z, so "is Ace set up?"
 *    is one look at the group. The check is `isIncomplete` — the same one the
 *    badge uses — so a profile that still misses its department or position
 *    drops to the end of its role instead of hiding among the finished ones.
 * 3. Rows the badge calls incomplete cannot be placed alphabetically by their
 *    other fields, so they fall to the end of their role, ordered by ID number.
 *    In the "Incomplete" tab they are all in that state already, so the order
 *    there is simply role, then ID.
 *
 * Accented and capitalised names compare as a reader expects ("é" next to
 * "e"). The input array is left untouched: the filtered array the caller
 * builds is copied before sorting.
 */
export function sortUsers<T extends RosterRow>(
  rows: readonly T[],
  filter: RosterFilter = "all",
  lists?: OrgLists,
): T[] {
  return [...rows].sort((a, b) => {
    const byRole = roleRank(a) - roleRank(b);
    if (byRole !== 0) return byRole;

    // Every row in this tab carries the badge, so a name order would be noise.
    if (filter === "incomplete") return byIdNumber(a, b);

    const aComplete = !isIncomplete(a, lists);
    const bComplete = !isIncomplete(b, lists);
    if (aComplete !== bComplete) return aComplete ? -1 : 1;

    if (aComplete) {
      const byName = a.full_name
        .trim()
        .localeCompare(b.full_name.trim(), undefined, { sensitivity: "base" });
      if (byName !== 0) return byName;
    }

    return byIdNumber(a, b);
  });
}
