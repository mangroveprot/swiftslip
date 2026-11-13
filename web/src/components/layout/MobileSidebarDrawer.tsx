import { X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

/** Matches the `duration-300` on the panel and backdrop below. */
const SLIDE_MS = 300;

/**
 * Mobile navigation drawer.
 *
 * On phones the portal and the Admin Panel used to drop the nav in as a
 * full-width block under the header, which read like a second top bar. The
 * drawer slides the real sidebar in from the LEFT edge (the same edge the
 * desktop rail sits on) over a dimmed backdrop and gives it its own close
 * button, so the opened menu looks like the desktop sidebar rather than a bar.
 *
 * The panel and backdrop animate with CSS transitions driven by `shown`, so
 * opening glides in and closing glides back out (the wrapper stays mounted for
 * the length of the exit). `motion-reduce:transition-none` keeps the jump
 * instant for anyone who asked the OS for less motion.
 *
 * The trigger is the header's sidebar button. Desktop never sees the drawer:
 * both the panel and the backdrop are `md:hidden`, and the persistent left rail
 * takes over from `md` up.
 */
export function MobileSidebarDrawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  // `mounted` keeps the drawer in the tree while it slides out; `shown` is the
  // transform/opacity target the transition animates towards.
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Wait one frame so the off-screen position paints before the slide,
      // otherwise the browser would jump straight to the open state.
      const frame = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(frame);
    }
    setShown(false);
    const timer = window.setTimeout(() => setMounted(false), SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  // Escape closes it, matching the other overlays in the app.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      {/* Tapping anywhere off the panel dismisses it. */}
      <button
        type="button"
        aria-label="Close menu"
        className={`absolute inset-0 size-full cursor-default bg-black/40 transition-opacity duration-300 ease-out motion-reduce:transition-none ${
          shown ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className={`absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-card shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform motion-reduce:transition-none ${
          shown ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          type="button"
          aria-label="Close menu"
          onClick={onClose}
          className="absolute right-2 top-2 z-10 flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
        {children}
      </div>
    </div>
  );
}
