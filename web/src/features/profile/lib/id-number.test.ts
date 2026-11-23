import { describe, expect, it } from "vitest";

import { idNumberChangeNotice } from "./id-number";

describe("idNumberChangeNotice", () => {
  it("says nothing when the ID did not change", () => {
    expect(idNumberChangeNotice("2024-0113", "2024-0113")).toBeNull();
    expect(idNumberChangeNotice("  2024-0113  ", "2024-0113")).toBeNull();
  });

  it("names both the new and the old sign-in ID", () => {
    expect(idNumberChangeNotice("2024-0113", "2024-0114")).toBe(
      "You'll sign in with 2024-0114 from now on. Your current Employee ID, 2024-0113, will stop working.",
    );
  });

  it("only promises the new ID when there was no old one", () => {
    expect(idNumberChangeNotice("", "2024-0114")).toBe(
      "You'll sign in with 2024-0114 from now on.",
    );
  });

  it("does not prompt for a blank ID (the form refuses it first)", () => {
    expect(idNumberChangeNotice("2024-0113", "   ")).toBeNull();
  });
});
