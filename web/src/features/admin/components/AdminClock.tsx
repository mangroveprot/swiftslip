import { useEffect, useState } from "react";

import { formatDate, formatTime } from "@swiftslip/shared/time";

/**
 * Ticking date + time for an admin section header.
 *
 * It lives in its own component so the once-a-second state update re-renders
 * only the clock, never the panels beside it. `null` until mount because the
 * value is local time — rendering it during the first paint would hydrate
 * against a different string.
 */
export function AdminClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="shrink-0 text-right">
      <p className="font-mono text-2xl font-semibold tabular-nums" title={now?.toLocaleString()}>
        {now ? formatTime(now) : "--:-- --"}
      </p>
      <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
        {now ? formatDate(now) : "Today"}
      </p>
    </div>
  );
}
