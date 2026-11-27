/**
 * Santa's sleigh from the owner's artwork, gliding along the Christmas garland.
 *
 * The drawing is fixed-size and slides from just off the left edge to just past
 * the right one, then starts again (`.xmas-sleigh` in `styles.css`). It sits in
 * the garland's own clipped band, so it enters and leaves with the string rather
 * than the viewport, and it is mounted behind the bulbs: the wire and the glass
 * pass in front of it, the way a decoration hung on the string would.
 *
 * The mascot watches the pointer. `usePointerGaze` maps the cursor into the
 * drawing's user space, so the eyes keep working while the whole sleigh is
 * moving and however the garland is stretched. The artwork draws the iris up and
 * to the right of the eye's centre, so each target carries that resting offset
 * back: the gaze is a delta around the middle of the white, not from a corner.
 *
 * Decorative: the parent strip is already `aria-hidden` and pointer-transparent,
 * and the drawing is too. Reduced motion parks the sleigh mid-string and stops
 * the gallop as well, which is SMIL and cannot be reached from CSS.
 */
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import { usePointerGaze } from "@/lib/use-pointer-gaze";
import { SleighArtwork } from "./SleighArtwork";

/** Eye centres in the artwork's own coordinates, plus the iris's resting offset. */
const LEFT_EYE = { cx: 76.5, cy: -39, base: { x: -1.8, y: 3 } };
const RIGHT_EYE = { cx: 96.5, cy: -39, base: { x: -1.8, y: 3 } };

export function SleighRide({ className }: { className?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const leftPupil = useRef<SVGGElement>(null);
  const rightPupil = useRef<SVGGElement>(null);

  usePointerGaze(
    [
      { ref: leftPupil, ...LEFT_EYE },
      { ref: rightPupil, ...RIGHT_EYE },
    ],
    { maxOffset: 3.6 },
  );

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => (media.matches ? svg.pauseAnimations() : svg.unpauseAnimations());
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  return (
    <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0", className)}>
      <svg
        ref={svgRef}
        viewBox="138 124 520 130"
        fill="none"
        // 4:1, so the drawing keeps its proportions at either size. The viewBox
        // is cropped to the drawing's own ink: the height is what fits, with the
        // runners a couple of pixels above the band's bottom edge and the antlers
        // just below its top.
        className="xmas-sleigh absolute top-0 left-0 h-[46px] w-[184px] sm:h-[62px] sm:w-[248px]"
      >
        <SleighArtwork leftPupil={leftPupil} rightPupil={rightPupil} />
      </svg>
    </div>
  );
}
