import { describe, expect, it } from "vitest";

import {
  cosSubject,
  dtrSubject,
  formDeleteCopy,
  liqSubject,
  loaSubject,
  obSubject,
  otSubject,
} from "./form-delete-copy";

describe("formDeleteCopy", () => {
  it("asks for the same form the toast then confirms", () => {
    expect(formDeleteCopy("OB form dated 10/03/2026")).toEqual({
      title: "Delete the OB form dated 10/03/2026?",
      toast: "Deleted OB form dated 10/03/2026",
    });
  });
});

describe("obSubject", () => {
  it("names the date of the OB", () => {
    expect(formDeleteCopy(obSubject({ date_of_ob: "2026-10-03" })).toast).toBe(
      "Deleted OB form dated 10/03/2026",
    );
  });

  it("falls back to the bare form name while the date is blank", () => {
    expect(formDeleteCopy(obSubject({ date_of_ob: "" })).toast).toBe("Deleted OB form");
  });
});

describe("loaSubject", () => {
  it("names the inclusive dates", () => {
    expect(loaSubject({ date_from: "2026-10-01", date_to: "2026-10-03" })).toBe(
      "LOA form for 10/01/2026 - 10/03/2026",
    );
  });

  it("names a single day once when the leave starts and ends the same day", () => {
    expect(loaSubject({ date_from: "2026-10-01", date_to: "2026-10-01" })).toBe(
      "LOA form for 10/01/2026",
    );
  });

  it("names the start alone when the end is still blank", () => {
    expect(loaSubject({ date_from: "2026-10-01", date_to: null })).toBe("LOA form for 10/01/2026");
  });

  it("says until, not for, when only the end is typed", () => {
    expect(loaSubject({ date_from: null, date_to: "2026-10-03" })).toBe(
      "LOA form until 10/03/2026",
    );
  });

  it("falls back to the bare form name with no dates at all", () => {
    expect(loaSubject({ date_from: null, date_to: null })).toBe("LOA form");
  });
});

describe("cosSubject", () => {
  it("names the effectivity date", () => {
    expect(cosSubject({ effectivity_dates: ["2026-10-03"] })).toBe("COS form effective 10/03/2026");
  });

  it("lists several effectivity dates instead of claiming the days between them", () => {
    expect(cosSubject({ effectivity_dates: ["2026-10-09", "2026-10-03", "2026-10-05"] })).toBe(
      "COS form effective on 10/03/2026, 10/05/2026 and 10/09/2026",
    );
  });

  it("counts the rest past three dates", () => {
    expect(
      cosSubject({
        effectivity_dates: ["2026-10-09", "2026-10-03", "2026-10-05", "2026-10-07"],
      }),
    ).toBe("COS form effective on 10/03/2026, 10/05/2026 and 2 more dates");
  });

  it("falls back to the bare form name while no schedule row has a date", () => {
    expect(cosSubject({ effectivity_dates: [] })).toBe("COS form");
    expect(cosSubject({})).toBe("COS form");
  });
});

describe("otSubject", () => {
  it("names the date the overtime was worked", () => {
    expect(otSubject({ ot_dates: ["2026-10-03"] })).toBe("OT form for 10/03/2026");
  });

  it("lists two dates of work rather than a range across the days between", () => {
    expect(otSubject({ ot_dates: ["2026-10-09", "2026-10-03"] })).toBe(
      "OT form for 10/03/2026 and 10/09/2026",
    );
  });

  it("counts the rest past three dates", () => {
    expect(otSubject({ ot_dates: ["2026-10-09", "2026-10-03", "2026-10-05", "2026-10-07"] })).toBe(
      "OT form for 10/03/2026, 10/05/2026 and 2 more dates",
    );
  });

  it("falls back to the bare form name while no row has a date", () => {
    expect(otSubject({ ot_dates: [] })).toBe("OT form");
  });
});

describe("liqSubject", () => {
  it("names the date prepared", () => {
    expect(liqSubject({ date_prepared: "2026-10-03" })).toBe("liquidation report dated 10/03/2026");
  });

  it("falls back to the bare report name while the date is blank", () => {
    expect(liqSubject({ date_prepared: "" })).toBe("liquidation report");
  });
});

describe("dtrSubject", () => {
  it("names the days a first-half cut-off covers", () => {
    expect(dtrSubject({ month: 11, year: 2026, period: "first_half" })).toBe(
      "DTR for 11/01/2026 - 11/15/2026",
    );
  });

  it("names the days a second-half cut-off covers", () => {
    expect(dtrSubject({ month: 11, year: 2026, period: "second_half" })).toBe(
      "DTR for 11/16/2026 - 11/30/2026",
    );
  });

  it("names a whole month as its first and last day", () => {
    expect(dtrSubject({ month: 2, year: 2028, period: "full" })).toBe(
      "DTR for 02/01/2028 - 02/29/2028",
    );
  });

  it("names a typed custom range", () => {
    expect(dtrSubject({ month: 11, year: 2026, period: "custom:4-9" })).toBe(
      "DTR for 11/04/2026 - 11/09/2026",
    );
  });

  it("ends a span cut-off in the following month", () => {
    expect(dtrSubject({ month: 9, year: 2026, period: "span:25-8" })).toBe(
      "DTR for 09/25/2026 - 10/08/2026",
    );
  });

  it("never prints a day the month does not have", () => {
    // `span:` keeps its day numbers when the month is switched, so 31 lands in
    // a 30-day month.
    expect(dtrSubject({ month: 11, year: 2026, period: "span:31-5" })).toBe(
      "DTR for 11/30/2026 - 12/05/2026",
    );
  });

  it("falls back to the bare record name when the month is missing", () => {
    expect(dtrSubject({ month: 0, year: 2026, period: "first_half" })).toBe("DTR");
  });
});
