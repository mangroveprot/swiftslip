import { describe, expect, it } from "vitest";

import { buildShowroomPhotoChanges } from "./showroom-photo-changes";

const draft = {
  ref: "InventoryMedia/staged/u/cctv.webp",
  thumbRef: "InventoryMedia/staged/u/cctv.thumb.webp",
  filename: "cctv.webp",
  byteSize: 2048,
};

describe("buildShowroomPhotoChanges", () => {
  it("sends nothing when no picture moved", () => {
    expect(buildShowroomPhotoChanges({}, new Set())).toBeUndefined();
  });

  it("sends a staged ref for the slot that changed only", () => {
    expect(buildShowroomPhotoChanges({ cctv: draft }, new Set())).toEqual({ cctv: draft });
  });

  it("sends null for a saved picture being removed", () => {
    expect(buildShowroomPhotoChanges({}, new Set(["showroom"]))).toEqual({
      showroom: null,
    });
  });

  it("keeps the three slots independent", () => {
    expect(buildShowroomPhotoChanges({ showroom: draft }, new Set(["acknowledge_form"]))).toEqual({
      showroom: draft,
      acknowledge_form: null,
    });
  });
});
