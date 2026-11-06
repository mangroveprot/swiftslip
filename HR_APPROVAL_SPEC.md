# HR Approval App with Employee Notifications — Spec & Decisions

> Copy-paste record. If the implementation fails or needs redoing, this file is the
> complete list of decisions, data and the implementation plan. Collected in the
> prior session (Q&A with the user), scope locked to **Official Business (OB) only**.

## 1. Scope

- **In scope:** one new grantable app key `hr`, an HR approval workflow on
  **Official Business forms only**, and an in-app notification bell for both the
  employee and HR.
- **Out of scope:** LOA, COS, OT and DTR forms (the other four form flows are
  untouched). Email / push notifications. Supervisor-approval enforcement.

## 2. Decisions (final, from user Q&A)

| #   | Topic                | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | App shape            | Separate grantable app key `hr` with its own home route `/hr` + its own shell, shown as a card in the App Chooser.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| D2  | Access               | Full App Access rules like other apps (migration widens `app_access_rules` CHECK to include `'hr'`, default OFF / not in `STAFF_DEFAULT`) **plus** an automatic grant for department `"HR Department"` or any position under it. DB is the single source of truth (DB already has "HR Department" containing "HR Associate"; 2 accounts match).                                                                                                                                                                                                                                                                                                                               |
| D3  | Supervisor indicator | Derived from existing fields only (`approved_by` filled **and** `attachment_approved` ticked). HR can approve without it, but the form then parks in **`waiting_supervisor`**. HR may sign the departure from either `waiting_supervisor` or `approved`; the supervisor gate is on **completion** — arrival is refused until the supervisor signature is present.                                                                                                                                                                                                                                                                                                             |
| D4  | OB flow              | Explicit **"Submit for HR approval"** button → drafts/scaffolds never reach HR → HR Review → Approve / Reject (reject requires a reason) → **`waiting_supervisor`** (no supervisor signature yet) or **Ready for departure** → HR signs departure (date / time / residence / destination) from either state → **On OB** → employee can still add the missing supervisor signature → HR signs arrival → **Completed**.                                                                                                                                                                                                                                                         |
| D5  | Rejection            | Reason required → employee notified → employee edits → resubmits → HR notified again.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| D6  | Locking              | Only **`submitted`** is locked read-only (HR is reviewing a moving target otherwise). Draft / rejected / `waiting_supervisor` / approved / departed / completed are editable. A save on approved / completed **revokes the HR approval**, clears the sign-offs and sends it back to `submitted` for re-approval. A departed form does the same unless only the supervisor fields changed, so an employee can add the missing supervisor approval without losing the signed departure. A content change on `waiting_supervisor` also sends it back; a supervisor-only save promotes it to `approved`. **Delete is owner-only and works in every status**, including completed. |
| D7  | Who signs            | HR signs **both** departure and arrival (matches the mockup).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| D8  | Notifications        | In-app bell only. Events: `submitted→HR`, `approved→employee`, `rejected→employee`, `resubmitted→HR`, `departure signed→employee`. (Arrival-signed notification **not** requested.) Editing a re-approved form also notifies HR with `ob_resubmitted`.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| D9  | Employee view        | Status badges on the OB form list + detail, and a bell with an unread count.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| D10 | Read states          | `submitted` = locked. Draft / rejected / `waiting_supervisor` / approved / departed / completed = editable (a content edit on a post-approval state sends it back to `submitted`; supervisor-only edits keep the state).                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

## 3. OB HR statuses (state machine)

```
draft ──submit──▶ submitted ──approve──▶ waiting_supervisor ──supervisor signs + save──▶ approved
                      │                          │                                      │
                      └──reject──▶ rejected       └──────────────sign departure──────────┤
                                      │                                               ▼
                                      └──edit──▶ resubmit ──▶ submitted           departed
                                                                                      │
                                             completed ◀──sign arrival (supervisor done)┘
```

An edit + save on an **approved / completed** form sends it back to `submitted`
(HR approval and both sign-offs cleared) so HR re-approves the changed content.
A **content** edit on `waiting_supervisor` does the same; a supervisor-only save
there keeps HR's approval and moves to `approved` once `approved_by` is filled
**and** `attachment_approved` is ticked.

A **departed** form can be signed out before the supervisor signs. It goes back
to `submitted` only when its content changes; a supervisor-only save keeps
`departed` and the signed departure intact. `sign-arrival` is refused until
`obSupervisorDone(form)` is true, so completion always needs both approvals.

Stored in `ob_forms.hr_status` as:
`draft | submitted | waiting_supervisor | approved | rejected | departed | completed`
(plain `text`, no CHECK — mirrors how `ob_forms` stores other free statuses).

