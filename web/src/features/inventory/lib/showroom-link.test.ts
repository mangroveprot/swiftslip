import { describe, expect, it } from "vitest";

import type { ShowroomLinkOption } from "@swiftslip/shared/showrooms";
import {
  showroomInitials,
  showroomNameKey,
  showroomUpdateStatusTone,
  suggestShowroomLink,
} from "@swiftslip/shared/showrooms";

function option(overrides: Partial<ShowroomLinkOption> = {}): ShowroomLinkOption {
  return {
    update_id: 1,
    showroom_name: "Mun. of Polanco",
    location: "Obay, Polanco ZDN",
    status: "open",
    action_required: "Operational",
    map_url: null,
    linked_to: null,
    linked_to_id: null,
    ...overrides,
  };
}

describe("showroomNameKey", () => {
  it("drops the sheet's filler and folds accents", () => {
    expect(showroomNameKey("Mun. of Polanco")).toBe("polanco");
    expect(showroomNameKey("Polanco SR")).toBe("polanco");
    expect(showroomNameKey("Sergio Osmeña SR")).toBe("sergio osmena");
    expect(showroomNameKey("Dapitan warehouse (additional)")).toBe("dapitan");
  });
});

describe("showroomInitials", () => {
  it("uses the first two letters, like the board's letter tile", () => {
    expect(showroomInitials("Calamba SR")).toBe("Ca");
    expect(showroomInitials("Polanco SR")).toBe("Po");
    expect(showroomInitials("rizal")).toBe("Ri");
  });

  it("trims the name and handles an empty one", () => {
    expect(showroomInitials("  Roxas  ")).toBe("Ro");
    expect(showroomInitials("O")).toBe("O");
    expect(showroomInitials("   ")).toBe("");
  });
});

describe("showroomUpdateStatusTone", () => {
  it("gives Ready the Summary board's blue, separate from Open's green", () => {
    expect(showroomUpdateStatusTone("open")).toBe("good");
    expect(showroomUpdateStatusTone("ready")).toBe("info");
    expect(showroomUpdateStatusTone("in_progress")).toBe("progress");
    expect(showroomUpdateStatusTone("pending")).toBe("bad");
    expect(showroomUpdateStatusTone(null)).toBe("none");
  });
});

describe("suggestShowroomLink", () => {
  it("suggests the free row whose identifying words match", () => {
    expect(suggestShowroomLink("Polanco SR", [option()])?.update_id).toBe(1);
  });

  it("never suggests a row that already belongs to another showroom", () => {
    expect(
      suggestShowroomLink("Polanco SR", [option({ linked_to: "Calamba SR", linked_to_id: 2 })]),
    ).toBeNull();
  });

  it("does not suggest a different place", () => {
    expect(suggestShowroomLink("Rizal SR", [option()])).toBeNull();
  });

  it("returns nothing when the name has no identifying words", () => {
    expect(suggestShowroomLink("SR", [option()])).toBeNull();
  });
});
