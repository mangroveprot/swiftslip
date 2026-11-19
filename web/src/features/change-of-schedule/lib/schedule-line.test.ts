import { describe, expect, it } from "vitest";

import { formatScheduleLine } from "./schedule-line";

/** The COS sheet's own composition: date, then the hours through the form clock. */
describe("COS schedule line", () => {
  it("composes the date and both ends", () => {
    expect(formatScheduleLine("2026-11-19", "08:00", "17:00")).toBe(
      "11/19/2026 - 08:00am - 05:00pm",
    );
  });

  it("keeps the date when only one end is set", () => {
    expect(formatScheduleLine("2026-11-19", "08:00", "")).toBe("11/19/2026 - 08:00am");
  });

  it("prints the hours alone when the date is empty", () => {
    expect(formatScheduleLine("", "08:00", "")).toBe("08:00am");
  });

  it("prints nothing for a blank line", () => {
    expect(formatScheduleLine("", "", "")).toBe("");
  });
});
