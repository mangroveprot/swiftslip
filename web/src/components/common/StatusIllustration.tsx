import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { OB_HR_STATUS_LABELS, type ObHrStatus } from "@swiftslip/shared/hr";

/**
 * The two OB statuses that have a drawn illustration:
 *  - `submitted` = "Waiting for HR" → a clipboard being reviewed
 *  - `departed`  = "On OB"          → a hand lifting a briefcase
 *
 * The artwork is inline SVG (not `<img>`) so it inherits the app's theme
 * tokens: a reviewer who forces light mode on a dark OS still gets light ink.
 * All of the drawing's CSS lives in `styles.css` under the `si-` prefix,
 * the source SVGs' bare `.ln` / `.ac` / `.d` names would collide with each
 * other the moment both illustrations appear on one page.
 */
/** Anything a caller might pass; unmatched statuses simply render nothing. */
export type StatusIllustrationStatus = ObHrStatus | "overdue";

/**
 * On-screen stroke weight, in CSS px. The two drawings have very different
 * viewBox widths (60 vs 180), so a fixed user-unit stroke would make the
 * clipboard ~3× heavier than the briefcase, and both would get thinner every
 * time the icon shrank. Converting this constant into viewBox units per
 * instance keeps one delicate hairline at any size.
 */
const STROKE_PX = 1.35;

type ArtStyle = CSSProperties & { "--si-stroke": number };

/** Inline size plus that size-independent hairline, in the drawing's units. */
function artStyle(size: number, viewWidth: number, viewHeight: number): ArtStyle {
  return {
    width: size,
    height: (size * viewHeight) / viewWidth,
    "--si-stroke": (STROKE_PX * viewWidth) / size,
  };
}

/**
 * Both compact drawings share one square 60×60 grid and are laid out about its
 * centre (30, 30). That is what makes them sit on the label's optical centre:
 * squeezing the original tall scenes into 20px left the briefcase up near the
 * top of its box with the ground line stranded below.
 */
const COMPACT_BOX = 60;

export type StatusIllustrationProps = {
  /** Width in px (defaults to 20, icon-scale). Height follows the aspect ratio;
   *  the outline stays a 1.35px hairline no matter what size you pass. */
  size?: number | undefined;
  /** Layout utilities only (margin, responsive hiding). Ink comes from tokens. */
  className?: string | undefined;
  /**
   * Loop the draw-in animation. `false` leaves the finished drawing still,
   * for dense lists, print, or anywhere the motion would compete with text.
   * Applies to the compact icons too: they keep the same choreography, just
   * on a square grid with a gentler lift.
   */
  animated?: boolean | undefined;
  /** The art repeats a visible status label: hide it from assistive tech. */
  decorative?: boolean | undefined;
  /** Accessible name. Defaults to the status label, e.g. "Waiting for HR". */
  label?: string | undefined;
  /**
   * Icon-scale rendering: a square, animated drawing centred on the label.
   * On OB drops the tall "hand lifting a briefcase off the ground" scene and
   * draws just the briefcase and its handle, at 20px the lift frame otherwise
   * parks the bag up near the top of its box with the ground line stranded
   * below, which reads as an off-centre icon. The lift is replaced by a small
   * bob so the icon stays animated without leaving its square.
   */
  compact?: boolean | undefined;
};

type ArtSvgProps = {
  name: string;
  size: number;
  viewWidth: number;
  viewHeight: number;
  viewBox: string;
  compact: boolean;
  animated: boolean;
  decorative: boolean;
  variant: "si-wfhr" | "si-onob";
  className?: string | undefined;
  children: ReactNode;
};

/** Shared frame so both the full scene and the compact icon stay in sync. */
function ArtSvg({
  name,
  size,
  viewWidth,
  viewHeight,
  viewBox,
  compact,
  animated,
  decorative,
  variant,
  className,
  children,
}: ArtSvgProps) {
  return (
    <svg
      className={cn("si-art", variant, animated && "si-anim", compact && "si-compact", className)}
      style={artStyle(size, viewWidth, viewHeight)}
      viewBox={viewBox}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : name}
    >
      {decorative ? null : <title>{name}</title>}
      {children}
    </svg>
  );
}

/** Clipboard being reviewed, "Waiting for HR" (`submitted`). */
export function WaitingForHrIllustration({
  size = 20,
  animated = true,
  decorative = false,
  label,
  className,
  compact = false,
}: StatusIllustrationProps) {
  const frame = {
    name: label ?? OB_HR_STATUS_LABELS.submitted,
    size,
    compact,
    animated,
    decorative,
    className,
    variant: "si-wfhr" as const,
  };

  // Square, centred: board 8..52 and clip 13..47 both straddle (30,30). The
  // `si-wfhr-d*` classes reuse the large scene's exact 5s draw-in loop, so the
  // small icon is just as animated, transform origins are re-centred in CSS.
  if (compact) {
    return (
      <ArtSvg {...frame} viewWidth={COMPACT_BOX} viewHeight={COMPACT_BOX} viewBox="0 0 60 60">
        <g className="si-wfhr-clip">
          <path
            className="si-line si-draw si-wfhr-d1"
            pathLength={1}
            d="M23 14 H18 a5 5 0 0 0 -5 5 V47 a5 5 0 0 0 5 5 H42 a5 5 0 0 0 5 -5 V19 a5 5 0 0 0 -5 -5 H37"
          />
          <rect
            className="si-accent si-draw si-wfhr-d1"
            pathLength={1}
            x="23"
            y="8"
            width="14"
            height="10"
            rx="3"
          />
          <path className="si-line si-draw si-wfhr-d2" pathLength={1} d="M21 27 H39" />
          <path className="si-line si-draw si-wfhr-d3" pathLength={1} d="M21 34 H33" />
          <g className="si-wfhr-check">
            <path className="si-accent si-draw si-wfhr-d4" pathLength={1} d="M20 43 l4 4 l9 -9" />
          </g>
        </g>
      </ArtSvg>
    );
  }

  return (
    <ArtSvg {...frame} viewWidth={60} viewHeight={72} viewBox="0 0 60 72">
      <g className="si-wfhr-clip">
        <path
          className="si-line si-draw si-wfhr-d1"
          pathLength={1}
          d="M21 12 H16 a6 6 0 0 0 -6 6 V60 a6 6 0 0 0 6 6 H44 a6 6 0 0 0 6 -6 V18 a6 6 0 0 0 -6 -6 H39"
        />
        <rect
          className="si-accent si-draw si-wfhr-d1"
          pathLength={1}
          x="21"
          y="6"
          width="18"
          height="12"
          rx="4"
        />
        <path className="si-line si-draw si-wfhr-d2" pathLength={1} d="M19 29 H41" />
        <path className="si-line si-draw si-wfhr-d3" pathLength={1} d="M19 38 H33" />
        <g className="si-wfhr-check">
          <path className="si-accent si-draw si-wfhr-d4" pathLength={1} d="M20 51 l5 5 l11 -11" />
        </g>
      </g>
    </ArtSvg>
  );
}

