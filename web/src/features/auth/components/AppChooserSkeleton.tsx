/**
 * The chooser's own pending state, shown while `/choose` resolves: the route
 * chunk, the session re-check and the profile gate can together outlast the
 * router's 120 ms threshold.
 *
 * It has to be a route-level component. The router's fallback (`RoutePending`)
 * is now a neutral spinner, which says "opening" but not "the picker is
 * opening"; this mirrors the picker instead: the same header, title, subtitle
 * and card grid, so the real page swaps in without moving anything.
 *
 * The grid shows the full set of cards the chooser can offer (six). The route
 * only renders this page when there is a choice to make, and the grid is the
 * page's whole shape, so reserving both rows keeps the title where it will
 * stay; a single row left the page centred a row too low and everything jumped
 * up when the grants arrived.
 *
 * Decorative only; the single status line is all a screen reader hears.
 */
import { ChristmasLights } from "./ChristmasLights";

/** Same cells and gap as `AppChooser`, so the cards land where they will stay. */
const CARD_CELL_CLASS = "flex w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc((100%-2rem)/3)]";

/** One card per possible grant: admin, SwiftSlip, HR, inventory, updates, ticketing. */
const CARDS = 6;

/**
 * One placeholder bar.
 *
 * `bg-foreground/20`, not `bg-muted`: the header and title sit on the mint
 * gradient rather than on a card, and in dark mode `--muted` is only a shade
 * off `--card` (0.275 vs 0.235), so muted bars all but disappeared there. A
 * share of the ink token keeps the same contrast in both themes and on both
 * surfaces.
 */
function Bar({ className }: { className: string }) {
  return <span className={`block rounded bg-foreground/20 ${className}`} />;
}

export function AppChooserSkeleton() {
  return (
    <main
      role="status"
      aria-live="polite"
      className="relative flex min-h-dvh flex-col justify-center px-4 pt-32 pb-20 sm:pt-36 md:px-8 md:py-24"
    >
      <span className="sr-only">Opening the app chooser…</span>

      {/* The real page's garland, already in place: it is static decoration, so
          it should not pop in after the session resolves. */}
      <ChristmasLights />

      {/* Same header geometry as the real page (brand, theme, face, sign out),
          so the lockup does not jump when the controls arrive. */}
      <header
        aria-hidden="true"
        className="absolute inset-x-0 top-12 mx-auto flex w-full max-w-4xl animate-pulse items-center justify-between gap-3 px-4 py-4 sm:top-14 sm:gap-4 sm:px-8 sm:py-6"
      >
        <span className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Bar className="h-8 w-8 shrink-0 rounded-lg sm:h-11 sm:w-11" />
          <Bar className="h-5 w-28 max-w-full sm:h-7 sm:w-32" />
        </span>

        <span className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          {/* Theme toggle: a round icon button. */}
          <Bar className="size-8 rounded-full" />
          <Bar className="hidden h-5 w-px rounded-none sm:block" />
          {/* Face + name. */}
          <span className="inline-flex items-center gap-2">
            <Bar className="size-6 rounded-full" />
            <Bar className="hidden h-3.5 w-16 sm:block" />
          </span>
          {/* Sign out is an outlined button, not a filled block. */}
          <span className="block h-[2.125rem] w-11 rounded-lg border border-border bg-card sm:w-24" />
        </span>
      </header>

      <div aria-hidden="true" className="mx-auto w-full max-w-4xl animate-pulse">
        <Bar className="h-7 w-64 max-w-full sm:h-8 sm:w-80 md:h-9 md:w-[30rem]" />
        <Bar className="mt-3 h-3.5 w-[22rem] max-w-full sm:w-[34rem]" />

        <div className="mt-6 flex flex-wrap justify-center gap-4">
          {Array.from({ length: CARDS }, (_, card) => (
            <div key={card} className={CARD_CELL_CLASS}>
              <div className="flex flex-1 flex-col justify-between gap-4 rounded-xl border bg-card p-5 shadow-sm">
                <div>
                  {/* The icon tile stays paper in both themes, like the real one. */}
                  <span className="block size-11 rounded-lg border bg-paper" />
                  <Bar className="mt-3 h-4 w-2/5" />
                  <Bar className="mt-2 h-3.5 w-full" />
                  <Bar className="mt-1.5 h-3.5 w-11/12" />
                  <Bar className="mt-1.5 h-3.5 w-3/5" />
                </div>
                <Bar className="h-5 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
