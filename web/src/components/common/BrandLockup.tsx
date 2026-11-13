import { APP } from "@/config/app";
import { cn } from "@/lib/utils";

/**
 * The Regasco-style SwiftSlip lockup, the Regasco mascot beside the app name
 * set in Montserrat 800 with the brand-orange rule underneath (see
 * `.regasco-word` in `styles.css`).
 *
 * ONE component so the sign-in card, the app-chooser header and every sidebar
 * render the exact same mark instead of three hand-copied variants. It always
 * uses the Regasco artwork, regardless of the signed-in employee's employer.
 */
export function BrandLockup({
  className,
  imageClassName,
  wordClassName,
  wordAs: Word = "span",
}: {
  /** Wrapper overrides (spacing, alignment). */
  className?: string;
  /** Mascot size overrides, defaults to `h-11`. */
  imageClassName?: string;
  /** Word size overrides, defaults to `text-[1.75rem]`. */
  wordClassName?: string;
  /** Element for the app name, `h1` on the sign-in page, `span` elsewhere. */
  wordAs?: "span" | "h1";
}) {
  return (
    <span className={cn("flex items-center gap-3", className)}>
      <img
        src={APP.regascoMascotPath}
        alt="Regasco"
        className={cn("h-11 w-auto shrink-0 object-contain", imageClassName)}
      />
      <Word className={cn("regasco-word text-[1.75rem]", wordClassName)}>
        {APP.name}
        <span className="regasco-word__bar" aria-hidden="true" />
      </Word>
    </span>
  );
}
