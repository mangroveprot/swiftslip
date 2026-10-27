import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ExternalLink } from "lucide-react";
import { useState } from "react";

import { PageTitle } from "@/components/common/PageTitle";
import { SignOutButton } from "@/components/common/SignOutButton";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { APP } from "@/config/app";
import type { AppKey } from "@swiftslip/shared/types";
import { EXTERNAL_APPS } from "@swiftslip/shared/types";
import { sessionQueryOptions } from "../queries";

/** Shared card chrome: lifts and zooms smoothly on hover (no motion if reduced).
 *  The 0.3s transition itself comes from `.zoom-card` in `styles.css` — a Tailwind
 *  transition utility can't win against the unlayered global `a` rule.
 *  `flex-1` makes each card fill its (stretched) grid cell, so both cards in a row
 *  are always exactly the same height instead of hugging their own text. */
const CARD_CLASS =
  "zoom-card group flex flex-1 flex-col justify-between gap-4 rounded-xl border bg-card p-5 shadow-sm hover:border-primary/25 hover:shadow-xl motion-safe:hover:-translate-y-1.5 motion-safe:hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring";

/**
 * One card per app, shown only when `session.apps` grants it. Route cards use a
 * router `Link`; an app on another host (the Regasco Ticketing System) is a
 * plain anchor with `target="_blank"`, because a full page load of someone
 * else's app must never replace this one. Both share the same chrome so they
 * read as one list of choices.
 */
const EXTERNAL_TICKETING = EXTERNAL_APPS.ticketing;

/** One card's slot. Rows wrap and centre themselves, so when the granted apps
 *  don't fill the last row (three apps fit a row, a fourth would hang alone on
 *  the left) the leftover card sits in the middle instead of hugging the edge.
 *  The percentages account for the 1rem gap between slots. */
const CARD_CELL_CLASS = "flex w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc((100%-2rem)/3)]";

/** Shared entrance: fades + zooms into place once the page loads. */
const ENTRANCE_CLASS =
  "motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:fill-mode-both motion-safe:duration-500 motion-safe:ease-out";

/**
 * The ticketing logo is served by that host, so it can fail to load - its
 * certificate is not trusted by every machine, and the card must still make
 * sense. A failed load falls back to the card's own external-link mark instead
 * of the browser's broken-image icon.
 */
function ExternalAppLogo({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <ExternalLink className="size-5 text-muted-foreground" aria-hidden="true" />;
  }
  return (
    <img
      src={src}
      alt=""
      className="h-full w-full object-contain"
      onError={() => setFailed(true)}
    />
  );
}

/** Post-login entry point: pick which application to open. Deliberately
 *  full-screen — it sits outside the `_app` shell/sidebar.
 *
 *  Only the apps `session.apps` grants are offered. This is presentation
 *  only — each app's route guard and its server functions enforce the same
 *  rule independently. If the grants ever resolve to nothing, fall back to
 *  SwiftSlip so the page is never empty. */
export function AppChooser() {
  const { data: session } = useQuery(sessionQueryOptions());

  const apps = session?.apps?.length ? session.apps : ["swiftslip"];
  const can = (key: AppKey) => apps.includes(key);

  return (
    <main className="relative flex min-h-dvh flex-col justify-center px-4 py-20 md:px-8 md:py-24">
      <header className="absolute inset-x-0 top-0 mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-4 py-6 md:px-8 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
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
          <ThemeToggle />
          <SignOutButton />
        </span>
      </header>

      <div className="mx-auto flex w-full max-w-4xl flex-col">
        <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500 motion-safe:ease-out">
          <PageTitle className="md:text-4xl">Where would you like to go?</PageTitle>
          <p className="mt-2 text-sm text-muted-foreground">
            Choose an option to continue. You can come back here any time with{" "}
            <span className="font-medium text-foreground">Switch app.</span>
          </p>
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-4">
          {can("admin") ? (
            <div
              className={`${ENTRANCE_CLASS} motion-safe:[animation-delay:260ms] ${CARD_CELL_CLASS}`}
            >
              <Link to="/admin" className={CARD_CLASS}>
                <span>
                  <span className="relative flex h-11 w-11 items-center justify-center rounded-lg border bg-paper motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out motion-safe:group-hover:scale-110">
                    <img
                      src={APP.mindbridgeLogoPath}
                      alt=""
                      className="h-5 w-auto object-contain"
                    />
                    {/* Corner badge — mirrors the "Admin" pill the admin panel header
                      puts next to this same logo, so the two read as the same surface. */}
                    <span className="absolute -bottom-1.5 -right-1.5 rounded-full border border-dashboard-accent/40 bg-background px-1.5 text-[9px] font-bold uppercase leading-4 tracking-wide text-dashboard-accent">
                      Admin
                    </span>
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
          ) : null}

          {can("swiftslip") ? (
            <div
              className={`${ENTRANCE_CLASS} motion-safe:[animation-delay:120ms] ${CARD_CELL_CLASS}`}
            >
              <Link to="/records" className={CARD_CLASS}>
                <span>
                  <span className="flex h-11 w-11 items-center justify-center rounded-lg border bg-paper motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out motion-safe:group-hover:scale-110">
                    <img
                      src={APP.mindbridgeLogoPath}
                      alt=""
                      className="h-6 w-auto object-contain"
                    />
                  </span>
                  <span className="mt-3 block text-base font-semibold">{APP.name}</span>
                  <span className="mt-1 block text-[13px] leading-snug text-muted-foreground">
                    Daily Time Records, Official Business forms and imports everything the portal
                    does today.
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
          ) : null}

          {can("inventory") ? (
            <div
              className={`${ENTRANCE_CLASS} motion-safe:[animation-delay:400ms] ${CARD_CELL_CLASS}`}
            >
              <Link to="/rgc-asset-inventory" className={CARD_CLASS}>
                <span>
                  <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg border bg-paper motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out motion-safe:group-hover:scale-110">
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
          ) : null}

          {can("ticketing") ? (
            <div
              className={`${ENTRANCE_CLASS} motion-safe:[animation-delay:520ms] ${CARD_CELL_CLASS}`}
            >
              <a
                href={EXTERNAL_TICKETING.url}
                target="_blank"
                rel="noopener noreferrer"
                className={CARD_CLASS}
              >
                <span>
                  <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg border bg-paper p-1 motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out motion-safe:group-hover:scale-110">
                    <ExternalAppLogo src={EXTERNAL_TICKETING.logo} />
                  </span>
                  <span className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="text-base font-semibold">{EXTERNAL_TICKETING.label}</span>
                  </span>
                  <span className="mt-1 block text-[13px] leading-snug text-muted-foreground">
                    {EXTERNAL_TICKETING.description}
                  </span>
                </span>
                <span className="inline-flex items-center gap-2 text-sm font-medium text-primary">
                  Open {EXTERNAL_TICKETING.label}
                  <ArrowRight
                    className="size-4 motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out motion-safe:group-hover:translate-x-1.5"
                    aria-hidden="true"
                  />
                </span>
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
