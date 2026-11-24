import type { StorageBackendUsage } from "@swiftslip/shared/schemas";

import { cn } from "@/lib/utils";

/** Ring order, inner stroke to outer: what the space holds, then what is free. */
const SEGMENT_CLASS = {
  approval: "stroke-dashboard-accent",
  other: "stroke-dashboard-current",
  orphan: "stroke-logo",
  free: "stroke-muted",
} as const satisfies Record<"approval" | "other" | "orphan" | "free", string>;

/** Hairline between two arcs, in px, keeps same-coloured slices legible. */
const GAP = 1.5;

/**
 * The storage ring: one arc per slice of a backend's limit, approved slips,
 * other attachments, orphans and free, painted from the same numbers the
 * legend beside it reads, so ring and list can never disagree.
 *
 * Pure SVG, no chart library: it prints, scales and themes (the stroke classes
 * resolve to the palette tokens) for free. The centre label scales with the
 * ring, full "60% full" on the page's cards, a bare "1%" inside the smaller
 * cleanup-modal copies, and "less than 1%" while a few bytes are stored but the
 * percentage would round to zero.
 *
 * Every arc is its true share of the ring. They used to be lifted to a minimum
 * arc so that 1 % still showed a green dot; on a nearly empty backend the ring
 * then read as partly full while the centre said 1 % (or 0 %), so the slices
 * are honest now and the free space stays visibly free.
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
  /** The centre percent, off only when a caller wants the bare ring. */
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
  /** Something is stored, even if the percentage would round to zero. */
  const belowOne = usage.usedBytes > 0 && percent === 0;
  const percentText = belowOne ? "<1%" : `${percent}%`;

  /**
   * Slice lengths, true to scale, minus a hairline gap so neighbouring slices
   * stay legible. A backend whose usage rounds to 0 % paints no green at all:
   * a dot there read as "some of it is used" beside a "0 % full" label.
   */
  const rawLengths = parts.map((part) =>
    part.bytes > 0 && percent > 0 ? (part.bytes / total) * circumference : 0,
  );
  const usedLengths = rawLengths.slice(0, 3).map((length) => (length > GAP ? length - GAP : 0));
  const usedCount = usedLengths.filter((length) => length > 0).length;
  const usedTotal = usedLengths.reduce((sum, length) => sum + length, 0);

  // Free is whatever is left, including on an empty backend, where it is the
  // whole ring, so an empty backend paints a full grey track and no green.
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
        aria-label={`${usage.backend === "b2" ? "Backblaze B2" : "Supabase Storage"} is ${
          belowOne ? "less than 1" : percent
        }% full`}
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
            {percentText}
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
