import { describe, expect, it } from "vitest";

import type { Showroom } from "@swiftslip/shared/showrooms";
import { showroomCctvSummary } from "@swiftslip/shared/showrooms";

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
    ...overrides,
  };
}

describe("showroomCctvSummary", () => {
  it("takes available units from the editable total, not the connection", () => {
    const rows = Array.from({ length: 18 }, (_, i) =>
      showroom({
        showroom_id: i + 1,
        cctv_connection: i < 8 ? "online" : i < 12 ? "offline" : "not_recorded",
      }),
    );

    expect(showroomCctvSummary(rows, 24)).toEqual({
      totalUnits: 24,
      installed: 18,
      available: 6,
      offline: 4,
      notRecorded: 6,
      notAvailable: 10,
      installedPercent: 75,
    });
  });

  it("leaves showrooms without installed CCTV out of the installed count", () => {
    const summary = showroomCctvSummary(
      [
        showroom({ cctv_installed: "not_installed", cctv_connection: "offline" }),
        showroom({ cctv_installed: "not_recorded", cctv_connection: "not_recorded" }),
        showroom({ cctv_connection: "online" }),
      ],
      5,
    );

    expect(summary.installed).toBe(1);
    expect(summary.available).toBe(4);
    expect(summary.notAvailable).toBe(0);
    expect(summary.installedPercent).toBe(20);
  });

  it("never reports negative stock when the total is below what is installed", () => {
    const summary = showroomCctvSummary([showroom(), showroom({ showroom_id: 2 })], 1);

    expect(summary.available).toBe(0);
    expect(summary.installedPercent).toBe(100);
  });

  it("reports zeroes when nothing is recorded", () => {
    expect(showroomCctvSummary([], 0)).toEqual({
      totalUnits: 0,
      installed: 0,
      available: 0,
      offline: 0,
      notRecorded: 0,
      notAvailable: 0,
      installedPercent: 0,
    });
  });

  it("rounds the installed share to the nearest whole number", () => {
    const rows = Array.from({ length: 3 }, (_, i) => showroom({ showroom_id: i + 1 }));

    expect(showroomCctvSummary(rows, 7).installedPercent).toBe(43);
  });
});
