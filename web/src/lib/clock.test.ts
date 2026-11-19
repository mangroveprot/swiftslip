import { describe, expect, it } from "vitest";

import { formatClock, formatTime12h } from "@swiftslip/shared/time";

/**
 * The one clock every form prints. Two halves of the same rule: `formatClock`
 * blanks what it cannot read (composed lines), `formatTime12h` keeps the text
 * (a value printed on its own, legacy free text included).
 */
describe("the form clock", () => {
  it("always prints minutes, even on the hour", () => {
    expect(formatClock("08:00")).toBe("08:00am");
    expect(formatClock("17:00")).toBe("05:00pm");
    expect(formatClock("13:00")).toBe("01:00pm");
  });

  it("keeps a padded hour and lowercase suffix", () => {
    expect(formatClock("08:05")).toBe("08:05am");
    expect(formatClock("9:30")).toBe("09:30am");
    expect(formatClock("17:30")).toBe("05:30pm");
  });

  it("keeps noon and midnight unambiguous", () => {
    expect(formatClock("00:00")).toBe("12:00am");
    expect(formatClock("00:45")).toBe("12:45am");
    expect(formatClock("12:00")).toBe("12:00pm");
    expect(formatClock("12:15")).toBe("12:15pm");
  });

  it("blanks what is not a time, for the composed lines", () => {
    expect(formatClock("")).toBe("");
    expect(formatClock("10am")).toBe("");
    expect(formatClock("25:00")).toBe("");
  });

  it("keeps text it cannot parse when the value is printed on its own", () => {
    expect(formatTime12h("10am")).toBe("10am");
    expect(formatTime12h("half day")).toBe("half day");
    expect(formatTime12h("")).toBe("");
    expect(formatTime12h("08:00")).toBe("08:00am");
  });
});
