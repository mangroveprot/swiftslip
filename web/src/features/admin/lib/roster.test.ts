import { describe, expect, it } from "vitest";

import type { Role } from "@swiftslip/shared/types";

import { isIncomplete, sortUsers, type RosterFilter, type RosterRow } from "./roster";

/** The three columns a finished profile fills; the fixture overrides them. */
const COMPLETE_PROFILE = {
  designation: "Regasco Head Office",
  department: "Information Technology",
  position: "IT Programmer",
};

function account(
  id_number: string,
  role: Role,
  full_name: string,
  profile: Partial<Pick<RosterRow, "designation" | "department" | "position">> = {},
): RosterRow {
  return { id_number, role, full_name, ...COMPLETE_PROFILE, ...profile };
}

/** A profile nobody has filled in yet: no name, office, department or position. */
function emptyAccount(id_number: string, role: Role): RosterRow {
  return {
    id_number,
    role,
    full_name: "",
    designation: "",
    department: "",
    position: "",
  };
}

/**
 * The roster from the owner's report: two finished administrators, one bare
 * "000" admin, two finished staff and two bare staff accounts.
 */
const ROSTER: RosterRow[] = [
  account("2026-515", "admin", "Gerald Vilaver"),
  account("2026-420", "admin", "Reycar Tanudra"),
  emptyAccount("000", "admin"),
  account("2026-118", "user", "Ace Martel"),
  account("2026-207", "user", "KAY B. CATAYLO"),
  emptyAccount("2026-302", "user"),
  emptyAccount("2026-639", "user"),
];

const ids = (rows: RosterRow[]) => rows.map((row) => row.id_number);

/**
 * What the component does per tab: the chip narrows the rows, then `sortUsers`
 * orders them. `sortUsers` deliberately does not filter, so the tab's own
 * predicate is applied here, exactly as `UserManagement` applies it.
 */
function tab(rows: RosterRow[], filter: RosterFilter) {
  const shown =
    filter === "all"
      ? rows
      : filter === "incomplete"
        ? rows.filter((row) => isIncomplete(row))
        : rows.filter((row) => row.role === filter);
  return ids(sortUsers(shown, filter));
}

describe("sortUsers", () => {
  it("puts administrators first, names A–Z, then unfinished profiles by ID", () => {
    expect(ids(sortUsers(ROSTER))).toEqual([
      "2026-515", // Gerald Vilaver, admin
      "2026-420", // Reycar Tanudra, admin
      "000", // admin with no profile
      "2026-118", // Ace Martel, staff
      "2026-207", // KAY B. CATAYLO, staff
      "2026-302", // staff with no profile
      "2026-639", // staff with no profile
    ]);
  });

  it("keeps the profile-status and name rules inside the Administrators and Staff tabs", () => {
    expect(tab(ROSTER, "admin")).toEqual(["2026-515", "2026-420", "000"]);
    expect(tab(ROSTER, "user")).toEqual(["2026-118", "2026-207", "2026-302", "2026-639"]);
    // "All" is the same ordering the default argument produces.
    expect(tab(ROSTER, "all")).toEqual(ids(sortUsers(ROSTER)));
  });

  it("orders the Incomplete tab by role, then ID", () => {
    // A named but unfinished profile: its name must not lift it out of ID order.
    const maria = account("2026-900", "user", "Maria Santos", { position: "" });

    expect(tab([...ROSTER, maria], "incomplete")).toEqual([
      "000", // administrator
      "2026-302", // staff
      "2026-639", // staff
      "2026-900", // staff, Maria — last by ID, not first by name
    ]);
  });

  it("uses the badge's completeness check, not just the presence of a name", () => {
    // Maria has a name, an office and a department but no Position, so the
    // "Incomplete profile" badge marks her; the order has to agree.
    const maria = account("2026-900", "user", "Maria Santos", { position: "" });
    const staff = tab([...ROSTER, maria], "user");

    expect(isIncomplete(maria)).toBe(true);
    expect(staff).toEqual(["2026-118", "2026-207", "2026-302", "2026-639", "2026-900"]);
  });

  it("does not reorder the array it was given", () => {
    const input = [...ROSTER].reverse();
    const before = ids(input);

    sortUsers(input);

    expect(ids(input)).toEqual(before);
  });
});