Labels (shared `OB_HR_STATUS_LABELS`):
`draft → "Draft"`, `submitted → "Waiting for HR"`, `waiting_supervisor → "Waiting for Supervisor"`,
`approved → "Ready for departure"`, `rejected → "Rejected"`, `departed → "On OB"`,
`completed → "Completed"`.

Progress steps shown on the HR detail page:
`Filed → HR approved → Supervisor approved → Departure signed → Arrival signed`.

## 4. Database changes (migration `0035_hr_approval.sql` — paste into Supabase SQL editor)

1. Widen the `app_access_rules` CHECK to include `'hr'`
   (find the existing `ALTER TABLE app_access_rules ... ADD CONSTRAINT ... CHECK (...)`
   and re-add it with `'hr'` in the list — the migration does this with a drop/re-add).
2. `ALTER TABLE ob_forms ADD COLUMN` (all default-safe for existing rows):
   - `hr_status text NOT NULL DEFAULT 'draft'`
   - `hr_reject_reason text NOT NULL DEFAULT ''`
   - `hr_approved_by uuid REFERENCES profiles(access_code_id)` (nullable)
   - `hr_approved_at timestamptz`
   - `departure_date text NOT NULL DEFAULT ''`
   - `departure_time text NOT NULL DEFAULT ''`
   - `residence text NOT NULL DEFAULT ''`
   - `destination text NOT NULL DEFAULT ''`
   - `departure_signed_by uuid REFERENCES profiles(access_code_id)` (nullable)
   - `departure_signed_at timestamptz`
   - `arrival_signed_by uuid REFERENCES profiles(access_code_id)` (nullable)
   - `arrival_signed_at timestamptz`
3. New table `notifications`:
   - `id uuid PK default gen_random_uuid()`
   - `recipient_id uuid NOT NULL REFERENCES profiles(access_code_id) ON DELETE CASCADE`
   - `actor_id uuid REFERENCES profiles(access_code_id)` (nullable)
   - `kind text NOT NULL` — one of `ob_submitted | ob_approved | ob_rejected | ob_resubmitted | ob_departure_signed`
   - `title text NOT NULL`, `body text NOT NULL`, `link text NOT NULL`
   - `read_at timestamptz` (null = unread)
   - `created_at timestamptz NOT NULL DEFAULT now()`
   - `enable row level security;` **no policies** — service-role API bypasses RLS; the API scopes every query to the signed-in user.

`api/src/core/framework/databases/supabase/database.types.ts` mirrors these
(`ob_forms` Row/Insert/Update + a `notifications` block). Do **not** touch
`api/drizzle/meta/_journal.json` (stops at 0004; migrations are applied by hand).

## 5. Wire types / schemas (shared/)

- `shared/src/types.ts`: `APP_KEYS`, `GRANTABLE_APP_KEYS` += `"hr"`; `APP_HOME` += `hr: "/hr"`.
- `shared/src/hr.ts` (new): `HR_DEPARTMENT = "HR Department"`, `OB_HR_STATUSES`,
  `ObHrStatus`, `OB_HR_STATUS_LABELS`, `ObHrFields` type, `isObLocked(status)`
  (`submitted` only), `needsReapprovalAfterSave(status)` (`approved | departed | completed`),
  `obSupervisorDone(form)` / `obSupervisorState(form)` (`approved_by` filled &&
  `attachment_approved`), `OB_NOTIFICATION_KINDS` + labels.
- `shared/src/schemas.ts`: `submitObInput` (params only), `rejectObInput`
  (body `{ reason }`), `signDepartureInput` / `signArrivalInput`
  (body `{ date, time, residence?, destination? }` — arrival reuses
  `{ date, time }`), `markNotificationsReadInput`.
- `shared/src/api-types.ts`: `ObSummary` += `hr_status`; new `HrObSummary`,
  `HrObDetail`, `NotificationRow`; `ObDetail.form` += `ObHrFields`.
- `shared/src/activity.ts`: labels for `ob.submitted`, `ob.hr_approved`,
  `ob.hr_rejected`, `ob.departure_signed`, `ob.arrival_signed`.

## 6. API structure

