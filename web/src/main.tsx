import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { getRouter } from "./router";
import { installPrintGuards } from "./lib/print";
import { pruneExpiredBackups } from "./lib/signature";
import "./styles.css";

// Keeps Ctrl+P as clean as the Print button on every form.
installPrintGuards();

// Drop stale signature backups (older than 7 days or corrupt) so they never
// pile up and threaten the localStorage quota.
pruneExpiredBackups();

const router = getRouter();

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
