import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { StatusIllustration } from "@/components/common/StatusIllustration";
import {
  OB_STATUS_META,
  type StatusBadgeVariant,
  type StatusTone,
} from "@/components/common/status-meta";
import { cn } from "@/lib/utils";
import { OB_HR_STATUS_LABELS, type ObHrStatus } from "@swiftslip/shared/hr";

export type { StatusBadgeVariant, StatusTone } from "@/components/common/status-meta";

/**
 * Text colours for the filled/tinted chips. `info`, `brand` and `danger` follow
 * the owner's table example: white on solid steel blue, dark brown on pale
 * amber, brick red on white — no faded tints.
 */
const TONE_TEXT: Record<StatusTone, string> = {
  neutral: "text-muted-foreground",
  info: "text-white",
  success: "text-dashboard-rule dark:text-emerald-300",
  complete: "text-emerald-900 dark:text-emerald-200",
  warning: "text-amber-700 dark:text-amber-300",
  danger: "text-[#8f2016] dark:text-[#f08a80]",
  primary: "text-primary",
  brand: "text-[#6b4100] dark:text-amber-200",
};

/**
 * Soft-chip surfaces, sampled from the owner's table example pixel by pixel:
 * info is a solid steel-blue block (no tint), brand a pale amber with a tan
 * border, danger an outline on white with a salmon border. `warning` has no
 * example row, so it takes the palette's solid amber (distinct from brand's
 * pale amber) instead of a faded tint — nothing here stays translucent.
 * `text-*` in a surface overrides `TONE_TEXT` (tailwind-merge keeps the last
 * one), which is how warning keeps its amber text in the `plain` variant.
 */
const TONE_SOFT: Record<StatusTone, string> = {
  neutral: "border-border bg-muted/80",
  info: "border-[#1d5fa6] bg-[#1d5fa6]",
  success: "border-dashboard-current bg-dashboard-soft",
  complete: "border-emerald-800/25 bg-emerald-800/10",
  warning: "border-[#a65e00] bg-[#a65e00] text-white dark:text-white",
  danger: "border-[#e6b8b2] bg-white",
  primary: "border-primary/25 bg-primary/10",
  brand: "border-[#e9c67d] bg-[#fbe6b8]",
};

/**
 * Filled chips use the owner's card-mock palette (sampled from the reference
 * mock: steel blue / dark amber / forest green) rather than the darker
 * Tailwind 800/900 shades, so the solid chips (including the OB list's folder
 * tabs) carry the same weight as the design. The card box itself is neutral
 * grey — see `CARD_BORDER` in `ObList.tsx`.
 */
const TONE_SOLID: Record<StatusTone, string> = {
  neutral: "border-slate-600 bg-slate-600 text-white",
  info: "border-[#1d5fa6] bg-[#1d5fa6] text-white",
  success: "border-success bg-success text-success-foreground",
  complete: "border-[#14583a] bg-[#14583a] text-white",
  warning: "border-amber-700 bg-amber-700 text-amber-50",
  danger: "border-destructive bg-destructive text-destructive-foreground",
  primary: "border-primary bg-primary text-primary-foreground",
  brand: "border-[#a65e00] bg-[#a65e00] text-white",
};

// Padding/scale matches the owner's example: a 30px-tall chip (12px text,
// py-2, 1px border) with ~14px horizontal padding around icon + label.
const VARIANTS: Record<StatusBadgeVariant, string> = {
  soft: "gap-2 rounded-md border px-3.5 py-2 text-xs font-semibold leading-none tracking-[0.01em] whitespace-nowrap",
  solid:
    "gap-2 rounded-md border px-3.5 py-2 text-xs font-semibold leading-none tracking-[0.01em] whitespace-nowrap shadow-sm",
  tab: "gap-1.5 rounded-t-lg border border-b-0 px-3 py-2 text-xs font-semibold leading-none tracking-[0.01em] whitespace-nowrap",
  plain: "gap-2 text-sm font-semibold",
  dot: "gap-2 text-sm font-semibold whitespace-nowrap",
};

/**
 * The dot in the `dot` variant, for statuses with no preset of their own (the
 * queue's derived Overdue). A preset status keeps using its own `dot` colour
 * from `status-meta`, so a status can never render two different dots.
 */
