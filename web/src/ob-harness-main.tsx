/* Throwaway: render the real OB employee editor (/official-business/:id) and
   the HR detail page (/hr/ob/:id) against one stubbed form, so the status
   card placement and any layout overlap can be screenshotted without a
   session. Delete together with ob-harness.html after review.
   Query params: ?page=employee|hr  ?state=draft|submitted|waiting_supervisor|
   approved|rejected|departed|completed */
import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import type { getRouter } from "./router";
import { routeTree } from "./routeTree.gen";
import type { ObDetail, SessionDocument } from "@swiftslip/shared/api-types";
import type { ObHrStatus } from "@swiftslip/shared/hr";
import "./styles.css";

const ID = "819dac16-1ab7-4d19-adcf-75889f7d1fb3";
const params = new URLSearchParams(location.search);
const page = params.get("page") === "hr" ? "hr" : "employee";
const state = (params.get("state") ?? "rejected") as ObHrStatus;

// Breadcrumb: survives any router navigation so the console can show which
// entry the module started from vs where the router ended up.
const START_ENTRY = page === "hr" ? `/hr/ob/${ID}` : `/official-business/${ID}`;
document.title = `harness start=${START_ENTRY} state=${state}`;

/** A wide hand-drawn scribble — the shape a real saved signature has. */
function scribbleDataUrl(): string {
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 120;
  const ctx = canvas.getContext("2d")!;
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(20, 90);
  for (let x = 20; x < 380; x += 8) {
    ctx.lineTo(x, 85 - Math.abs(Math.sin(x / 30)) * 55 - Math.random() * 8);
  }
  ctx.stroke();
  return canvas.toDataURL("image/png");
}
const SCRIBBLE = scribbleDataUrl();

// The flow: submitted → HR approves (waiting_supervisor when the slip is
// missing, approved when it is there) → departed → completed. rejected sits
// off to the side of submitted.
const inStates = (list: ObHrStatus[]) => list.includes(state);
const HR_APPROVED = inStates(["waiting_supervisor", "approved", "departed", "completed"]);
const SUPERVISOR_DONE = inStates(["approved", "departed", "completed"]);
const DEPARTED = inStates(["departed", "completed"]);
const ARRIVED = inStates(["completed"]);

const DETAIL: ObDetail = {
  form: {
    id: ID,
    id_number: "admin",
    employee_name: "Gerald Casas",
    department: "Information Technology / RGC Dipolog Sat Office",
    position: "IT Support",
    date_filed: "2026-11-04",
    date_of_ob: "2026-11-05",
    approved_by: "Jane Doe",
    approved_via_viber: true,
    employee_signature: SCRIBBLE,
    attachment_approved: true,
    hr_status: state,
    submitted_at: "2026-11-04T08:39:00.000Z",
    resubmit_count: 0,
    resubmit_history: [],
    submit_snapshot: null,
    hr_reject_reason: state === "rejected" ? "I dont like it" : "",
    hr_rejected_at: state === "rejected" ? "2026-11-06T08:12:00.000Z" : null,
    hr_rejected_by: state === "rejected" ? "u-hr-1" : null,
    hr_approved_by: HR_APPROVED ? "u-hr-1" : null,
    hr_approved_at: HR_APPROVED ? "2026-11-04T09:05:00.000Z" : null,
    supervisor_approved_at: SUPERVISOR_DONE ? "2026-11-04T10:12:00.000Z" : null,
    departure_date: DEPARTED ? "2026-11-04" : "",
    departure_time: DEPARTED ? "14:03" : "",
    residence: DEPARTED ? "Manukan SR" : "",
    destination: DEPARTED ? "RGC Dipolog Sat Office" : "",
    departure_signed_by: DEPARTED ? "u-hr-1" : null,
    departure_signed_at: DEPARTED ? "2026-11-04T14:03:00.000Z" : null,
    arrival_date: ARRIVED ? "2026-11-05" : "",
    arrival_time: ARRIVED ? "16:20" : "",
    arrival_signed_by: ARRIVED ? "u-hr-1" : null,
    arrival_signed_at: ARRIVED ? "2026-11-05T16:20:00.000Z" : null,
  },
  entries: [
    {
      idx: 0,
      from_place: "Manukan SR",
      to_place: "RGC Dipolog Sat Office",
      purpose: "Inspect the satellite office and meet the branch head",
      time_departure: "08:00",
      time_return: "17:00",
    },
    {
      idx: 1,
      from_place: "RGC Dipolog Sat Office",
      to_place: "Manukan SR",
      purpose: "Return trip",
      time_departure: "17:00",
      time_return: "18:30",
    },
  ],
  attachment: { name: "approval-slip.png" },
  signers: {
    ...(state === "rejected"
      ? { rejected: { name: "Maria Santos", signature: SCRIBBLE, position: "HR REVIEWER" } }
      : {}),
    ...(HR_APPROVED
      ? { approved: { name: "Maria Santos", signature: SCRIBBLE, position: "HR REVIEWER" } }
      : {}),
    ...(DEPARTED
      ? { departure: { name: "Maria Santos", signature: SCRIBBLE, position: "HR ASSOCIATE" } }
      : {}),
    ...(ARRIVED
      ? { arrival: { name: "Maria Santos", signature: SCRIBBLE, position: "HR ASSOCIATE" } }
      : {}),
  },
};

const SESSION: SessionDocument = {
  id: "harness-user",
  role: "admin",
  label: "Gerald Casas",
  idNumber: "admin",
  apps: ["admin", "swiftslip", "hr"],
};

const PROFILE = {
  emp_no: "admin",
  full_name: "Gerald Casas",
  designation: "IT Support",
  area: "RGC Dipolog Sat Office",
  department: "Information Technology",
  signature: SCRIBBLE,
  photo: "",
  supervisor: "Jane Doe",
};

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const realFetch = window.fetch.bind(window);

window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("/api/auth/session")) return json({ success: true, document: SESSION });
  if (url.includes("/api/profile/me")) return json({ success: true, document: PROFILE });
  if (url.includes("/api/org-options"))
    return json({ success: true, document: { designations: [], departments: [], positions: [] } });
  if (url.includes("/api/notifications"))
    return json({ success: true, document: { unread: 0 }, documents: [] });
  if (url.includes("/attachment")) return json({ success: true, document: null });
  if (url.includes(`/official-business/${ID}`) || url.includes(`/hr/ob/${ID}`))
    return json({ success: true, document: DETAIL });
  // Anything else answers an empty envelope rather than 401.
  if (url.includes("/api/")) return json({ success: true, document: null, documents: [] });
  return realFetch(input, init);
}) as typeof window.fetch;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: false },
  },
});

// Memory history: the entry is /ob-harness.html, the route under review is
// picked by ?page=.
const router = createRouter({
  routeTree,
  context: { queryClient },
  history: createMemoryHistory({
    initialEntries: [START_ENTRY],
  }),
  defaultPreload: "intent",
  defaultPreloadStaleTime: 30_000,
});

// Log every route transition so a stray redirect is visible in the console.
console.log("[harness] initial entry:", START_ENTRY);
router.subscribe("onResolved", () => {
  console.log("[harness] route:", router.state.location.pathname);
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router as unknown as ReturnType<typeof getRouter>} />
  </StrictMode>,
);
