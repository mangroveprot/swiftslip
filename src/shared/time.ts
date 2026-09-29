/**
 * Formats a 24-hour "HH:MM" time string (as produced by <input type="time">)
 * into a friendly 12-hour clock, e.g. "13:30" -> "1:30 PM". Values that aren't
 * a valid HH:MM (including empty or legacy free text) are returned unchanged so
 * nothing is ever lost.
 */
export function formatTime12h(value: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return value;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return value;
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${period}`;
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
