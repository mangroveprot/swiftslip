# Which errors can use `ErrorState` — the centralisation map

Input: `web/src/components/common/ErrorState.tsx` as it exists now.
Question: of every error the app can produce, which ones can this component render, and which cannot.

**Prop contract under test** (`ErrorState.tsx:50-64`):

| Prop | Type | Constrains the mapping how |
| --- | --- | --- |
| `icon?` | `LucideIcon`, default `CircleAlert` | One glyph per kind; must come from `lucide-react` |
| `title` | `string` (required) | Short, sentence case, no error codes |
| `description?` | `string` | One or two lines, no technical text |
| `primaryAction?` | `{ label, onClick, icon?, busy?, busyLabel? }` | **One** filled action, callback only |
| `secondaryAction?` | same shape | Quiet action — **silently dropped when `details` is set** (`:121-137`) |
| `details?` | `string \| null` | Clipboard payload; renders *Copy error details* in place of `secondaryAction` |
| `meta?` | `string \| null` | Pre-formatted footer, e.g. `Error 503 · Nov 16, 2026, 09:02 AM` |
| `className?` | `string` | The only layout escape hatch — one density, in-flow |

Verdict up front: **8 API codes + the client's `NETWORK_ERROR` match this contract.**
**10 API codes do not** — 5 of them are field-level by nature, 2 belong inside a file picker, 3 are
side-notes on a page that is still usable. `FORM_LOCKED` matches visually but needs a side effect the
component cannot perform.

---

## 1. Matches as-is — 9 identities

These are content-area failures: the thing the user came for could not be shown, and the honest
treatment is "replace it with a block". Every one already has precedent in the app.

| # | Identity | HTTP | Icon | Title | Description | Primary action | `meta` | Today |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `NETWORK_ERROR` (client-only) | 0 | `WifiOff` | Can't reach the server | Check your connection, then try again. | Try again (`RotateCw`) | `No connection · …` | `load-error.ts:45-50` only (inventory) |
| 2 | `UNAUTHORIZED` | 401 | `Lock` | You've been signed out | For your security, sign in again to keep working. | Sign in | **suppressed** | toast + redirect (`router.tsx:36-46`) |
| 3 | `FORBIDDEN` | 403 | `ShieldOff` | You don't have access to this page | Ask your system administrator to give you access. | Back to … / none | **suppressed** | silent redirect from route guards; raw toast in-page |
| 4 | `NOT_FOUND_ERROR` | 404 | `SearchX` | We can't find this page | It may have been deleted, or the link is out of date. | Back to {list} | **suppressed** | `FormUnavailable` ×7 + `NotFound` route |
| 5 | `TOO_MANY_REQUESTS` | 429 | `Timer` | Too many requests | Please wait {n} before trying again. | Try again, disabled until {n} | `Error 429 · …` | raw toast; no cooldown UI anywhere |
| 6 | `SERVICE_UNAVAILABLE` | 503 | `CloudOff` | Something went wrong | We couldn't load this page. Try again, and if the problem continues, contact your system administrator. | Try again | `Error 503 · …` | same block as any 5xx, cloud glyph |
| 7 | `INTERNAL_SERVER_ERROR` | 500 | `CircleAlert` (default) | Something went wrong | We couldn't load this page. Try again, and if the problem continues, contact your system administrator. | Try again | `Error 500 · …` | 1 real consumer, everything else toasts |
| 8 | `GENERAL_ERROR` | 500 | `CircleAlert` | Something went wrong | same as above | Try again | `Error 500 · …` | raw toast (AI failures, 60 sites) |
| 9 | `DATABASE_ERROR` | 500 | `CircleAlert` | Something went wrong | same as above | Try again | `Error 500 · …` | raw toast |

Notes that matter when you write the map:

- **Rows 7-9 are one bucket.** They are three codes for "our fault, retry may help". Mapping them to
  three different strings would invent a distinction the user cannot act on. The *code* still goes
  into `details`, so support can tell them apart.
- **Rows 2-4 suppress `meta`.** `load-error.ts:36` (`WITHOUT_META`) already encodes this: a
  401/403/404 is a navigation answer, not a timed failure. Keep that rule.
- **Row 1 is invisible to the code table.** `NETWORK_ERROR` is invented in `api-client.ts:92` and is
  not a member of `ErrorCodes`; key the map on `status`, not `code`, or special-case it.