- New modules (controller → service → repository, per AGENTS.md):
  - `api/src/apps/hr/` — routes mounted at `/hr`, guarded `authenticate, requireApp('hr')`:
    - `GET /hr/ob` — queue of OB forms **excluding drafts** (all hr statuses except `draft`), newest first.
    - `GET /hr/ob/:id` — full detail (form + entries + attachment name).
    - `POST /hr/ob/:id/approve` — `submitted → waiting_supervisor | approved` (depending on
      `obSupervisorDone(form)`), notify the employee.
    - `POST /hr/ob/:id/reject` — body `{ reason }` (required), `submitted → rejected`, notify the employee.
    - `POST /hr/ob/:id/sign-departure` — body `{ date, time, residence, destination }`, `waiting_supervisor | approved → departed`, notify the employee.
    - `POST /hr/ob/:id/sign-arrival` — body `{ date, time }`, `departed → completed`; refused unless `obSupervisorDone(form)`, so completion always needs both approvals.
  - `api/src/apps/notifications/` — routes mounted at `/notifications`, guarded `authenticate`:
    - `GET /notifications` — answers `{ document: { unread }, documents: rows }`, rows scoped to the signed-in user, newest first.
    - `POST /notifications/read` — marks all of the caller's notifications read.
- `official-business.service.ts`:
  - `submit()` — `draft|rejected → submitted`, notifies every HR account; reject reason cleared.
  - save guard: only `submitted` (in HR's queue) returns
    `FORM_LOCKED` (`api/src/common/shared/utils/error/codes.ts`).
  - save on `approved | completed` → `submitted`, clears `hr_approved_by/at` +
    both sign-offs, logs `ob.submitted` and notifies HR (`ob_resubmitted`).
    For `waiting_supervisor` / `departed`, compare the form + itinerary against
    the stored row: a supervisor-only save keeps the state (and, for departed,
    the signed departure); a content change resets to `submitted`. A supervisor-
    only save on `waiting_supervisor` moves to `approved` once
    `obSupervisorDone(form)` is true.
  - save returns `{ document: { hr_status } }` so the editor can lock/banner at once.
  - `remove()` — owner-scoped and allowed in **every** status, completed included.
  - `list()` selects the new `hr_status` column.
- Recipients of HR notifications: every profile whose `department = "HR Department"`
  **or** whose `designation` is a position under it (via `shared/src/org.ts`
  `positionsUnder` / org lists), **plus** the acting admin if any.
- Notification links: HR events → `/hr/ob/<id>`; employee events → `/official-business/<id>`.
- `resolveApps()` / overview compute `autoApps` for `hr` (department or position match)
  and pass it into `resolveAccess` after explicit rules, before the default.
  `EVERY_APP` += `'hr'`. `global-router` mounts `/hr` and `/notifications`.

## 7. Web structure

- `web/src/api/hr.functions.ts` + `web/src/api/notifications.functions.ts`
  (fetch wrappers, `({ data })` shape — no `fetch` elsewhere).
- `web/src/features/hr/` — queries + `components/NotificationBell.tsx` dropdown
  (30 s `refetchInterval`, unread badge, mark-all-read, item click navigates to its
  `link`). Placed in the employee Sidebar footer (above "Switch app"), the AppShell
  mobile header, the HR mobile header and the HR queue header.
- `web/src/features/hr/` — `HrLayout` (own shell reusing `sidebar-ui` +
  `MobileSidebarDrawer`, guard `session.apps.includes("hr")`), routes:
  - `/hr` — the reference-led approval desk: status-grouped table sections
    (Employee / Destination / Supervisor / Updated + verb-first action), search,
    live Review queue and Completed counts. `?view=completed` switches the same
    route to the completed-only list.
  - `/hr/ob/$id` — detail: editorial masthead, five-step progress stepper, facts
    strip, itinerary chips, a two-step Exit clearance timeline with underlined
    date/time fields, Approve/Reject card (reject reason required), Waiting for
    supervisor / Rejected / Completed cards, supervisor slip rail with the live
    approval stamp, a scaled form preview and Copy summary.
- `AppChooser` — HR card (`can("hr")` → `Link /hr`).
- `ObList` — status chip from `hr_status` (added to `ObRow`); Delete is shown in
  every status (owner-only server-side).
- `ObEditor` — status banner + reject reason + Submit/Resubmit button in the header
  cluster; `canEdit = Boolean(session) && !isObLocked(hr)` (only `submitted` is
  locked); the save response's `hr_status` is merged into the cache so editing
  after approval locks/banners immediately; preserve HR fields in `writeFormCache`
  (merge from `prev.form`); cancel armed autosave + patch cache on submit.
- `AppAccess` `APP_LABELS` += `hr`; `ActivityLogs` record += `hr`.

## 8. Definition of done

1. `npm run typecheck` and `npm run lint` pass across all workspaces.
2. Tick the relevant box in `MIGRATION_CHECKLIST.md`.
3. Add an entry at the **top** of `ACTIVITY_LOG.md` (What / Why / Where / By) noting
   that migration `0035_hr_approval.sql` must be pasted into the Supabase SQL editor.
