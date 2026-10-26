import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

/**
 * Mobile navigation drawer.
 *
 * On phones the portal and the Admin Panel used to drop the nav in as a
 * full-width block under the header, which read like a second top bar. The
 * drawer slides the real sidebar in from the right edge over a dimmed backdrop
 * and gives it its own close button, so the opened menu looks like the desktop
 * sidebar rather than a bar.
 *
 * The trigger is unchanged — the existing header Menu button still opens it.
 * Desktop never sees the drawer: both the panel and the backdrop are
 * `md:hidden`, and the persistent left rail takes over from `md` up.
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
  // Escape closes it, matching the other overlays in the app.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      {/* Tapping anywhere off the panel dismisses it. */}
      <button
        type="button"
        aria-label="Close menu"
        className="absolute inset-0 size-full cursor-default bg-black/40 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col bg-card shadow-2xl motion-safe:animate-in motion-safe:slide-in-from-right motion-safe:duration-300"
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
