import { describe, expect, it } from "vitest";

import { formatScheduleClock, formatScheduleLine } from "./schedule-line";

describe("schedule line", () => {
  it("always prints minutes", () => {
    expect(formatScheduleClock("08:00")).toBe("08:00am");
    expect(formatScheduleClock("17:30")).toBe("05:30pm");
    expect(formatScheduleClock("13:00")).toBe("01:00pm");
  });

  it("keeps noon and midnight unambiguous", () => {
    expect(formatScheduleClock("00:00")).toBe("12:00am");
    expect(formatScheduleClock("12:00")).toBe("12:00pm");
    expect(formatScheduleClock("12:15")).toBe("12:15pm");
  });

  it("treats a bare hour and blanks the way the inputs do", () => {
    expect(formatScheduleClock("08")).toBe("08:00am");
    expect(formatScheduleClock("")).toBe("");
  });

  it("composes date and hours into one printed line", () => {
    expect(formatScheduleLine("2026-11-19", "08:00", "17:00")).toBe(
      "11/19/2026 - 08:00am - 05:00pm",
    );
  });

  it("keeps the date when only one end is set", () => {
    expect(formatScheduleLine("2026-11-19", "08:00", "")).toBe("11/19/2026 - 08:00am");
  });
});
