import { cn } from "@/lib/utils";

/** The mascot file that ships in `public/` — one image for every AI surface. */
export const AI_MASCOT_SRC = "/regasco_ai_mascot.webp";

const SIZES = {
  xs: "size-4",
  sm: "size-6",
  md: "size-7",
  lg: "size-12",
  xl: "size-14",
} as const;

/**
 * The artwork already has a real alpha channel (the decorative circuit lines
 * and sparkles float on transparency), but they run off all four edges, so the
 * mascot itself only fills the middle ~70% of the frame. Each size therefore
 * zooms before the circular crop — without it the mascot shrinks into a disc
 * with stray line stubs at the rim.
 *
 * No background fill: the PNG is transparent, so any fill behind it paints a
 * visible square/circle of its own on top of the page. Callers that want a
 * badge supply their own surface.
 */
const ZOOM = {
  xs: "scale-[1.5]",
  sm: "scale-[1.45]",
  md: "scale-[1.4]",
  lg: "scale-[1.38]",
  xl: "scale-[1.35]",
} as const;

/**
 * The REGASCO AI mascot, used everywhere an AI used to be a bare `Sparkles`
 * glyph: the chat header, the avatar beside each assistant message, the typing
 * indicator, the floating launcher and the inline "Generate" buttons.
 *
 * `alt` is empty because every use is either decorative or already labelled by
 * adjacent text.
 */
export function AiMascot({
  size = "md",
  className,
  float = false,
}: {
  size?: keyof typeof SIZES;
  className?: string;
  /** Gentle idle bob, for the sizes big enough to notice it. */
  float?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        SIZES[size],
        float && "ai-mascot-float",
        className,
      )}
    >
      <img
        src={AI_MASCOT_SRC}
        alt=""
        aria-hidden="true"
        draggable={false}
        className={cn("size-full object-contain", ZOOM[size])}
      />
    </span>
  );
}
