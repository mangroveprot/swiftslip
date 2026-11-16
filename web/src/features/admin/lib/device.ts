/**
 * A short label for a stored user agent, enough to recognize a device in the
 * admin panel ("Chrome on Windows", "Safari on iPhone"). Deliberately small: a
 * handful of well-known tokens and a plain fallback, no fingerprinting.
 */

const BROWSERS: ReadonlyArray<readonly [RegExp, string]> = [
  // Edge and Opera both claim "Chrome", so they come first.
  [/Edg\//, "Edge"],
  [/OPR\/|Opera\//, "Opera"],
  [/Firefox\//, "Firefox"],
  // Chrome on iOS is CriOS, and every Chrome UA also says "Safari".
  [/CriOS\//, "Chrome"],
  [/Chrome\//, "Chrome"],
  [/Safari\//, "Safari"],
];

const SYSTEMS: ReadonlyArray<readonly [RegExp, string]> = [
  // Android and iPhone UAs also contain "Linux" and "Mac OS X".
  [/Android/, "Android"],
  [/iPhone|iPad|iPod/, "iPhone"],
  [/Windows NT 10\.0/, "Windows"],
  [/Windows/, "Windows"],
  [/Mac OS X/, "Mac"],
  [/CrOS/, "Chromebook"],
  [/Linux/, "Linux"],
];

export function describeDevice(userAgent: string): string {
  const ua = userAgent.trim();
  if (!ua) return "Unknown device";

  const browser = BROWSERS.find(([pattern]) => pattern.test(ua))?.[1];
  const system = SYSTEMS.find(([pattern]) => pattern.test(ua))?.[1];

  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system ?? "Unknown device";
}
