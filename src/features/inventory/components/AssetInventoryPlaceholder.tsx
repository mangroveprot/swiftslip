import { Link } from "@tanstack/react-router";
import { ArrowLeft, Boxes, Clock } from "lucide-react";

import { APP } from "@/config/app";

/**
 * Placeholder landing page for the future RGC Asset Inventory app.
 * Full-screen (own chrome, no SwiftSlip sidebar) — the real module replaces it later.
 */
export function AssetInventoryPlaceholder() {
  return (
    <main className="flex min-h-dvh flex-col px-4 py-6 md:px-8">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
        <span className="flex items-center gap-2">
          <img
            src={APP.mindbridgeLogoPath}
            alt="Mindbridge"
            className="h-8 w-auto object-contain"
          />
          <span className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
            RGC Asset Inventory
          </span>
        </span>
        <Link to="/choose" className="btn btn-outline">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to chooser
        </Link>
      </header>

      <section className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center py-12 text-center motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:fill-mode-both motion-safe:duration-500 motion-safe:ease-out">
        <span className="flex size-20 items-center justify-center rounded-2xl border border-dashed bg-card shadow-sm">
          <Boxes className="size-9 text-muted-foreground" aria-hidden="true" />
        </span>
        <span className="mt-5 inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs uppercase tracking-wider text-muted-foreground">
          <Clock className="size-3.5" aria-hidden="true" />
          Coming soon
        </span>
        <h1 className="mt-4 text-3xl font-semibold">RGC Asset Inventory</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This module is still being built, so there's nothing to inventory just yet. The route is
          reserved and ready for when it goes live.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link to="/choose" className="btn btn-primary">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to chooser
          </Link>
          <Link to="/records" className="btn btn-outline">
            Open {APP.name}
          </Link>
        </div>
      </section>
    </main>
  );
}