const DOT_BG: Record<StatusTone, string> = {
  neutral: "bg-muted-foreground",
  info: "bg-blue-500",
  success: "bg-success",
  complete: "bg-success",
  warning: "bg-amber-500",
  danger: "bg-destructive",
  primary: "bg-primary",
  brand: "bg-logo",
};

/**
 * Text colours beside that dot. `TONE_TEXT` is the base, except `info`: its
 * white exists for the solid steel-blue chip, which would be invisible on the
 * card here — the dot takes the same steel blue as its chip border instead.
 */
const DOT_TEXT: Record<StatusTone, string> = {
  ...TONE_TEXT,
  info: "text-[#1d5fa6] dark:text-sky-300",
};

const ICON_SIZE = {
  sm: "size-3.5",
  md: "size-4",
} as const;

/** Drawn status artwork occupies the same spot as a dot, at icon scale. */
const DOT_ART_SIZE = 20;

type StatusBadgeProps = {
  /** Visible label. Omit when `status` is supplied and the shared label is fine. */
  children?: ReactNode;
  /** Optional OB status preset. Supplies the label, tone, icon and surface. */
  status?: ObHrStatus;
  /** Semantic colour. Overrides the status preset. */
  tone?: StatusTone | undefined;
  /** `soft` is the tinted chip, `solid` the filled chip, `tab` the folder tab, `plain` a label, `dot` a dot + label. */
  variant?: StatusBadgeVariant | undefined;
  /** Any Lucide icon; overrides the status preset. */
  icon?: LucideIcon | undefined;
  /** Icon and type scale. Defaults to md. */
  size?: keyof typeof ICON_SIZE;
  className?: string | undefined;
};

/**
 * One status badge for the whole app. Pass an OB `status` to use the central
 * label/tone/icon/surface, or pass `children` + `tone` for any other status-like
 * chip. The HR queue, detail page, editor and employee list all render through it.
 */
export function StatusBadge({
  children,
  status,
  tone,
  variant,
  icon,
  size = "md",
  className,
}: StatusBadgeProps) {
  const preset = status ? OB_STATUS_META[status] : null;
  const Icon = icon ?? preset?.icon;
  const resolvedTone = tone ?? preset?.tone ?? "neutral";
  const resolvedVariant = variant ?? preset?.variant ?? "soft";
  const label = children ?? (status ? OB_HR_STATUS_LABELS[status] : null);
  // A preset may ask for a hollow ring instead of a filled dot (the HR queue's
  // pending "Waiting for Supervisor" mark). Only the `dot` variant draws one.
  // The ring class is merged last, so it can also shrink below the default
  // `size-2` dot and carry its own pulse — intentional, not a specificity bug.
  const dotClass =
    resolvedVariant === "dot" ? (preset?.dotRing ?? preset?.dot ?? DOT_BG[resolvedTone]) : null;
  // One place owns status artwork: any `dot` badge for these two statuses gets
  // the small illustration instead of a plain dot. Callers (HR queue, HR rail
  // card, employee status card) therefore cannot disagree about which statuses
  // have drawings. Everything else keeps its dot / pulsing hollow ring.
  // `compact` draws a square, animated icon centred on the label — the full
  // scenes are too tall to sit on a line of text at 20px.
  const dotArt =
    resolvedVariant === "dot" && (status === "submitted" || status === "departed") ? (
      <StatusIllustration status={status} size={DOT_ART_SIZE} decorative compact />
    ) : null;

  return (
    <span
      className={cn(
        "inline-flex items-center",
        VARIANTS[resolvedVariant],
        (resolvedVariant === "soft" || resolvedVariant === "plain") && TONE_TEXT[resolvedTone],
        resolvedVariant === "dot" && DOT_TEXT[resolvedTone],
        resolvedVariant === "soft" && TONE_SOFT[resolvedTone],
        (resolvedVariant === "solid" || resolvedVariant === "tab") && TONE_SOLID[resolvedTone],
        className,
      )}
    >
      {resolvedVariant === "dot" ? (
        (dotArt ?? (
          <span className={cn("size-2 shrink-0 rounded-full", dotClass)} aria-hidden="true" />
        ))
      ) : Icon ? (
        <Icon className={cn("shrink-0", ICON_SIZE[size])} aria-hidden="true" />
      ) : null}
      {label}
    </span>
  );
}
