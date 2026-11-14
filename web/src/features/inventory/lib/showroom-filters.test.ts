import { describe, expect, it } from "vitest";

import type { Showroom } from "@swiftslip/shared/showrooms";
import { matchesShowroomFilter, showroomOnline } from "@swiftslip/shared/showrooms";

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

describe("showroomOnline", () => {
  it("needs both an installed CCTV and an online connection", () => {
    expect(showroomOnline(showroom())).toBe(true);
    expect(showroomOnline(showroom({ cctv_connection: "offline" }))).toBe(false);
    expect(showroomOnline(showroom({ cctv_installed: "not_installed" }))).toBe(false);
  });
});

describe("matchesShowroomFilter", () => {
  it("keeps every row for All", () => {
    expect(matchesShowroomFilter(showroom({ cctv_connection: "offline" }), "all")).toBe(true);
  });

  it("matches the Online tab only for installed and online", () => {
    expect(matchesShowroomFilter(showroom(), "online")).toBe(true);
    expect(matchesShowroomFilter(showroom({ cctv_connection: "not_recorded" }), "online")).toBe(
      false,
    );
  });

  it("matches Installed for any showroom whose CCTV is active", () => {
    expect(matchesShowroomFilter(showroom({ cctv_connection: "offline" }), "installed")).toBe(true);
    expect(matchesShowroomFilter(showroom({ cctv_installed: "not_installed" }), "installed")).toBe(
      false,
    );
  });

  it("matches Not available for installed CCTV that is not online", () => {
    expect(matchesShowroomFilter(showroom({ cctv_connection: "offline" }), "not_available")).toBe(
      true,
    );
    expect(
      matchesShowroomFilter(showroom({ cctv_connection: "not_recorded" }), "not_available"),
    ).toBe(true);
    expect(matchesShowroomFilter(showroom(), "not_available")).toBe(false);
    expect(
      matchesShowroomFilter(
        showroom({ cctv_installed: "not_installed", cctv_connection: "offline" }),
        "not_available",
      ),
    ).toBe(false);
  });

  it("keeps Needs action / In progress based on the traffic-light tones", () => {
    expect(matchesShowroomFilter(showroom({ internet: "needs_request" }), "needs_action")).toBe(
      true,
    );
    expect(matchesShowroomFilter(showroom({ internet: "ongoing" }), "in_progress")).toBe(true);
    expect(matchesShowroomFilter(showroom(), "in_progress")).toBe(false);
  });
});
