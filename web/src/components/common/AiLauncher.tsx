import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { AiMascot } from "./AiMascot";
import { cn } from "@/lib/utils";

/** How long each rotating hint sits on screen. */
const HINT_INTERVAL = 3600;

/** The beat after mount before the bubble first appears, so it doesn't fight
    the page settling. */
const FIRST_HINT_DELAY = 1200;

/** Whether the nudge was closed during this page load. It is a plain in-memory
    flag on purpose: nothing is written to the browser, so the hints are back on
    the very next reload, on every screen size. The earlier version saved a
    timestamp in localStorage, and one press of the X then silenced the bubble
    on every form — including on a phone, where it looked like the hints simply
    did not exist. A dismissal now only lasts while that page stays open. */
let dismissedForPageLoad = false;

/**
 * The floating launcher for a form's AI assistant: the mascot inside a pulsing
 * circle, with a speech bubble beside it that pops in with a nudge ("How can I
 * help?") and then rotates through a couple more, tailored to what that
 * assistant can actually do for that form.
 *
 * The bubble carries its own close button: closing it hides the nudge for the
 * rest of this page load, and a reload brings it back. Nothing is written to the
 * browser, so it can never go permanently silent. The mascot button keeps its
 * label and title meanwhile, so nothing is lost. It also retreats whenever the
 * chat window is open, so it never sits over the transcript, and it is
 * width-capped to the screen instead of being dropped on narrow ones, so a
 * phone shows the nudge too.
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
  // Seeded from the page-load flag, so closing it on one form also keeps it
  // quiet on the next form until the page is reloaded.
  const [dismissed, setDismissed] = useState(dismissedForPageLoad);

  function dismissHints() {
    dismissedForPageLoad = true;
    setDismissed(true);
    setShown(false);
    window.setTimeout(() => setLive(false), 180);
  }

  // Closed: wait a beat, mount the bubble, show it, then rotate the hint.
  // Open: unmount it entirely.
  useEffect(() => {
    if (open || dismissed || hint.length === 0) {
      setLive(false);
      setShown(false);
      return;
    }
    // `live` and `shown` go true together: the bubble then mounts already
    // carrying `ai-bubble-pop`, and the animation plays from its own `from`
    // state. The old two-step dance needed a `requestAnimationFrame` between
    // the two, and a frame that never arrives (a background tab) left the
    // bubble mounted at the vanish animation's final opacity of 0 — invisible,
    // on every form, with nothing on screen to explain why.
    const appear = window.setTimeout(() => {
      setLive(true);
      setShown(true);
    }, FIRST_HINT_DELAY);
    const rotate = window.setInterval(() => setTip((i) => (i + 1) % hint.length), HINT_INTERVAL);
    return () => {
      clearTimeout(appear);
      clearInterval(rotate);
    };
    // `hint` is a module-level constant in each caller, so the length is a
    // stable dependency — depending on the array itself would re-run this on
    // every render.
  }, [open, dismissed, hint.length]);

  return (
    <div className="flex flex-col items-end gap-2">
      {/* Shown at every width. It used to be hidden below `min-[26rem]`, which
          left a phone with the mascot and no words at all. The width is capped
          to the viewport instead, so a narrow screen wraps the hint onto a few
          lines rather than letting it spill off the left edge. */}
      {live && !open && !dismissed ? (
        <div className="max-w-[calc(100vw_-_2rem)]">
          {/* The nudge follows the theme: a light card on the light theme and a
              dark one on the dark theme. A hairline border (not just a shadow)
              keeps it separate from the white sheet behind it, so it reads as
              the assistant talking rather than as part of the form. Soft rounded
              corners and a small rounded tail, filled with the same colour as
              the bubble, so the two fuse into one silhouette. */}
          <div
            className={cn(
              "relative max-w-full rounded-xl border border-border bg-card py-2 pl-3.5 pr-8 text-xs font-medium leading-snug text-foreground shadow-lg",
              shown ? "ai-bubble-pop" : "ai-bubble-vanish",
            )}
          >
            {/* `key` remounts the span so the fade replays on every swap. */}
            <span key={tip} className="ai-hint-fade block">
              {hint[tip]}
            </span>
            {/* Closes the nudge for this page load. A real button, so it takes
                focus and carries a name of its own. */}
            <button
              type="button"
              onClick={dismissHints}
              aria-label="Hide these hints"
              title="Hide these hints"
              className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground/40"
            >
              <X className="size-3" aria-hidden="true" />
            </button>
            {/* Tail: a small rounded square turned 45° and tucked under the
                bottom edge, so the point where it meets the bubble is a soft
                diagonal instead of a hairline join. Same fill as the bubble,
                so the two read as one silhouette. Matches the rounded arrow in
                the reference. */}
            <span
              aria-hidden="true"
              className="ai-tail-pop absolute -bottom-1 right-5 size-3 rotate-45 rounded-[3px] border-b border-r border-border bg-card"
            />
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={onToggle}
        aria-label={open ? openLabel : label}
        aria-expanded={open}
        title={open ? "Hide the assistant" : `${label}: fill this form by chatting`}
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
