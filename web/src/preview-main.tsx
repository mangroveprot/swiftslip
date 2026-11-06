/* Throwaway: render the real HR queue against the reference mock's four rows
   (one overdue, one waiting, one out, one waiting on the supervisor) so the
   restyle can be screenshotted without reading or writing live data.
   Delete together with preview.html after review. */
import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import type { getRouter } from "./router";
import { routeTree } from "./routeTree.gen";
import "./styles.css";

/** A local `YYYY-MM-DD`, `offset` days from today — never `toISOString` (UTC). */
function day(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

/** The reference mock's four rows, in its order. */
const QUEUE = [
  {
    id: "row-overdue",
    employee_name: "Admin",
    id_number: "admin",
    department: "IT Support",
    position: "IT Support",
    date_of_ob: day(-1),
    attachment_approved: true,
    approved_by: "Jane Doe",
    hr_status: "departed",
    destinations: ["RGC Dipolog Sat Office"],
    updated_at: hoursAgo(25),
  },
  {
    id: "row-waiting",
    employee_name: "Admin",
    id_number: "admin",
    department: "IT Support",
    position: "IT Support",
    date_of_ob: "",
    attachment_approved: false,
    approved_by: "Jane Doe",
    hr_status: "submitted",
    destinations: [],
    updated_at: hoursAgo(2),
  },
  {
    id: "row-onob",
    employee_name: "Admin",
    id_number: "admin",
    department: "IT Support",
    position: "IT Support",
    date_of_ob: day(0),
    attachment_approved: true,
    approved_by: "Jane Doe",
    hr_status: "departed",
    destinations: ["Manukan SR"],
    updated_at: hoursAgo(3),
  },
  {
    id: "row-supervisor",
    employee_name: "Admin",
    id_number: "admin",
    department: "IT Support",
    position: "IT Support",
    date_of_ob: "",
    attachment_approved: false,
    approved_by: "Jane Doe",
    hr_status: "waiting_supervisor",
    destinations: ["RGC Dipolog Sat Office"],
    updated_at: hoursAgo(20),
  },
];

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const realFetch = window.fetch.bind(window);

window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("/api/auth/session"))
    return Promise.resolve(
      json({
        success: true,
        document: {
          id: "preview",
          role: "admin",
          label: "Gerald",
          idNumber: "admin",
          apps: ["hr"],
        },
      }),
    );
  if (url.includes("/api/hr/ob")) return Promise.resolve(json({ success: true, documents: QUEUE }));
  if (url.includes("/api/notifications"))
    return Promise.resolve(json({ success: true, document: { unread: 2 }, documents: [] }));
  // Anything else (profile photo, org lists) answers empty rather than 401.
  if (url.includes("/api/")) return Promise.resolve(json({ success: true }));
  return realFetch(input, init);
}) as typeof window.fetch;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: false },
  },
});

// Memory history: the entry is /preview.html, but the route under review is /hr.
const router = createRouter({
  routeTree,
  context: { queryClient },
  history: createMemoryHistory({ initialEntries: ["/hr"] }),
  defaultPreload: "intent",
  defaultPreloadStaleTime: 30_000,
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router as unknown as ReturnType<typeof getRouter>} />
  </StrictMode>,
);
