import { describe, expect, it } from "vitest";

import { describeDevice } from "./device";

const CHROME_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

describe("describeDevice", () => {
  it("names the browser and the system a session came from", () => {
    expect(describeDevice(CHROME_WINDOWS)).toBe("Chrome on Windows");
  });

  it("keeps Edge apart from the Chrome it claims to be", () => {
    expect(
      describeDevice(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
      ),
    ).toBe("Edge on Windows");
  });

  it("knows an iPhone from the Mac it pretends to be", () => {
    expect(
      describeDevice(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("Safari on iPhone");
  });

  it("knows Android from the Linux it reports", () => {
    expect(describeDevice("Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/131.0.0.0")).toBe(
      "Chrome on Android",
    );
  });

  it("falls back to a plain label instead of guessing", () => {
    expect(describeDevice("")).toBe("Unknown device");
    expect(describeDevice("curl/8.7.1")).toBe("Unknown device");
  });
});
