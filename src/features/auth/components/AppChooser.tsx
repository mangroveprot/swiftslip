import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Clock, LayoutDashboard, LogOut } from "lucide-react";

import { signOut } from "@/api/auth.functions";
import { APP } from "@/config/app";
import { sessionQueryOptions } from "../queries";

/** Shared card chrome: lifts and zooms smoothly on hover (no motion if reduced).
 *  The 0.3s transition itself comes from `.zoom-card` in `styles.css` — a Tailwind
 *  transition utility can't win against the unlayered global `a` rule.
 *  `flex-1` makes each card fill its (stretched) grid cell, so both cards in a row
 *  are always exactly the same height instead of hugging their own text. */
const CARD_CLASS =
  "zoom-card group flex flex-1 flex-col justify-between gap-4 rounded-xl border bg-card p-5 shadow-sm hover:border-primary/25 hover:shadow-xl motion-safe:hover:-translate-y-1.5 motion-safe:hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring";

/** Shared entrance: fades + zooms into place once the page loads. */
const ENTRANCE_CLASS =
  "motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:fill-mode-both motion-safe:duration-500 motion-safe:ease-out";

/** Post-login entry point (administrators only): pick which application to open.
 *  Deliberately full-screen — it sits outside the `_app` shell/sidebar. */
export function AppChooser() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: session } = useQuery(sessionQueryOptions());

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOut();
    navigate({ to: "/", replace: true });
  }

  return (
    <main className="flex min-h-dvh flex-col px-4 py-6 md:px-8">
      <header className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
        <span className="flex items-center gap-2">
          <img
            src={APP.mindbridgeLogoPath}
            alt="Mindbridge"
            className="h-10 w-auto object-contain"
          />
        </span>
        <span className="flex items-center gap-3 text-sm">
          {session?.label ? (
            <span className="hidden text-muted-foreground sm:inline">
              Signed in as {session.label}
            </span>
          ) : null}
          <button className="btn btn-outline" onClick={handleSignOut}>
            <LogOut className="size-4" aria-hidden="true" />
            Sign out
          </button>
        </span>
      </header>

      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center py-10">
        <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500 motion-safe:ease-out">
          <h1 className="text-3xl font-semibold md:text-4xl">Where would you like to go?</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Choose an option to continue. You can come back here any time with{" "}
            <span className="font-medium text-foreground">Switch app</span> in the sidebar.
          </p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className={`${ENTRANCE_CLASS} motion-safe:[animation-delay:260ms] flex`}>
            <Link to="/admin" className={CARD_CLASS}>
              <span>
                <span className="flex h-11 w-11 items-center justify-center rounded-lg border bg-background motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out motion-safe:group-hover:scale-110">
                  <LayoutDashboard className="size-5 text-primary" aria-hidden="true" />
                </span>
                <span className="mt-3 block text-base font-semibold">Admin Panel</span>
                <span className="mt-1 block text-[13px] leading-snug text-muted-foreground">
                  Dashboard, user management and the DTR template create accounts, set roles and
                  edit the sheet headings.
                </span>
              </span>
              <span className="inline-flex items-center gap-2 text-sm font-medium text-primary">
                Open Admin Panel
                <ArrowRight
                  className="size-4 motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out motion-safe:group-hover:translate-x-1.5"
                  aria-hidden="true"
                />
              </span>
            </Link>
          </div>

          <div className={`${ENTRANCE_CLASS} motion-safe:[animation-delay:120ms] flex`}>
            <Link to="/records" className={CARD_CLASS}>
              <span>
                <span className="flex h-11 w-11 items-center justify-center rounded-lg border bg-background motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out motion-safe:group-hover:scale-110">
                  <img src={APP.mindbridgeLogoPath} alt="" className="h-6 w-auto object-contain" />
                </span>
                <span className="mt-3 block text-base font-semibold">{APP.name}</span>
                <span className="mt-1 block text-[13px] leading-snug text-muted-foreground">
                  Daily Time Records, Official Business forms and imports everything the portal does
                  today.
                </span>
              </span>
              <span className="inline-flex items-center gap-2 text-sm font-medium text-primary">
                Open {APP.name}
                <ArrowRight
                  className="size-4 motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out motion-safe:group-hover:translate-x-1.5"
                  aria-hidden="true"
                />
              </span>
            </Link>
          </div>

          <div className={`${ENTRANCE_CLASS} motion-safe:[animation-delay:400ms] flex`}>
            <Link to="/rgc-asset-inventory" className={CARD_CLASS}>
              <span>
                <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg border bg-background motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out motion-safe:group-hover:scale-110">
                  <img src="/inventory/logo.webp" alt="" className="h-7 w-7 object-contain" />
                </span>
                <span className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="text-base font-semibold">RGC Asset Inventory</span>
                </span>
                <span className="mt-1 block text-[13px] leading-snug text-muted-foreground">
                  Track company assets, issuances and assignments. This module is being built the
                  door is here, the rooms come later.
                </span>
              </span>
              <span className="inline-flex items-center gap-2 text-sm font-medium text-primary">
                Open RGC Asset Inventory
                <ArrowRight
                  className="size-4 motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out motion-safe:group-hover:translate-x-1.5"
                  aria-hidden="true"
                />
              </span>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
