import { PROFILE_PHOTO_DATA_URL_MAX, PROFILE_PHOTO_MAX_BYTES } from "@swiftslip/shared/schemas";
import { describe, expect, it } from "vitest";

import { isAnimatedGif, MAX_PHOTO_BYTES, cropStyle, IDENTITY_CROP, toCrop } from "./photo";

// `isAnimatedGif` only looks at the MIME type, so the test needs nothing more
// than a File-shaped object (the suite runs in the node environment).
const fileOf = (type: string) => ({ type }) as File;

describe("isAnimatedGif", () => {
  it("lets a GIF bypass the cropper so it keeps moving", () => {
    expect(isAnimatedGif(fileOf("image/gif"))).toBe(true);
  });

  it("sends stills through the cropper as before", () => {
    expect(isAnimatedGif(fileOf("image/png"))).toBe(false);
    expect(isAnimatedGif(fileOf("image/jpeg"))).toBe(false);
    expect(isAnimatedGif(fileOf("image/webp"))).toBe(false);
    expect(isAnimatedGif(fileOf(""))).toBe(false);
  });
});

describe("the profile photo limit", () => {
  it("is the same number in the browser and in the schema", () => {
    expect(MAX_PHOTO_BYTES).toBe(PROFILE_PHOTO_MAX_BYTES);
  });

  it("lets a file at the byte limit through the schema's string cap", () => {
    // A `data:` URL is the bytes in base64 — four characters per three bytes,
    // padded — plus its `data:image/gif;base64,` prefix.
    const base64Chars = Math.ceil(PROFILE_PHOTO_MAX_BYTES / 3) * 4;
    const prefixChars = "data:image/gif;base64,".length;
    expect(base64Chars + prefixChars).toBeLessThanOrEqual(PROFILE_PHOTO_DATA_URL_MAX);
  });
});

describe("GIF framing", () => {
  it("turns a preview-space offset into a crop that does not depend on size", () => {
    const at240 = toCrop(240, 2, { x: 24, y: -12 });
    const at96 = toCrop(96, 2, { x: 9.6, y: -4.8 });
    expect(at240).toEqual({ zoom: 2, x: 0.1, y: -0.05 });
    expect(at96.x).toBeCloseTo(at240.x, 10);
    expect(at96.y).toBeCloseTo(at240.y, 10);
  });

  it("draws that crop with one CSS transform", () => {
    expect(cropStyle({ zoom: 2, x: 0.1, y: -0.05 })).toEqual({
      transform: "translate(10%, -5%) scale(2)",
    });
  });

  it("adds nothing for a centred photo", () => {
    expect(cropStyle(IDENTITY_CROP)).toBeUndefined();
    expect(cropStyle(undefined)).toBeUndefined();
  });
});
