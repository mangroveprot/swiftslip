import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * `/rgc-asset-inventory/settings` moved into the admin panel (centralized
 * alongside the DTR template and activity logs) — old links land on `/admin`,
 * where the Settings section now lives.
 */
export const Route = createFileRoute("/rgc-asset-inventory/settings")({
  beforeLoad: () => {
    throw redirect({ to: "/admin" });
  },
});