- **Row 5 needs a re-render.** `description` is a static string, so a live countdown means the caller
  re-renders. Otherwise write "in a few minutes" and accept the vagueness.
- **Row 3 has three different causes behind one code** — not an admin, no app grant, file-link host
  check. Same title, but the caller must be allowed to override `description` ("Ask your
  administrator for the HR app" vs "…for administrator access").

## 2. Matches visually, but the component cannot finish the job — 2 identities

| Identity | Why the block is right | What it still needs |
| --- | --- | --- |
| `FORM_LOCKED` 409 | The form really is unopenable for editing, so a block in the form's place is honest: `Lock` / "This form is with HR" / "It can no longer be edited. Ask HR to reject it if it needs changes." / primary "Reload the current copy" | The editor must **also** stop accepting input. Today 5 of 6 editors toast and stay fully editable, so the user keeps typing into a form the server will refuse. The component has no `canEdit` hook — the caller has to wire one next to it. |
| `CLEANUP_IN_PROGRESS` 409 | A run is already going; nothing can be started until it finishes | It is a **precondition on a settings page that still works** — `RETENTION_DISABLED` and `CLEANUP_IN_PROGRESS` are both "you can't press this yet", not "the page failed". As a full block it would hide the settings the user may need to change. Inline banner instead (see §3). |

## 3. Do not route these through `ErrorState` — 9 identities

| Identity | HTTP | Where it belongs | Why a block is wrong |
| --- | --- | --- | --- |
| `VALIDATION_ERROR` | 400 | the inputs | `suggestions` carries `"entries.3.date: Date is required."`; the user needs the field marked, not a page. Fallback only: a summary block "3 fields need attention" when paths cannot be mapped. |
| `REQUIRED_FIELD_MISSING` | 400 | the inputs, + reveal the section | `ObEditor.tsx:602` already does this and is the model to keep. |
| `UNIQUE_FIELD_ERROR` | 409 | the input | `UserManagement.tsx:777` already sets `idError` and returns focus. The one code with a working field treatment today. |
| `PAYLOAD_TOO_LARGE` | 413 | the file picker / upload row | 4 different ceilings (15 MB body, 10 MB attachment, 5 MB photo, 200 KB thumb). The user is mid-dialog; a page block would close the context they need. |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | the file picker / upload row | Same: the picker must stay open so they can pick another file. |
| `RETENTION_DISABLED` | 400 | inline banner on the settings card | The page is fine; one control is not ready. |
| `IN_USE_ERROR` | 409 | inline message on the row / list | The row is still there. Replace the row's message, not the list. |
| `REFERENCED_ERROR` | 409 | inline message on the row / list | Same situation as `IN_USE_ERROR`, different DB. |
| `BAD_REQUEST` | 400 | depends on the cause | Overloaded: malformed JSON (framework), business refusals, and "that name is reserved". Only the business-refusal half is user-actionable, and even that is a sentence beside the control, not a page. |

Plus four failures that are not "states" at all and must not become blocks:

| Failure | Correct treatment | Why |
| --- | --- | --- |
| 401 mid-action | redirect that keeps the return path **and** the draft | `router.tsx:36-46` clears the query cache and goes to `/`; the copy already says "You'll come back to this page", which it does not do. |
| 403 from a route guard | render row 3, or keep the silent redirect | Today it silently redirects to `/choose` — there is no message in existence to render. |
| Auto-save failure | the 3-word header chip, opening `details` | No room for a block; 6 editors already have the label. |
| Per-file upload failure | the existing per-row list + retry | "3 of 8 failed" is a list, not a block. `AttachmentUploadDialog.tsx:23-30` is the model. |
| SSE stream disconnect | a quiet "not live" indicator | Zero strings exist; a reconnect banner would be inventing a state. |

---

## 4. What the component needed before this map can be central — **done 2026-11-16**

| # | Need | Status |
| --- | --- | --- |
| 1 | `code`/`status` as props, or a `describeErrorState(error)` helper | **open** — the map still has to live outside the component |
| 2 | `onRetry` + `retrying` as first-class props | **done** — `onRetry` / `retrying` / `retryLabel` synthesise the filled action; `primaryAction` still wins when the caller needs other words |
| 3 | `secondaryAction` no longer dropped when `details` is set | **done** — primary, secondary and Copy error details render together |
| 4 | A density prop | **done** for `page` / `section` (`error-state--page`, `min-height: 100dvh`). `inline` deliberately not added: every inline case in §3 belongs to a field, a row or a picker, not to this block |
| 5 | Conditional `role="alert"` | **done** — `announce` (default `true`) |

Still open, and next: the retry *policy* (show for `0`/`429`/`5xx`/`503`, hide for `400`/`403`/`404`/`409`)
belongs to the copy map, not to the component — a block cannot know whether retrying would repeat the
refusal until something maps `status` to it.

## 5. The map, as it would read in code

```ts
// web/src/lib/error-state-copy.ts  (proposed — not written yet)
import { CloudOff, CircleAlert, Lock, SearchX, ShieldOff, Timer, WifiOff } from "lucide-react";
import { formatDate, formatTime } from "@swiftslip/shared/time";
import { ApiError } from "@/lib/api-client";

const WITHOUT_META = new Set([401, 403, 404]);

export type ErrorStateCopy = {
  icon: LucideIcon;
  title: string;
  description: string;
  retry: boolean;
  /** `Error 503 · Nov 16, 2026, 09:02 AM`, or null when the status is an answer, not a failure. */
  meta: string | null;
  details: string;
};

export function describeErrorState(error: unknown, context: { path?: string; at?: Date } = {}): ErrorStateCopy {
  const api = error instanceof ApiError ? error : null;
  const status = api?.status ?? null;
  // ... switch on status, falling back to the generic 5xx row
}
```

Copy for rows 1-9 is the table in §1, verbatim. The inventory tests
(`features/inventory/lib/load-error.test.ts`, 5 cases) pin rows 1-4 and 7 — they move with the map.

---

## 6. Counts

| Bucket | Identities | Notes |
| --- | --- | --- |
| Matches as-is | **9** | 8 API codes + `NETWORK_ERROR`; covers 128 of 266 API throw sites (the 500 family alone) |
| Matches with a side effect | 1 | `FORM_LOCKED`, needs the editor to disable input |
| Inline, never a block | 3 | `RETENTION_DISABLED`, `CLEANUP_IN_PROGRESS`, `IN_USE_ERROR` / `REFERENCED_ERROR` |
| Field-level | 4 | `VALIDATION_ERROR`, `REQUIRED_FIELD_MISSING`, `UNIQUE_FIELD_ERROR`, and `BAD_REQUEST` when it is a parse failure |
| Inside the picker | 2 | `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE` |
| Not a state | 5 | 401 redirect, silent 403, auto-save chip, per-file list, SSE |

So the component is the right home for roughly **half** the identities and **the large majority of
the traffic**, because the 500 family is 128 of 266 throw sites and the offline/404 paths are the
common ones. The other half is not a design failure — it is a different shape of problem (a field, a
row, a picker, a background job) and each has exactly one correct treatment already present in the
codebase to copy.

---

## 7. Applied 2026-11-16

The map now lives in `web/src/lib/error-state-copy.ts` (`describeErrorState`), and
`web/src/components/common/ErrorStateFromError.tsx` renders it — including the retry policy (no
button on 400/403/404/409) and a `Sign in` action for 401, because sign-in is `/` and a signed-out
block must not be a dead end.

**Wired (12 call sites):** inventory Assets / Reports / Showrooms / Settings (via
`AssetTableError`), HR queue, OB list, admin dashboard (totals + both feeds), App Access, Activity
Logs, storage orphan cleanup dialog, the OB editor boundary, `FormUnavailable` (7 editors) and the
root `RouteError`.

**Deleted:** `features/inventory/components/InventoryErrorState.tsx`,
`features/inventory/lib/load-error.ts` and its test (superseded by the shared map + its 8 tests).
`FormUnavailable`, `RouteError` and `ObEditorErrorBoundary` kept their names and props — the seven
editor call sites did not move — but their hand-rolled markup is gone.

**Deliberately not converted:**

| Surface | Why |
| --- | --- |
| `NotFound` (the `/404` route) | A route page with its own deliberate identity (the giant numeral), not an error state. Converting it is a visual decision, not a refactor. |
| 46 mutation toasts | Transient failures on a page that still works — the mapping's own rule keeps them toasts. |
| Field, row and picker errors | §3: they need the input, the row or the file picker, not a block. |
| `ShowroomDrawer` save text | Validation copy in a dialog footer, not a load failure. |
