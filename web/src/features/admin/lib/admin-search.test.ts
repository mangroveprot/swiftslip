import { describe, expect, it } from "vitest";

import { validateAdminSearch } from "./admin-search";

describe("validateAdminSearch", () => {
  it("keeps every value the admin panel owns", () => {
    expect(
      validateAdminSearch({
        section: "backup",
        filter: "signin-failed",
        role: "incomplete",
        tab: "person",
      }),
    ).toEqual({
      section: "backup",
      filter: "signin-failed",
      role: "incomplete",
      tab: "person",
    });
  });

  it("keeps the values it owns and drops only the rest", () => {
    expect(
      validateAdminSearch({
        section: "backup",
        filter: "everything",
        role: "owner",
        tab: "person",
        team: "night",
      }),
    ).toEqual({ section: "backup", tab: "person" });
  });

  it("refuses an Activity logs filter with no tab to render", () => {
    // The API's filter enum also knows `showrooms`; the page has no tab for
    // it, so keeping it would leave the URL and the visible tab disagreeing.
    expect(validateAdminSearch({ section: "logs", filter: "showrooms" })).toEqual({
      section: "logs",
    });
  });

  it("drops unknown values instead of rendering an unknown screen", () => {
    expect(
      validateAdminSearch({
        section: "payroll",
        filter: "everything",
        role: "owner",
        tab: "team",
      }),
    ).toEqual({});
  });

  it("keeps Google's handshake strings so the toast can read them once", () => {
    expect(
      validateAdminSearch({
        section: "backup",
        backup: "connected",
        reason: "access_denied",
        account: "admin@example.com",
      }),
    ).toEqual({
      section: "backup",
      backup: "connected",
      reason: "access_denied",
      account: "admin@example.com",
    });
  });

  it("ignores values that are not strings", () => {
    expect(validateAdminSearch({ section: ["backup"], filter: 7, backup: true })).toEqual({});
  });
});
