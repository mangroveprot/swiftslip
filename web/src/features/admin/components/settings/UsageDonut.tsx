import type { StorageBackendUsage } from "@swiftslip/shared/schemas";

import { cn } from "@/lib/utils";

/** Ring order, inner stroke to outer: what the space holds, then what is free. */
const SEGMENT_CLASS = {
  approval: "stroke-dashboard-accent",
  other: "stroke-dashboard-current",
  orphan: "stroke-logo",
  free: "stroke-muted",
} as const satisfies Record<"approval" | "other" | "orphan" | "free", string>;

/** Hairline between two arcs, in px — keeps same-coloured slices legible. */
const GAP = 1.5;

/**
 * The storage ring: one arc per slice of a backend's limit — approved slips,
 * other attachments, orphans and free — painted from the same numbers the
 * legend beside it reads, so ring and list can never disagree.
 *
 * Pure SVG, no chart library: it prints, scales and themes (the stroke classes
 * resolve to the palette tokens) for free. The centre label scales with the
 * ring — full "60% full" on the page's cards, a bare "1%" inside the smaller
 * cleanup-modal copies, so a nearly-empty ring still says its number. Every
 * non-zero slice also keeps a visible minimum arc, so the ring shows green the
 * moment anything is stored instead of reading as empty at 1 %.
 */
export function UsageDonut({
  usage,
  size = 116,
  showLabel = true,
  className,
}: {
  usage: StorageBackendUsage;
  /** Outer diameter in px; the stroke follows it so the ring keeps its weight. */
  size?: number;
  /** The centre percent — off only when a caller wants the bare ring. */
  showLabel?: boolean;
  className?: string;
}) {
  const stroke = Math.max(5, Math.round(size * 0.12));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  /** Below ~90px the ring is too tight for "full" under the number. */
  const compact = size < 90;

  const parts = [
    { key: "approval" as const, bytes: Math.max(0, usage.approvalBytes) },
    { key: "other" as const, bytes: Math.max(0, usage.otherBytes) },
    { key: "orphan" as const, bytes: Math.max(0, usage.orphanBytes) },
    { key: "free" as const, bytes: Math.max(0, usage.freeBytes) },
  ];
  const total = parts.reduce((sum, part) => sum + part.bytes, 0) || 1;

  const percent =
    usage.limitBytes > 0
      ? Math.min(100, Math.round((usage.usedBytes / usage.limitBytes) * 100))
      : 0;

  /**
   * A slice of 1 % on a 72 px ring is barely 2 px long, and the hairline gap
   * eats what is left — the ring read as empty grey beside a "1 % full" label.
   * So every non-zero slice is lifted to a floor of 0.6 stroke-widths (about a
   * green dot you can actually see), and "free" absorbs the difference, which
   * keeps the ring closing exactly on the circumference.
   */
  const minArc = Math.max(3, stroke * 0.6);
  const rawLengths = parts.map((part) =>
    part.bytes > 0 ? (part.bytes / total) * circumference : 0,
  );
  let usedLengths = rawLengths
    .slice(0, 3)
    .map((length) => (length > 0 ? Math.max(minArc, length - GAP) : 0));
  const usedCount = usedLengths.filter((length) => length > 0).length;
  let usedTotal = usedLengths.reduce((sum, length) => sum + length, 0);

  // Nearly full: the floors would overflow the ring, so scale the used arcs
  // back into the room left once their gaps are paid for.
  const usedBudget = Math.max(0, circumference - usedCount * GAP);
  if (usedTotal > usedBudget) {
    const scale = usedBudget / usedTotal;
    usedLengths = usedLengths.map((length) => length * scale);
    usedTotal = usedBudget;
  }

  // Free is whatever is left — including on an empty backend, where it is the
  // whole ring, so 0 % still paints a full grey track and no green at all.
  const freeLength = Math.max(0, circumference - usedTotal - usedCount * GAP);
  const lengths = [...usedLengths, freeLength];

  // Walking the ring: each arc starts where the last one ended, plus its gap.
  let drawn = 0;
  const arcs = parts.map((part, index) => {
    const length = lengths[index] ?? 0;
    const offset = -drawn;
    if (length > 0) drawn += length + GAP;
    return { part, length, offset };
  });

  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${usage.backend === "b2" ? "Backblaze B2" : "Supabase Storage"} is ${percent}% full`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-muted"
        />
        {arcs.map(({ part, length, offset }) =>
          length <= 0 ? null : (
            <circle
              key={part.key}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              strokeWidth={stroke}
              className={SEGMENT_CLASS[part.key]}
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          ),
        )}
      </svg>

      {showLabel ? (
        <div className="absolute inset-0 grid place-content-center text-center">
          <span
            className={cn(
              "font-bold leading-none tabular-nums",
              compact ? "text-[11px]" : "text-xl",
            )}
          >
            {percent}%
          </span>
          {compact ? null : (
            <span className="mt-1 text-[10px] leading-none font-medium text-muted-foreground">
              full
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}