/** Hand lifting a briefcase, "On OB" (`departed`). */
export function OnObIllustration({
  size = 20,
  animated = true,
  decorative = false,
  label,
  className,
  compact = false,
}: StatusIllustrationProps) {
  const frame = {
    name: label ?? OB_HR_STATUS_LABELS.departed,
    size,
    compact,
    animated,
    decorative,
    className,
    variant: "si-onob" as const,
  };

  // Square, centred: just the briefcase, no ground line and no lifting hand.
  // Body 23..51, handle 9..23, both straddling (30,30). `si-onob-draw` gives
  // the 6s draw-in loop; `si-compact-bag` is a ~5-unit bob instead of the full
  // scene's -78px lift, which would throw the bag out of this 60-unit box.
  if (compact) {
    return (
      <ArtSvg {...frame} viewWidth={COMPACT_BOX} viewHeight={COMPACT_BOX} viewBox="0 0 60 60">
        <g className="si-compact-bag">
          <rect
            className="si-accent si-draw si-onob-draw"
            pathLength={1}
            x="8"
            y="23"
            width="44"
            height="28"
            rx="5"
          />
          <path className="si-accent si-draw si-onob-draw" pathLength={1} d="M8 33 H26" />
          <path className="si-accent si-draw si-onob-draw" pathLength={1} d="M34 33 H52" />
          <rect
            className="si-line si-draw si-onob-draw"
            pathLength={1}
            x="26"
            y="29"
            width="8"
            height="8"
            rx="2"
          />
          <path
            className="si-accent si-draw si-onob-draw"
            pathLength={1}
            d="M20 23 V15 a6 6 0 0 1 6 -6 H34 a6 6 0 0 1 6 6 V23"
          />
        </g>
      </ArtSvg>
    );
  }

  return (
    <ArtSvg {...frame} viewWidth={180} viewHeight={230} viewBox="250 10 180 230">
      <path className="si-ground si-draw si-onob-draw" pathLength={1} d="M262 234 H418" />
      <g className="si-onob-bag">
        <rect
          className="si-accent si-draw si-onob-draw"
          pathLength={1}
          x="260"
          y="150"
          width="160"
          height="78"
          rx="10"
        />
        <path className="si-accent si-draw si-onob-draw" pathLength={1} d="M260 178 H332" />
        <path className="si-accent si-draw si-onob-draw" pathLength={1} d="M348 178 H420" />
        <rect
          className="si-line si-draw si-onob-draw"
          pathLength={1}
          x="332"
          y="168"
          width="16"
          height="20"
          rx="3"
        />
        <path
          className="si-accent si-draw si-onob-draw"
          pathLength={1}
          d="M290 150 V116 a12 12 0 0 1 12 -12 H314"
        />
        <path
          className="si-accent si-draw si-onob-draw"
          pathLength={1}
          d="M368 104 H378 a12 12 0 0 1 12 12 V150"
        />
      </g>
      <g className="si-onob-hand">
        <g transform="rotate(14 340 58)">
          <path className="si-line" d="M322 -200 V44 M358 -200 V44" />
          <rect className="si-accent" x="318" y="44" width="44" height="14" rx="3" />
        </g>
        <path className="si-line" d="M327 55 V68 C327 78 314 78 314 88" />
        <path className="si-line" d="M353 61 V68 C353 78 368 78 368 88" />
        <path className="si-line" d="M314 79 C303 78 297 86 299 94 C300 98 306 99 311 96" />
        <g className="si-onob-fing">
          <path
            className="si-line"
            d="M314 88 V106 a6.5 6.5 0 0 0 13 0 a6.5 6.5 0 0 0 13 0 a6.5 6.5 0 0 0 13 0 a6.5 6.5 0 0 0 13 0 V88"
          />
          <path className="si-line" d="M327 98 V106 M340 98 V106 M353 98 V106" />
        </g>
      </g>
    </ArtSvg>
  );
}

/**
 * The one entry point for the rest of the app: hand it any OB status and it
 * returns the matching illustration, or `null` for statuses with no artwork.
 * Callers never need to know which two statuses have drawings.
 */
export function StatusIllustration({
  status,
  ...props
}: StatusIllustrationProps & { status: StatusIllustrationStatus }) {
  if (status === "submitted") return <WaitingForHrIllustration {...props} />;
  if (status === "departed") return <OnObIllustration {...props} />;
  return null;
}
