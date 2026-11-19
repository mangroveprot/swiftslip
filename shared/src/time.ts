/**
 * The one clock format every form prints on its sheet.
 *
 * `"08:00" → "08:00am"`, `"17:30" → "05:30pm"`. Minutes are ALWAYS shown and
 * the hour is always two digits, so the printed columns line up; noon and
 * midnight stay unambiguous (`"12:00pm"` / `"12:00am"`); the suffix is
 * lowercase to match the templates' own type.
 *
 * Why minutes always: the time pickers above these forms read `08:00 AM`, and a
 * sheet that printed `08am` meant the same thing but read as a different value.
 * EVERY form goes through here — COS schedule, OT hours, OB exit clearance and
 * the HR rows that mirror them. A per-form copy of this rule is exactly what
 * drifted before, so there is one implementation and no local variants.
 */
function clockParts(value: string): { hour: string; minute: string; suffix: "am" | "pm" } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((value ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const minute = Number(m[2]);
  if (!Number.isFinite(h) || h > 23 || minute > 59) return null;
  return {
    hour: String(h % 12 === 0 ? 12 : h % 12).padStart(2, "0"),
    minute: String(minute).padStart(2, "0"),
    suffix: h < 12 ? "am" : "pm",
  };
}

/**
 * A sheet clock, or `""` when the value is not a time. This is the strict half:
 * the composed lines (COS schedule, OT hours) build their text from it, so a
 * blank end must stay blank rather than print whatever was typed.
 */
export function formatClock(value: string): string {
  const parts = clockParts(value);
  return parts ? `${parts.hour}:${parts.minute}${parts.suffix}` : "";
}

/**
 * The same clock, but text that is not an HH:MM is returned unchanged rather
 * than blanked — OB rows stored before the time pickers can hold free text
 * (`"10am"`, `"half day"`), and the preview must never lose what was typed.
 */
export function formatTime12h(value: string): string {
  const parts = clockParts(value);
  return parts ? `${parts.hour}:${parts.minute}${parts.suffix}` : value;
}

/**
 * Formats a Date as a header clock down to the minute on a 12-hour clock,
 * e.g. "02:32 PM". Minutes are the finest unit shown, so neither seconds nor
 * milliseconds ever appear.
 */
export function formatTime(date: Date = new Date()): string {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Formats a Date as a short calendar day, e.g. "Oct 14, 2026".
 */
export function formatDate(date: Date = new Date()): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Formats a Date as a short calendar day plus the clock, e.g.
 * "Nov 3, 2026, 2:32 PM". Used where a timestamp is read on its own (the
 * roster's Last login column) rather than compared with "now".
 */
export function formatDateTime(date: Date = new Date()): string {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Formats an ISO timestamp as a short relative string, Twitter/Slack-style:
 * "Just now", "5m ago", "3h ago", "6d ago", then falls back to a plain date
 * once it's far enough in the past that "ago" stops being useful.
 */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  const diffMs = now.getTime() - then;
  const diffSec = Math.round(diffMs / 1000);

  if (diffSec < 5) return "Just now";
  if (diffSec < 60) return `${diffSec}s ago`;

  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;

  const diffDay = Math.round(diffHour / 24);
  if (diffDay < 7) return `${diffDay}d ago`;

  const then_ = new Date(iso);
  const sameYear = then_.getFullYear() === now.getFullYear();
  return then_.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}
