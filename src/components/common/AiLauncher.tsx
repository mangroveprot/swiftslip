import { useEffect, useState } from "react";

import { AiMascot } from "./AiMascot";
import { cn } from "@/lib/utils";

/** How long each rotating hint sits on screen. */
const HINT_INTERVAL = 3600;

/** The beat after mount before the bubble first appears, so it doesn't fight
    the page settling. */
const FIRST_HINT_DELAY = 1200;

/**
 * The floating launcher for a form's AI assistant: the mascot inside a pulsing
 * circle, with a speech bubble beside it that pops in with a nudge ("How can I
 * help?") and then rotates through a couple more, tailored to what that
 * assistant can actually do for that form.
 *
 * The bubble is `aria-hidden` — it is a decorative pointer at a button that
 * already carries its own label and title. It also retreats whenever the chat
 * window is open, so it never sits over the transcript, and it is not rendered
 * below `min-[26rem]`, where there is no room for it beside the mascot.
 *
 * The motion is the `.ai-*` keyframes in `styles.css`: a bubble that springs
 * out of the mascot's corner, a rocking mascot, a breathing halo and a
 * cross-fading hint swap. All of them are disabled under
 * `prefers-reduced-motion`.
 */
export function AiLauncher({
  open,
  onToggle,
  label,
  openLabel,
  hint,
}: {
  /** Whether the chat window is currently open. */
  open: boolean;
  onToggle: () => void;
  /** Accessible name, e.g. "Chat with the OT assistant". */
  label: string;
  /** Accessible name while the window is open. */
  openLabel: string;
  /** Rotating nudge text, most useful first. A module-level constant. */
  hint: readonly string[];
}) {
  const [tip, setTip] = useState(0);
  // Mounted only once the bubble is due, so it never occupies layout (and so
  // the gap above the launcher disappears the moment the chat opens) rather
  // than sitting there invisible.
  const [live, setLive] = useState(false);
  const [shown, setShown] = useState(false);

  // Closed: wait a beat, mount the bubble, show it, then rotate the hint.
  // Open: unmount it entirely.
  useEffect(() => {
    if (open || hint.length === 0) {
      setLive(false);
      setShown(false);
      return;
    }
    const appear = window.setTimeout(() => {
      setLive(true);
      // Next frame, so the pop animation has a "before" state to start from.
      requestAnimationFrame(() => setShown(true));
    }, FIRST_HINT_DELAY);
    const rotate = window.setInterval(() => setTip((i) => (i + 1) % hint.length), HINT_INTERVAL);
    return () => {
      clearTimeout(appear);
      clearInterval(rotate);
    };
    // `hint` is a module-level constant in each caller, so the length is a
    // stable dependency — depending on the array itself would re-run this on
    // every render.
  }, [open, hint.length]);

  return (
    <div className="flex flex-col items-end gap-2">
      {/* Below `min-[26rem]` there is no room for a bubble beside a 3.5rem
          mascot, so it is dropped there rather than allowed to overflow. */}
      {live && !open ? (
        <div aria-hidden="true" className="hidden min-[26rem]:block">
          {/* Sharp-cornered white bubble, matching the reference balloon: crisp corners
              and a clean pointed tail. White fill means the tail is white too,
              so the two fuse into one silhouette and a border is never needed
              (a 1px line cannot survive the tail join anyway — it has nowhere
              to go round the corner). `shadow-lg` is what lifts it off the
              page, since a white shape on warm paper needs separation more
              than it needs a fill. */}
          <div
            className={cn(
              "relative rounded-[3px] bg-card px-3.5 py-2 text-xs font-medium leading-snug text-foreground shadow-lg",
              shown ? "ai-bubble-pop" : "ai-bubble-vanish",
            )}
          >
            {/* `key` remounts the span so the fade replays on every swap. */}
            <span key={tip} className="ai-hint-fade block">
              {hint[tip]}
            </span>
            {/* Tail: a CSS triangle (two transparent borders + one coloured)
                rather than a rotated square — a square leaves a blunt 90°
                point, this gives a true sharp tip. Same fill, tucked up so the
                join with the bubble's bottom edge is seamless.

                A downward-pointing triangle needs a *top* border in the colour
                and both side borders transparent. The side widths must be
                declared explicitly too: an omitted border-width falls back to
                `medium` with `currentColor`, which paints a stray sliver.
                `border-t-card` matches the bubble's fill, not `bg-card` —
                border colours come from the palette, not the background. */}
            <span className="ai-tail-pop absolute -bottom-[6px] right-5 size-0 border-t-[8px] border-t-card border-l-[8px] border-r-[8px] border-l-transparent border-r-transparent" />
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={onToggle}
        aria-label={open ? openLabel : label}
        aria-expanded={open}
        title={open ? "Hide the assistant" : `${label} — fill this form by chatting`}
        className="relative flex size-14 items-center justify-center rounded-full bg-linear-to-br from-regasco-light via-regasco to-regasco-deep ring-2 ring-white/80 transition-transform duration-200 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-regasco active:scale-95 [filter:drop-shadow(0_10px_12px_rgb(0_0_0_/_0.18))]"
      >
        {/* Breathing halo — decoration, sits under the mascot. Wide enough to
            read past the orange badge on a pale page. Only while closed; once
            the window is open the tail below does the pointing instead. */}
        <span
          aria-hidden="true"
          className={cn(
            "absolute -inset-1.5 rounded-full bg-regasco/40",
            open && "hidden",
            !open && "ai-halo-pulse",
          )}
        />
        {/* The mascot stays put in both states — swapping it for a chevron
            made the button stop looking like the assistant while it was the
            one thing actually open. */}
        <AiMascot size="xl" float className="relative" />
        {/* Green "available" dot, matching the header's Online status. */}
        <span
          aria-hidden="true"
          className="absolute bottom-0.5 right-0.5 size-3 rounded-full border-2 border-white bg-emerald-400"
        />
        {/* While open, a tail on TOP of the badge pointing UP at the chat window
            above it, so the two read as one connected shape.

            An *upward* triangle puts the coloured edge on the BOTTOM border
            (a downward one uses the top). Side borders stay transparent, and
            all three widths must be declared or the omitted one falls back to
            `medium` with `currentColor`. */}
        {open ? (
          <span
            aria-hidden="true"
            className="ai-tail-pop absolute -top-[6px] right-5 size-0 border-b-[8px] border-b-card border-l-[8px] border-r-[8px] border-l-transparent border-r-transparent [filter:drop-shadow(0_1px_1px_rgb(0_0_0_/_0.35))]"
          />
        ) : null}
      </button>
    </div>
  );
}
