import { describe, expect, it } from "vitest";

import type { Showroom } from "@swiftslip/shared/showrooms";

import { buildShowroomFileName, showroomSheetRows } from "./showroom-export";

function showroom(overrides: Partial<Showroom> = {}): Showroom {
  return {
    showroom_id: 1,
    showroom_name: "Roxas",
    cctv_installed: "active",
    cctv_connection: "online",
    cctv_note: null,
    internet: "active",
    notes: null,
    created_at: null,
    updated_at: null,
    linked_update_id: null,
    link: null,
    ...overrides,
  };
}

describe("buildShowroomFileName", () => {
  it("stamps the date and time in local time", () => {
    expect(buildShowroomFileName(new Date(2026, 10, 14, 14, 6, 37))).toBe(
      "REGASCO_showrooms_20261114_140637.xlsx",
    );
  });

  it("zero-pads single-digit month, day, hour, minute and second", () => {
    expect(buildShowroomFileName(new Date(2026, 0, 5, 3, 4, 9))).toBe(
      "REGASCO_showrooms_20260105_030409.xlsx",
    );
  });
});

describe("showroomSheetRows", () => {
  it("writes the header in the board's column order", () => {
    expect(showroomSheetRows([])).toEqual([
      [
        "Showroom",
        "Location",
        "Status",
        "Action required",
        "CCTV installed",
        "CCTV connection",
        "Internet",
        "Notes",
      ],
    ]);
  });

  it("maps labels, appends the CCTV note and keeps blank notes empty", () => {
    const rows = showroomSheetRows([
      showroom({
        showroom_name: "Sindangan",
        cctv_connection: "offline",
        cctv_note: "Needs connecting",
        internet: "needs_request",
        notes: "Requested last week",
      }),
      showroom({ showroom_name: "Calamba SR", internet: "installed" }),
    ]);

    expect(rows[1]).toEqual([
      "Sindangan",
      "",
      "Not recorded",
      "Not recorded",
      "Active",
      "Offline (Needs connecting)",
      "Needs request",
      "Requested last week",
    ]);
    expect(rows[2]).toEqual([
      "Calamba SR",
      "",
      "Not recorded",
      "Not recorded",
      "Active",
      "Online",
      "Installed",
      "",
    ]);
  });

  it("prints the linked Summary row's location, Status and Action required", () => {
    const rows = showroomSheetRows([
      showroom({
        showroom_name: "Polanco SR",
        linked_update_id: 3,
        link: {
          update_id: 3,
          showroom_name: "Mun. of Polanco",
          location: "Obay, Polanco ZDN",
          status: "open",
          action_required: "Operational",
          map_url: null,
        },
      }),
    ]);

    expect(rows[1]).toEqual([
      "Polanco SR",
      "Obay, Polanco ZDN",
      "Open",
      "Operational",
      "Active",
      "Online",
      "Active",
      "",
    ]);
  });

  it("renders the not-recorded keys with their shared label", () => {
    const rows = showroomSheetRows([
      showroom({
        cctv_installed: "not_recorded",
        cctv_connection: "not_recorded",
        internet: "not_recorded",
      }),
    ]);

    expect(rows[1]).toEqual([
      "Roxas",
      "",
      "Not recorded",
      "Not recorded",
      "Not recorded",
      "Not recorded",
      "Not recorded",
      "",
    ]);
  });
});
