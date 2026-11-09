# SwiftSlip → api-qasma structure: migration checklist

> **Paste this whole file to any agent that continues the work.**
> It is self-contained: goal, rules, current status, and the exact steps left.
> Whoever finishes a step must tick its box and add a line to `ACTIVITY_LOG.md`
> (newest entry at the top — see `CLAUDE.md`).

## 0. Goal (what the owner asked for)

1. Rework the backend to follow **api-qasma's structure** (Express, `apps/<module>`,
   controller → service → repository), but on the **existing Supabase/Postgres
   database** (not Mongo). Tables and column names do not change.
2. **One error contract everywhere.** Every service method ends in this exact
   `catch`, and every controller turns failures into `ApiResponse.error`:

   ```ts
   catch (error) {
     return {
       success: false,
       error:
         error instanceof ErrorResponse
           ? error
           : new ErrorResponse('INTERNAL_SERVER_ERROR', (error as Error).message),
     };
   }
   ```
3. **One repo, one command.** Frontend + backend live in the same workspace.
   `npm run dev` starts both; they can be split into separate repos later with
   no code change (web talks to the API only through `VITE_API_URL` / the dev
   proxy; `shared/` is only zod schemas + types).
4. Keep the web app's behaviour identical. No UX changes during the port.

## 1. Repo layout

```
swiftslip/
├─ api/      Express API  (@swiftslip/api)      port 9095
├─ web/      Vite + React (@swiftslip/web)      port 8080, Vite SPA (TanStack Router + Query)
├─ shared/   zod schemas + types (@swiftslip/shared) — imported as @swiftslip/shared/<file>
└─ package.json   npm workspaces; `npm run dev` runs api + web together
```

`api/src` layout (copy it exactly for every new module):

```
src/
├─ server.ts
├─ core/
│  ├─ config/index.ts              ← ONLY place that reads process.env
│  ├─ engine/base/                 ← BaseRepository, BaseService, Filter/Row types
│  └─ framework/{databases/supabase, webserver/express.ts}
├─ common/
│  ├─ global-router/{index.ts, default.ts}   ← mount each app's routes in index.ts
│  └─ shared/{middlewares, services, types, utils/error, utils/response}
├─ helpers/
└─ apps/<module>/
   ├─ controllers/<x>.controller.ts   static methods, try/catch → ApiResponse
   ├─ routes/<x>.routes.ts            validate(schema) + auth middleware + controller
   ├─ services/<x>.service.ts         extends BaseService; every method ends in the catch above
   ├─ repositories/<x>.repo.ts        extends BaseRepository<'table'>; Supabase queries only here
   ├─ types/                          module-only types
   └─ index.ts                        barrel (export Routes, Service)
```

## 2. Rules every agent must follow

- [ ] Read `ACTIVITY_LOG.md` (top) and this file before changing anything.
- [ ] Services return `ServiceResponse<T>` (`{success:true, document|documents}` or
      `{success:false, error}`) and **never throw**. Repositories throw `ErrorResponse`.
- [ ] Controllers: `if (response.success) ApiResponse.success(res, response, code); else throw response;`
      inside `try`, and `catch (error) { ApiResponse.error(res, error as ErrorResponseType) }`.
- [ ] Wire format of success: `{ success: true, document | documents, total?, results?, page?, limit? }`.
      Wire format of error: `{ success: false, error: { status, code, message, suggestions } }`.
- [ ] New error kinds go in `common/shared/utils/error/codes.ts` — never ad-hoc strings.
- [ ] Request validation = zod schema from `shared/src/schemas.ts` through `validate()`.
      Do not re-declare a schema in `web` or `api`.
- [ ] Env vars: add to `core/config/index.ts` **and** `api/.env.example`, nowhere else.
- [ ] Every query is scoped to the signed-in user (`owner`/`access_code_id`) unless the
      route is admin-only. The Supabase key is service-role (bypasses RLS).
- [ ] Do not change table or column names, and do not edit old migrations.
- [ ] After every phase: `npm run typecheck -w @swiftslip/api` and `npm run lint -w @swiftslip/api` pass.
- [ ] Add a top entry to `ACTIVITY_LOG.md` (What / Why / Where / By).

## 3. Status

### Phase 1 — Workspaces + API base ✅ DONE
- [x] npm workspaces `api/ web/ shared/`, Bun removed, `npm run dev` runs both
- [x] Config (zod-validated env), `ErrorResponse` + codes, `ServiceResponse`, `ApiResponse`
- [x] Global error + not-found handlers, `validate()` middleware, rate limiter, logger
- [x] Supabase client, `BaseRepository`, `BaseService`
- [x] `/`, `/health`, `/health/db`

### Phase 2 — Identity, access, org, audit ✅ code done; real-DB smoke test pending
- [x] `SESSION_SECRET` env + signed httpOnly cookie (`swiftslip-session`, 12 h, same fingerprint trick)
- [x] PBKDF2 password hashing ported (legacy SHA-256 hashes still verify and upgrade on login)
- [x] Middlewares: `authenticate` (`requireUser`), `requireAdmin`, `requireApp(app)`
- [x] `apps/activity-log` — `ActivityLogService.log()` (best effort), sign-in throttle, list / counts / feed
- [x] `apps/auth` — sign-in, sign-out, session, change-password
- [x] `apps/users` — admin list / create / update / delete accounts
- [x] `apps/profile` — get / save my profile
- [x] `apps/access` — resolve rules, overview, set rule, set app default, delete rule
- [x] `apps/org-options` — list / add / rename / delete (cascades to profiles + rules)
- [x] `apps/admin` — dashboard stats
- [x] Verified with tsc + eslint, and booted against a fake PostgREST (sign-in, 401/403, cookie tamper, validation, sign-out)
- [ ] **Owner to run:** `npm run setup`, fill `api/.env` (`SUPABASE_*`, `SESSION_SECRET`), then smoke test against the real database (section 5). Not yet tested on real Supabase.

### Phase 3 — Forms ✅ code done; real-DB smoke test pending
Same pattern as `apps/profile`. Verified with tsc + eslint and booted against a fake PostgREST
(create/list/get/save/delete for all five forms, owner scoping → 404 for another user,
attachment upload/url/remove, magic-byte rejection, extra files, AI "not configured" → 503).
- [x] 3.1 `apps/records` (DTR records + entries)
- [x] 3.2 `apps/official-business`
- [x] 3.3 `apps/loa`
- [x] 3.4 `apps/cos` (change of schedule)
- [x] 3.5 `apps/ot` (overtime)
- [x] 3.6 `apps/attachments` — shared service + `buildAttachmentRoutes()`, mounted by each form app
- [x] 3.7 `apps/biometric-import` (`GEMINI_API_KEY`, `GEMINI_MODEL` added to config + `.env.example`)
- [x] 3.8 `apps/ai` — reason + chat assistants for OB/LOA/COS/OT, quota from the activity log
- [x] Each form app logs through `ActivityLogService.logBy()` (`ob.created`, `ob.deleted`, …)
- [ ] **Owner to run:** smoke test the form endpoints against the real database + a real `GEMINI_API_KEY`
      (section 5). The Gemini prompts were moved verbatim to `apps/ai/prompts/`; only the errors changed
      (`ErrorResponse` codes instead of `Error`).

Intentional changes in Phase 3 (do not "fix" back):
- The "migration 0003 not applied" fallbacks for `employee_signature` are gone (DB must be at 0026).
- Save is `PUT /<form>/:id` with the body **without** `id` (the id is the URL). Delete's `quiet` flag is
  `?quiet=true`. Both schemas live in `shared` (`deleteRowQuery`, `attachmentPathQuery`).
- Errors now carry codes/status (404 not found, 415 bad file type, 413 too big, 429 AI quota,
  503 AI not configured) instead of a bare message.
- OT's main-attachment "not found" text says "Form not found." (was the same); extra-file text still says "Overtime form".

### Phase 4 — Inventory ✅ code done; real-DB smoke test pending
Same pattern as the form apps, but on the **second database** (the RGC Postgres, raw SQL via
`postgres`). `npm install`, `typecheck` and `lint` now pass for `api` (12 prettier-only lint errors were
auto-fixed at the start of Phase 5). Still not exercised against the real RGC database.
- [x] 4.1 `apps/inventory-assets` ← `assets.server.ts` (list data, create, update, bulk delete; logs `asset.created/updated`)
- [x] 4.2 `apps/inventory-options` ← `options.server.ts` (list with usage, add, rename, delete, quick create)
- [x] 4.3 `apps/inventory-reports` ← `reports.server.ts` (document builder moved verbatim to
      `utils/report-document.ts`, pure rows → document; download log)
- [x] 4.4 `core/framework/databases/postgres/` (lazy pool, `RGC_INVENTORY_DATABASE_URL`, optional → 503),
      `RgcRepository` base (`core/engine/base/_repositories/rgc.repository.ts`), `GET /health/inventory-db`
- [x] `npm install`, `npm run typecheck -w @swiftslip/api`, `npm run lint -w @swiftslip/api` pass
- [ ] **Owner to run:** add `RGC_INVENTORY_DATABASE_URL` to `api/.env`, then smoke test the inventory
      endpoints below against the real RGC database.
- [ ] Golden test (`web/scripts/inventory-report-golden`) only covers the client-side Excel export, which is
      untouched. Nothing yet compares the new `buildReportDocumentFromRows` output with the old one — compare
      `GET /api/inventory/reports/<branchId>` against the old `getReportDocument` for one branch.

Intentional changes in Phase 4 (do not "fix" back):
- Settings mutations no longer return `{ ok:false, level, message }`. They fail with the standard error shape
  and the web client (Phase 5) picks the toast level from `error.code`:
  **warning** = `UNIQUE_FIELD_ERROR` (409, "That branch already exists.") and `IN_USE_ERROR` (409, "Cannot delete
  branch: still used by N assets."); **error** = everything else, including `REFERENCED_ERROR` (409, the old
  "Cannot delete: still referenced…") and `DATABASE_ERROR` ("Failed to add: …" / "Failed to update: …").
  Message text is unchanged. New codes: `IN_USE_ERROR`, `REFERENCED_ERROR`.
- Save is `POST /inventory/assets` (create) / `PUT /inventory/assets/:id` (edit); the body has no `assetId`.
  Bulk delete is `POST /inventory/assets/bulk-delete` (a body on DELETE is dropped by some proxies).
- Missing branch / asset → 404 (was a plain `Error`). Guard-trigger failures (Postgres `P0001`) → 400 with the trigger's message.
- Every inventory route is `authenticate` + `requireApp('inventory')` (same rule as before: admins always, others by access rule).
- `RGC_INVENTORY_DATABASE_URL` is now optional: unset = inventory endpoints answer 503, the rest of the API still boots.

### Phase 5 — Switch the web app to the API ✅ code done; browser click-through + real-DB test pending
Web is now a plain **Vite SPA** (TanStack Router + Query kept; TanStack Start, Nitro and every server
function removed). Verified: `typecheck` / `lint` / `vite build` pass; API + web booted together and
exercised through the dev proxy (401 gates, validation and 404 envelopes, tampered cookie, SPA deep-link
fallback). **Not** verified: the UI in a real browser, or anything against the real databases.
- [x] 5.1 `web/src/lib/api-client.ts`: one `fetch` wrapper (`credentials: 'include'`, reads the envelope,
      throws `ApiError {status, code, message, suggestions}`; network failure → code `NETWORK_ERROR`).
      Base URL = `import.meta.env.VITE_API_URL ?? '/api'`.
- [x] 5.2 Vite dev **and preview** proxy `/api → http://localhost:9095` (`API_DEV_TARGET` overrides);
      `web/.env.example` with `VITE_API_URL`; API `CORS_ORIGIN` default is now `http://localhost:8080`
- [x] 5.3 Every `web/src/api/*.functions.ts` is now a fetch wrapper. **Exported names, `({ data })` call
      shape and return shapes are unchanged**, so `features/*` did not change. Response types that used to be
      inferred from the server now live in `shared/src/api-types.ts`.
- [x] 5.4 Route guards unchanged: they call `getSession()`, which is `GET /api/auth/session`
- [x] 5.5 Deleted `web/src/server/**`, `start.ts`, `server.ts`, `config/env.server.ts`, `.wrangler/`; removed
      `@supabase/supabase-js`, `@tanstack/react-start`, `nitro`, `postgres`, `@tanstack/devtools-vite` from web.
      (`web/src/api/` stays: it is now the client layer — same names, so nothing in `features/` had to change.)
- [x] 5.6 Decision: **plain Vite SPA, TanStack Router + Query kept** (`main.tsx` + `index.html`;
      `routeTree.gen.ts` is generated by `@tanstack/router-plugin`)
- [x] 5.7 Root `npm start` = build api + web, then run the API and `vite preview` (web on :8080, proxying /api).
      The build is verified; `npm start` itself has not been run.
- [ ] **Owner to run:** `npm run dev`, then click through sign-in, each of the five forms (create, edit,
      autosave, attachment upload/view/remove, AI helpers, PDF/Word export), Admin Panel, and Inventory
      (Settings add/rename/delete toasts, asset drawer, reports) against the real databases.

Intentional changes in Phase 5 (do not "fix" back):
- Wrong ID/password is still `{ ok:false }` from `signIn()` (API answers 401); every other failure
  (throttled, server down) throws an `ApiError` whose message the login form shows.
- Inventory Settings `createOption` / `renameOption` / `deleteOption` still resolve to `{ ok:false, level, message }`
  so the page is unchanged: `level` is `warning` for `UNIQUE_FIELD_ERROR` / `IN_USE_ERROR`, `error` for any other
  API error. Network failures and 401/403 still throw (the page's `catch` shows them).
- `listActivityLogsFn` maps the API's `documents` + `total` back to `{ rows, total }`.
- `<head>`: fonts, manifest, icons, theme-color and default `og:*` tags are static in `web/index.html`
  (crawlers that don't run JS only see those); per-route title/description come from `seo()` at runtime.
  If `APP.siteUrl` / `logoPath` in `config/app.ts` change, update the `og:image` URLs in `index.html` too.
- Build output is static `web/dist` (the Cloudflare/Nitro worker target is gone). Any static host works but must
  serve `index.html` for unknown paths. `@tanstack/devtools-vite` was dropped (no devtools UI was mounted).
- Session expiry mid-use surfaces as a 401 `ApiError`; since Phase 6 a global handler sends the user to the login page.

### Phase 6 — Hardening ✅ code done; lint/typecheck + real-environment checks pending
Written without network access: files were syntax-checked only. **Not** run: `npm install`,
`typecheck`, `lint`, `build`, or a browser.
- [x] **Owner to run:** `npm run typecheck && npm run lint` (all workspaces) and fix anything they report
- [x] `README.md` rewritten for api/web/shared (Phase 5)
- [x] `AGENTS.md` created (rules from sections 1-2 of this file)
- [x] Global 401 handler: `setUnauthorizedHandler` in `web/src/lib/api-client.ts`, registered in
      `router.tsx` (clears the session + cached data, toasts, goes to `/`). `/auth/sign-in`,
      `/auth/sign-out`, `/auth/session` are exempt (a 401 there is a normal answer)
- [x] Production: `SESSION_SECRET` >= 32 chars (already enforced), `CORS_ORIGIN` now **required** when
      `NODE_ENV=production`, cookie is `secure` in production, startup warning when production runs with
      `TRUST_PROXY=0`
- [x] Web security headers restored (HSTS, CSP, X-Frame-Options, ...): `vite preview` + `web/public/_headers`.
      CSP no longer needs `'unsafe-inline'` for scripts (no SSR bootstrap) — **verify in a browser** that
      PDF/Word export, attachment preview and fonts still load under it
- [x] `logform` declared in `api/package.json` (was only a transitive dependency)
- [x] `.gitignore`: a corrupted last line (`CLAUDE.mdbuild`) fixed, so `api/build` is ignored again
- [ ] Optional: tests for `resolveAccess`, password hashing, `BaseRepository.fail` mapping (needs a test
      runner added — not done)
- [ ] Compare `GET /api/inventory/reports/<branchId>` with the old `getReportDocument` (Phase 4 leftover)

### Phase 7 — Data retention (Settings → auto-delete old forms) ✅ code done; migration not applied yet
Manual, admin-only cleanup of forms older than N days, plus their storage files. No schedule.
- [x] `api/drizzle/migrations/0028_retention.sql` — `retention_settings` (single row) + `cleanup_runs`
      (permanent history), RLS on with no policies like `activity_logs`
- [x] `apps/retention` (controller → service → repositories), mounted at `/api/admin/retention`,
      `authenticate` + `authorizeAdmin`: `GET /`, `PUT /`, `POST /preview`, `POST /run`, `GET /runs/last`
- [x] Selection rules in `services/retention.rules.ts` (pure): expired **and** finished only — pending
      approval slips and empty scaffolds are never selected; 19 sample-row checks pass
- [x] Rows first, files second; storage failures are logged and set `completed_with_file_errors`
- [x] `cleanup.forms` in the activity log (`ActivityAction`, `FORM_ACTIONS`, labels)
- [x] Web: `api/retention.functions.ts`, `features/admin/queries.ts`, `components/settings/**`,
      collapsible **Settings** group in `AdminPanel.tsx`
- [x] `npm run typecheck`, `npm run lint`, `npm run build` pass (6 pre-existing `react-refresh` warnings only)
- [ ] **Owner to run:** paste `0028_retention.sql` in the Supabase SQL Editor, then open
      Admin Panel → Settings → Data retention, **Preview** first and only then **Run**. Not tested
      against the real database. **If `0028` was applied before 2026-10-29** (it capped the period at
      30 days), also paste `0029_retention_days_floor.sql` — otherwise saving 7 days fails with
      `violates check constraint "retention_settings_days_check"`.

### Phase 8 — Optional B2 file storage (`/api/files`) + Storage settings page ✅ code done; migration + real-bucket test pending

Added per `STORAGE_GUIDE.md` as a **second, optional** storage backend. The later
`FileStorageService` refactor also routed **form/DTR attachments** through the admin's rule
(`pickBackend()` + `attachment_backend`); files already in Supabase are not migrated.
⚠️ That refactor is still **uncommitted** (2026-11-05) — a build from git HEAD ignores the
rule entirely and writes every attachment to Supabase. Deploy it before testing `b2-only`.
- [x] `api/src/apps/files` (controller → service → `B2Repository` / `FileRepository`), mounted at
      `/api/files` behind `authenticate`
- [x] Server-relay upload: base64 JSON → API → B2 `PutObject`, with the attachment magic-byte gate
      plus `ALLOWED_MIME` / `MAX_UPLOAD_MB`
- [x] Downloads are 5-minute presigned GET URLs, issued only after the `(key, owner_id)` row check;
      the public Cloudflare Worker is not used for private files
- [x] Bucket-root `{uuid}.{ext}` keys; `public.files` metadata table (`0030_files.sql`), RLS on,
      no FK on `owner_id` (so account-delete cleanup runs after the user row is gone)
- [x] Account deletion also cleans the B2 store (best effort; no-op when B2 is off)
- [x] Env in `core/config/index.ts` + `.env.example` only; unset `B2_*` = the `/files` app answers 503
- [x] `npm run typecheck`, `npm run lint` pass (6 pre-existing web warnings only)
- [x] **Storage settings page** — backend `api/src/apps/storage` (controller → service → repositories),
      mounted at `/api/admin/storage` behind `authenticate` + `authorizeAdmin`:
      `GET /` (usage split per backend into approved/other/orphan/free, current rule, next backend),
      `PUT /` (save rule + threshold, logged), `POST /orphans`, `POST /orphans/everywhere`
- [x] Cleanup modal: `GET /orphans/preview` + `POST /orphans/delete` implemented (re-checks each key
      at delete time) and wired to `StorageOrphanCleanupDialog.tsx`, which replaces the blind confirm
- [x] Web: `api/storage.functions.ts`, `features/admin/components/settings/Storage.tsx`, `Storage`
      nav item in `AdminPanel.tsx` (replaced the "soon" row)
- [x] Config: `SUPABASE_STORAGE_BUCKET`, `SUPABASE_STORAGE_LIMIT_MB`, `B2_STORAGE_LIMIT_MB`,
      `STORAGE_MIN_FREE_PERCENT`, `STORAGE_USAGE_CACHE_SECONDS`, `STORAGE_ORPHAN_GRACE_SECONDS`,
      `SUPABASE_STORAGE_DASHBOARD_URL`, `B2_DASHBOARD_URL` in config + `.env.example`;
      `storage_settings` table types; migration `0031_storage_settings.sql`
- [ ] **Owner to run:** paste `0030_files.sql` AND `0031_storage_settings.sql` in the Supabase SQL
      Editor, add `B2_ENDPOINT`, `B2_UPLOAD_KEY_ID`, `B2_UPLOAD_APP_KEY` to `api/.env`, then test
      `/api/files` upload → `GET /files/url?key=` → `DELETE /files?key=`, and open
      Admin Panel → Settings → Storage. Not tested against a real B2 bucket.
- [ ] **Deploy the `FileStorageService` refactor first.** On 2026-11-05 the live service was still
      running git HEAD, where `pickBackend()` only feeds the dashboard's "next backend" field: a
      brand-new OT attachment went to Supabase while the saved rule was `b2-only`. The `B2_*`
      variables are **already set** on the Render service (owner, 2026-11-05; `render.yaml` now
      declares them too). So only **commit + push the working tree** remains — Render rebuilds
      from git. Then upload a **new** attachment and check the URL is a B2 presigned link.
      Existing Supabase files stay put by design.

### Phase 9 — HR approval app for Official Business + in-app notifications ✅ code done; migration not applied yet
Separate grantable `hr` app (`/hr`, own shell + App Chooser card). Scope locked to **OB only**;
LOA/COS/OT/DTR untouched. Full decision record: `HR_APPROVAL_SPEC.md` (D1–D10).
- [x] `api/drizzle/migrations/0035_hr_approval.sql` — `'hr'` added to the `app_access_rules` CHECK;
      12 HR columns on `ob_forms`; `notifications` table (recipient-scoped, RLS on, no policies)
- [x] `api/drizzle/migrations/0036_ob_arrival_signoff.sql` — `arrival_date` / `arrival_time` on
      `ob_forms`, so the exit-clearance arrival row prints what HR typed (not just the audit stamp).
      **Extended 2026-11-06** for the status cards: `submitted_at`, `hr_rejected_at`,
      `hr_rejected_by`, `supervisor_approved_at`, backfilled from the workflow's own
      `notifications` rows (`ob_submitted` / `ob_resubmitted` / `ob_rejected` carry the exact
      moment and the person) instead of guessing from `updated_at` — NULL where no record
      survives, so the card shows "—" rather than a wrong date.
- [x] `api/drizzle/migrations/0037_ob_resubmit.sql` — `resubmit_count` / `resubmit_history` on
      `ob_forms`. The workflow already emitted `ob_resubmitted` notifications but the row itself
      forgot the trip once HR cleared the reject reason; the count now survives on the form and the
      history keeps `{ at, how: 'rejected' | 'edited', reason?, rejected_at?, rejected_by?,
      changes? }` (HR's reason and who/when rejected the version being answered). The migration
      backfills the count from the existing `ob_resubmitted` notifications and is re-runnable.
- [x] `api/drizzle/migrations/0038_ob_resubmit_snapshot.sql` — `submit_snapshot` jsonb on
      `ob_forms`. Written by the API on every submit; on the next resubmit it is diffed against the
      new content to produce `resubmit_history[].changes` (`{ key, label, from, to }`), which is what
      lets both screens say *what* changed and the HR sheet print "Changed / Was: …". NULL for rows
      submitted before this migration — those show the count but no field-level diff, never a false
      "everything changed".
- [x] Resubmit indication — `ResubmitBadge` is now a line of text (amber, no pill) with the latest
      trip's wording ("Resubmitted after rejection", "Edited after approval", or "9th submission"
      for legacy rows): under the status in the HR queue, on the employee's `ObList` card, and on
      the status card's compact header. The HR queue also replaces the destination's due-date line
      with "Changed: Purpose, Destination" on a resubmit. The employee header line read
      "Resubmitted Nov 7, 2026" at the time; **that tail is now removed** as redundant
      (see the status-card restructure item below).
- [x] Required fields on submit/resubmit — one list in `shared/src/ob-required.ts` (header cells +
      employee signature + each stop's From / To / Purpose, plus at least one stop) blocks both
      `ObEditor` (toast + red inline marks appear only after the first attempt) and the API's
      `POST /official-business/:id/submit` (`REQUIRED_FIELD_MISSING`), so a stale tab or direct
      POST cannot hand HR a half-filled sheet.
- [x] Friendly missing-required feedback (owner's screenshot, 2026-11-07) — the app's **existing**
      `toast.error` is used with sonner's built-in `description` (no new toast component): title
      "Not sent to HR yet" + "Fill in Date of OB and Purpose(s) first. They are marked in the
      form." The same sentence is the API's `REQUIRED_FIELD_MISSING` message. Every red cell now
      also prints its own plain-English instruction (`shared/src/ob-required.ts` `hint`), including
      From / To / Purpose(s) / signature / empty itinerary; the header date grid uses
      `items-start` so one hint cannot lift a column above its neighbours. Save / submit / export /
      AI failures go through `friendlyError()` so codes and server dumps never reach a toast.
      `npm run typecheck` and `npm run lint` pass for shared, api and web.
- [x] Waiting-for-HR card no longer repeats an old rejection (owner's reference, 2026-11-07) —
      the `submitted` + `resubmits > 0` card is now four current-trip facts (`Resubmitted`,
      `You changed` with `Was: …` from `resubmit_history.changes`, `Submission` with the ordinal
      and "Sent back N times", `Waiting for`); `Rejected before` / `Their reason` /
      `Rejected before by` / `Reason then` are removed, and reviewer/date/reason stay only in
      `case "rejected"`. `ObStatusLine` drops the amber "Resubmitted …" tail and the duplicate
      summary on resubmits. Existing `StatusBadge` / `ProfileAvatar` / `FieldValue` / `FieldNote`
      and all card styles are unchanged — structure and data only. Edited-after-approval copy
      matches the reference sentence. `npm run typecheck` and `npm run lint` pass (0 errors,
      6 pre-existing warnings); `buildStatusCard` output verified with a `tsx` probe.
- [x] DTR / form "Save as PDF" includes B2 attachments (owner's screenshot, 2026-11-09) —
      B2 presigned links send `Access-Control-Allow-Origin: null`, so `fetch()` of an attachment's
      bytes was blocked and the export warned "2 attachments could not be added to the PDF."
      `GET /api/files/attachment?url=…` (behind `authenticate`) now relays the bytes same-origin;
      `web/src/lib/attachment-file.ts` `fetchAttachmentBytes()` is used by `save-pdf.ts` and the
      Download button, with `credentials: "include"` for cross-origin API deployments. The guard
      accepts only signed HTTPS links on the configured Supabase / B2 hosts under
      `FormAttachement/`. `npm run typecheck` and `npm run lint` pass for shared, api and web
      (0 errors, 6 pre-existing `react-refresh` warnings).
- [x] DTR loading skeletons match the current page (owner's request, 2026-11-09) — DTR was the
      only editor still using the old shared `EditorSkeleton`, which drew the pre-card-stack page.
      New `RecordEditorSkeleton` mirrors the back link / eyebrow / title + three actions, the
      `lg:26rem` / `xl:30rem` two-pane grid, three stacked form cards (record details, five-column
      daily entries, other attachments) and the preview column (attachment card with the lifted
      APPROVED seal, "Live preview" row, A4 sheet with letterhead, 4-column header boxes,
      month/year row, five-column log and both signature rules). New `RecordsListSkeleton` mirrors
      `RecordCard`'s name / ID, Open + Delete buttons, period / updated lines and the exact
      `6.25rem × 4.75rem` mini-sheet thumbnail; conditional extras (deletion notice, APPROVED
      seal) are intentionally omitted. `RecordEditor` / `RecordsList` rewired, obsolete generic
      `EditorSkeleton` deleted, stale comments in `Skeletons.tsx` and `FormUnavailable.tsx`
      corrected. `npm run typecheck` and `npm run lint` pass (0 errors, 6 pre-existing warnings).
- [x] Onboarding reappears on every sign-in (owner's report, 2026-11-09) — the "seen" flag was
      permanent `localStorage` (`swiftslip.onboarding.seen:<id>`) and was never cleared, so
      `needsOnboarding()` short-circuited every later login; it also only checked `full_name`, so a
      saved name hid the welcome even when work details / signature were still missing.
      `resetOnboardingSession()` now clears seen + step keys at sign-in (after the cookie is
      confirmed) and at sign-out, and the gate uses `gapCount(profileGaps(profile)) > 0`. Skipping
      still quiets the welcome for that sign-in; a complete profile never sees it. Sign-in also
      drops the cached `["profile"]` query so another account cannot inherit the old profile.
      `OnboardingFlow` opens on the first unfinished step. `npm run typecheck` and `npm run lint`
      pass (0 errors, 6 pre-existing warnings); 11 gate assertions pass in a `tsx` probe.
- [x] Onboarding exits through the app chooser (owner's request, 2026-11-09) — the Done card used
      to say "Go to Daily Time Record" and hardcode `/records`, so a first sign-in that diverted to
      `/onboarding` skipped `/choose` entirely and users with several granted apps never saw the
      picker. `enterApp()` now marks the welcome seen and navigates to `/choose`; the button reads
      "Continue". `/choose` stays the single source of truth: 2+ apps → picker, 1 app →
      `APP_HOME` auto-redirect. `npm run typecheck` and `npm run lint` pass (0 errors, 6
      pre-existing warnings).
- [x] OB RETURN column shows date + time on every signed arrival (owner's request, 2026-11-09) —
      once HR signs the arrival, the cell prints the time on top and HR's typed `arrival_date`
      below it (`10:40 AM` / `10/13/2026`); a form with NO signed arrival keeps a bare time (or a
      blank cell). No same-day exception: an earlier version hid the date when `arrival_date`
      equalled `date_of_ob`, but Sign arrival prefills exactly that value, so a completed form
      showed only `12:00 PM`. New shared `time-of-display.ts` (renamed from
      `return-display.ts`) feeds `ObPreview` (preview, print, Save-as-PDF), the HR detail
      "Return time" row (`ReviewField.subValue`) and the Word
      `{time_return}` token via `\n` + `linebreaks: true`. `arrival_time` covers a blank itinerary
      RETURN; legacy rows without `arrival_date` fall back to `arrival_signed_at`. **Overdue is
      unchanged** — the owner confirmed it is correctly derived from the Date of OB having passed.
      Sign arrival still prefills Date of OB, so a late return prints the date HR typed unless HR
      changes it (owner chose the display fix, not a prefill/data fix). `npm run typecheck` and
      `npm run lint` pass (0 errors, 6 pre-existing warnings); `tsx` probes pass.
- [x] OB DEPARTURE column shows HR's signed time when the planned cell is blank (owner's
      request, 2026-11-09) — a completed form no longer prints an empty DEPARTURE column while
      EXIT CLEARANCE shows `10:47 AM`. `time-of-display.ts` (renamed from `return-display.ts`)
      adds `obDepartureTime(row, hr)`: the employee's `time_departure` wins, HR's
      `departure_time` only fills a blank cell when `departure_signed_at` exists, and unsigned /
      padded rows stay blank. `ObPreview` (preview, print, Save-as-PDF), the HR detail
      "Departure time" row and the Word `{time_departure}` token all use it. DEPARTURE prints
      time only — the date is already in Date of OB + EXIT CLEARANCE. RETURN's two-line rule and
      Overdue derivation are unchanged. `npm run typecheck` and `npm run lint` pass (0 errors,
      6 pre-existing warnings); `tsx` probe passes.
- [x] OB DEPARTURE is time-only; RETURN date only on a late return; HR's signed times shown in the
      employee form (owner's request, 2026-11-09) — supersedes the "date on every signed arrival"
      rule above. `time-of-display.ts` `obDepartureDisplay()` now always returns `date: ""`;
      `obReturnDisplay()` takes `dateOfOb` and emits `arrival.date` only when it differs from
      `formatMonthDayYear(date_of_ob)`. `ObItineraryTable` shows HR's raw signed time inside a
      blank planned departure/return input, keeps the "HR recorded: <time>" note below it, and
      top-aligns the two fields so the note no longer shifts the return label; `ObEditor` passes
      the HR columns and Date of OB. Preview / lightbox / print / Save-as-PDF / HR rows / Word all
      use the same helpers.
      `npm run typecheck` and `npm run lint` pass (0 errors, 6 pre-existing warnings);
      `.ob-time-probe.ts` passes.
- [x] HR detail shows who is being reviewed — `ObEmployeeProfile` resolved server-side from the
      owner's profile (`employeeProfile` in `hr.service.ts`) and rendered by
      `EmployeeProfileCard`: gradient profile banner, photo, name, ID, department, position,
      office, supervisor and their five latest OB forms. The queue row also carries the employee's
      photo (`employee_photo`, signed per response).
- [x] Notification delivery + identity — the bell refreshes over the shared SSE stream (no 30 s
      poll); `NotificationService.notify` publishes one targeted ping per recipient after the row
      is written so a tab cannot refetch before the notification exists. Each row has a kind icon
      (`features/hr/lib/notification-meta.ts`), unread dot and the actor's photo plus
      "by Name · Position". Hard-coded "HR reviewer" notes now show the reviewer's position
      (falling back to "HR").
- [x] Sidebar account UX — the "Account / My Account" nav row is gone from the main, HR and Admin
      sidebars; the footer identity block is a link to the matching profile route and its caption
      is **Role - Position** (`accountCaption`, e.g. "Administrator - IT Support") instead of the
      old "HR reviewer".
- [x] OB preview follows the completed paper form: the Exit clearance rows auto-fill from the
      HR departure/arrival signatures (typed date/time, residence, destination, return-leg swap)
      and "Verified by: HRD" fills with the approver's name + saved signature. Signer ids are
      resolved to names/signatures on read (`resolveObSigners`) for both the employee and HR views.
      Format per the owner's photo, after his review round: the first cell prints the **label
      only** (no date/time line above it), the guard/HR cell prints a **small signature, then
      time, then date** sitting **on the underline** like the residence/destination boxes, sized
      and wrapped so it can never spill over the cell's edge on a narrow screen (one line at A4
      width), and the HRD cell prints **signature → name → position** (the signer's
      `profiles.designation`). The Word download fills the same boxes — tokens added by
      `tokenize-ob-template.mjs`, which no longer writes the `{departure_when}`/`{arrival_when}`
      lines and now renders a full fill *and* an empty fill to validate
      before writing `public/ob_form_template.docx`.
- [x] OB status cards (owner's reference mock, 2026-11-06) — `ObStatusLine` (dot + status · name
      · id · one-line summary) under the title on **both** screens, and one status card for the
      form's current state: at the top of the **form column** in `ObEditor`, at the top of the
      **rail** in `HrObDetailPage` (the approve/reject action card stays below it). One builder,
      `web/src/features/official-business/lib/status-card.ts`, derives the state (Overdue is
      derived, never stored) and every row for both audiences — HR stacks label-left/value-right
      rows, the employee lays the same facts out in columns — so the header line, the card and
      the two screens can never disagree. Cards render nothing before submission (draft).
- [x] `shared/src/hr.ts` — statuses/labels (`waiting_supervisor` included), `ObHrFields`,
      `isObLocked` (only `submitted`), `needsReapprovalAfterSave`, supervisor helpers,
      notification kinds; `APP_KEYS` / `GRANTABLE_APP_KEYS` / `APP_HOME` += `hr`;
      zod inputs (`submitObInput`, `rejectObInput`, `signDepartureInput`, `signArrivalInput`,
      `markNotificationsReadInput`), API types, activity labels
- [x] `apps/hr` — `GET /hr/ob` (queue, drafts excluded), `GET /hr/ob/:id`,
      `POST /hr/ob/:id/approve` (→ `waiting_supervisor` | `approved`), `/reject` (reason
      required), `/sign-departure`, `/sign-arrival`; guarded `authenticate, requireApp('hr')`
- [x] `apps/notifications` — `GET /notifications`, `POST /notifications/read`;
      `ob.submitted` / `ob.resubmitted` → HR, `ob.approved` / `ob.rejected` /
      `ob.departure_signed` → employee (no arrival notification)
- [x] OB: `POST /official-business/:id/submit`; `FORM_LOCKED` only while `submitted`;
      save returns the resulting `hr_status`; content edits on `approved|completed` send it
      back to `submitted` (HR re-approval); supervisor-only saves keep `departed` and its
      signed departure, and promote `waiting_supervisor` → `approved`; delete stays
      owner-only and works in **every** status
- [x] Access: HR auto-grant for department `"HR Department"` or a position under it
      (explicit rules still win; admins bypass); default OFF
- [x] Web: `api/hr.functions.ts` + `notifications.functions.ts`, `features/hr/**`
      (layout, queue, detail with five progress steps, status chip, notification bell,
      queries/actions), routes `/hr`, `/hr/ob/$id` and `/hr/profile`; `ObList` chip + delete in every
      status; `ObEditor` banner/reject/submit/lock; bell in the employee sidebar, the
      mobile header and the HR queue header; `AppAccess` / `ActivityLogs` labels
- [x] HR UI: reference-led approval desk — grouped queue table, live Review queue /
      Completed nav counts (`?view=completed`), SwiftSlip page gradient + sidebar
      palette + Geist type (HR + Account nav only), shared form-list empty states,
      admin-style underline search, detail with five-step stepper, itinerary chips,
      Exit clearance timeline, supervisor-slip rail and scaled live preview. My
      Account lives at `/hr/profile` so it stays inside the HR shell.
- [x] Post-approval edits wait as a draft; a resubmission can be withdrawn (owner's request,
      2026-11-09) — a content save on an `approved` / `departed` / `completed` /
      `waiting_supervisor` form no longer rewrites the live row and re-queues it. The edit is
      stored whole in `ob_forms.pending_content` (employee header fields + itinerary),
      `hr_status` and HR's sign-offs stay untouched, so HR keeps reviewing the version it
      approved. `GET /official-business/:id` overlays the draft for its owner and returns
      `pending_changes`; the employee list badges it as "Draft changes". "Resubmit to HR" (a
      status-card action, and the only submit path for those statuses) applies the draft, stashes
      the approved version in `previous_content` and records `from_status` /
      `previous_submitted_at` / HR's sign-off snapshot on the `edited` resubmit event.
      `POST /official-business/:id/cancel-resubmit` restores that version and its sign-offs, moves
      the sent content back into `pending_content` (nothing typed is lost), pops the event and
      decrements `resubmit_count`; it is offered only while `submitted` after an `edited`
      resubmit (first submissions and post-rejection resubmits have no Cancel). Supervisor fields
      stay live writes. Internal blobs are stripped from both the employee and HR payloads.
      Migration `0039_ob_resubmit_draft.sql` adds the two jsonb columns.
      `npm run typecheck` and `npm run lint` pass (0 errors, 6 pre-existing warnings).
- [x] `npm run typecheck` and `npm run lint` pass for shared, api and web
- [ ] **Owner to run:** paste `0035_hr_approval.sql`, `0036_ob_arrival_signoff.sql`,
      `0037_ob_resubmit.sql`, `0038_ob_resubmit_snapshot.sql` **and**
      `0039_ob_resubmit_draft.sql` in the Supabase SQL Editor **before** deploying, then sign in as
      an HR account and walk one OB form
      through Submit → Approve (with and without the supervisor signature) → Sign departure.
      **`0036` was checked against the live DB on 2026-11-06: the arrival half IS applied**
      (`ob_forms.arrival_date` reads back and `POST /hr/ob/:id/sign-arrival` has signed an
      arrival since), **but the four status-card columns added on 2026-11-06 are not** — they
      are ABSENT from `ob_forms`. Paste `0036_ob_arrival_signoff.sql` **again**: every statement
      is `IF NOT EXISTS` / NULL-guarded, so re-running it only adds the four columns and fills
      them in. Until then the status cards show "—" for *Rejected on*, *Employee told*,
      *Waiting for* and *Supervisor approved*.
      On the unsigned-supervisor copy, confirm arrival is refused, then save only the
      supervisor name + slip as the employee and confirm the departure is kept and
      arrival can now be signed. Also test Reject → edit → Resubmit and one
      edit-after-approval → re-approve, checking the bell on both sides and that the form shows
      "Resubmitted ×N" in the queue, the employee card and the status card. Try submitting with a
      blank required cell (web must refuse; a direct POST must return `REQUIRED_FIELD_MISSING`).
      Confirm the preview's
      Exit clearance fills after departure/arrival (signature, then time, then date, with the
      date/time printed in the guard cell rather than above the label) and
      "Verified by: HRD" fills with signature, name and position after approval — then press
      **Download Word** and confirm the .docx prints the same boxes, still on one page.
      Not tested against the real database.

Intentional behaviour (do not "fix" back):
- Drafts and empty scaffolds never reach the HR queue; the employee must press
  *Submit for HR approval*. Only `submitted` is read-only. `rejected`,
  `waiting_supervisor`, `approved`, `departed` and `completed` are editable; a
  content change on an already-approved/completed form is **saved as a draft**
  (`pending_content`) and HR keeps the approved version until the employee presses
  *Resubmit to HR*. A supervisor-only save on a departed form keeps it departed,
  so the employee can add the missing signature without losing the signed
  departure. While an edited resubmission is waiting, *Cancel* restores the
  approved version and keeps the employee's text as a draft; it is never offered
  for a first submission or a resubmit after rejection.
- The owner can delete their form in any status (completed included); HR cannot delete.
- The supervisor indicator never blocks HR's approval **or departure**: HR can sign out a
  form in `waiting_supervisor`. It does block completion — `sign-arrival` is refused until
  the supervisor name + ticked approval slip are saved.
- HR recipients = profiles with `department = "HR Department"` or a `designation` under it;
  the submitter is excluded. The bell and queue refresh over the shared SSE stream (see the
  activity log entry for 2026-11-07) — no 30 s polling; opening the bell marks all read.

## 4. Cookie / auth contract (Phase 2, needed by Phase 5)

- Cookie name `swiftslip-session`, `httpOnly`, `sameSite=lax`, `secure` in production, 12 h.
- Value = `base64url(json).hmacSHA256` signed with `SESSION_SECRET`. Payload: `{id, role, label, idNumber, pw, exp}`.
- `pw` = first 16 hex of SHA-256 of the stored `password_hash`; changing a password signs out other devices.
- Every request re-reads `users` (role/deleted/pw changes apply immediately).
- The browser must send `credentials: 'include'`; the API sets `cors({ credentials: true, origin: CORS_ORIGIN })`.

### Endpoints (all under `/api`)

| Method | Path | Who | Body / query | Returns `document` |
| --- | --- | --- | --- | --- |
| POST | `/auth/sign-in` | public | `signInInput` | `SessionUser` |
| POST | `/auth/sign-out` | public | – | – |
| GET | `/auth/session` | public | – | `SessionUser & {apps}` or none when signed out |
| POST | `/auth/change-password` | user | `changePasswordInput` | – |
| GET | `/users` | admin | – | `documents`: accounts + profile details |
| POST | `/users` | admin | `createUserInput` | – |
| PATCH | `/users/:id` | admin | `updateUserInput` | – |
| DELETE | `/users/:id` | admin | – | – |
| GET | `/profile/me` | user | – | `EmployeeProfile` |
| PUT | `/profile/me` | user | `employeeProfileSchema` | `EmployeeProfile` |
| GET | `/access/overview` | admin | – | people, rules, defaults, departments, positions |
| PUT | `/access/rules` | admin | `accessRuleInput` | – |
| PUT | `/access/defaults` | admin | `appDefaultInput` | – |
| DELETE | `/access/rules/:id` | admin | – | – |
| GET | `/org-options` | user | – | `OrgLists` |
| POST | `/org-options` | admin | `addOrgOptionInput` | – |
| PATCH | `/org-options` | admin | `renameOrgOptionInput` | – |
| DELETE | `/org-options?kind=&value=` | admin | `orgKindInput` (query) | – |
| GET | `/admin/stats` | admin | – | `AdminStats` |
| GET | `/activity-logs` | admin | `listActivityLogsQuery` | `documents` + `total` |
| GET | `/activity-logs/counts` | admin | `activityLogRangeInput` (query) | counts |
| GET | `/activity-logs/feed?feed=` | admin | `activityLogFeedInput` (query) | `documents` |
| GET | `/records` · `/official-business` · `/loa` · `/cos` · `/ot` | user | – | `documents` (own rows, newest first) |
| GET | `/<form>/:id` | user | – | `{form\|record, entries\|schedules, attachment?, others?}` |
| POST | `/<form>` | user | `create…Input` | `{id}` (prefilled from the profile) |
| PUT | `/<form>/:id` | user | `save…Input` minus `id` | – |
| DELETE | `/<form>/:id?quiet=` | user | `deleteRowQuery` | – |
| POST / GET / DELETE | `/<form>/:id/attachment` | user | `attachmentUploadInput` | `{name}` / `{url,name}` or none / `{name}` |
| POST / GET / DELETE | `/loa\|ot/:id/other-attachments[?path=]` | user | `attachmentUploadInput` | `{name}` / `{path: url}` / `{name}` |
| POST | `/ai/ob/purpose` · `/ai/ob/chat` · `/ai/loa/reason` · `/ai/loa/chat` · `/ai/cos/reason` · `/ai/cos/chat` · `/ai/ot/reason` · `/ai/ot/chat` | user | matching `…Input` | `{purpose\|reason}` / chat reply |
| POST | `/biometric-import` | user | `importBiometricInput` | `ImportedLog` |
| POST | `/files` | user | `fileUploadInput` | `{key,name}` (optional B2 store; 503 when off) |
| GET | `/files/url?key=` | user | `fileKeyQuery` (query) | `{url,name,mimeType}` (5-min presigned GET) |
| DELETE | `/files?key=` | user | `fileKeyQuery` (query) | `{key,name}` |
| GET | `/inventory/data` | inventory | – | `InventoryData` (branches, lookups, assets) |
| POST | `/inventory/assets` | inventory | `assetSaveInput` minus `assetId` | `{assetId}` |
| PUT | `/inventory/assets/:id` | inventory | `assetSaveInput` minus `assetId` | `{assetId}` |
| POST | `/inventory/assets/bulk-delete` | inventory | `deleteAssetsInput` | `{deleted}` |
| GET | `/inventory/options` | inventory | – | `ManagedOptions` |
| POST | `/inventory/options` | inventory | `createOptionInput` | – (409 on duplicate) |
| POST | `/inventory/options/quick` | inventory | `createOptionInput` | `CreatedOption` |
| PATCH | `/inventory/options` | inventory | `renameOptionInput` | – |
| DELETE | `/inventory/options?kind=&id=` | inventory | `deleteOptionQuery` | – |
| GET | `/inventory/reports/:branchId` | inventory | – | `InventoryReportDocument` |
| POST | `/inventory/reports/downloads` | inventory | `reportDownloadInput` | – |
| POST | `/official-business/:id/submit` | user | – | – (draft\|rejected → submitted) |
| GET | `/hr/ob` | hr | – | `documents` (OB queue, drafts excluded) |
| GET | `/hr/ob/:id` | hr | – | `{form, entries, attachment?}` |
| POST | `/hr/ob/:id/approve` | hr | – | – (submitted → approved) |
| POST | `/hr/ob/:id/reject` | hr | `rejectObInput` | – (submitted → rejected) |
| POST | `/hr/ob/:id/sign-departure` | hr | `signDepartureInput` | – (waiting_supervisor/approved → departed) |
| POST | `/hr/ob/:id/sign-arrival` | hr | `signArrivalInput` | – (departed → completed) |
| GET | `/notifications` | user | – | `{unread, documents}` |
| POST | `/notifications/read` | user | `markNotificationsReadInput` | – (marks all read) |

## 5. Smoke test (after `npm run setup` and filling `api/.env`)

```sh
npm run dev:api
curl -i localhost:9095/health
curl -i localhost:9095/health/db
curl -i -c jar -H 'content-type: application/json' \
  -d '{"idNumber":"<id>","password":"<pw>"}' localhost:9095/api/auth/sign-in
curl -b jar localhost:9095/api/auth/session
curl -b jar localhost:9095/api/users          # admin only → 403 for a normal user
curl -b jar -X POST localhost:9095/api/auth/sign-out
```

Known behaviour changes in Phase 2 (intentional, listed so nobody "fixes" them back):
- The old "pending migration" fallbacks (retry without `department`/`signature`/…) are gone;
  the database must have migrations **through 0029** applied (`0027` adds `ticketing` to the `app_access_rules` CHECK;
  `0028` adds `retention_settings` + `cleanup_runs`, needed by Admin Panel → Settings → Data retention;
  `0029` lifts the 30-day floor on the keep period — only needed if `0028` was applied before 2026-10-29).
- Phase 9 needs **`0035_hr_approval.sql`** applied before the HR app is usable (`hr` rule storage,
  `ob_forms.hr_status`, `notifications`). Without it the `/hr` and `/notifications` calls error.
  Apply **`0036_ob_arrival_signoff.sql`** as well; without it `sign-arrival` cannot store the
  typed arrival date/time and the OB preview's arrival box stays empty. Apply
  **`0037_ob_resubmit.sql`** for the resubmit badge/history; without it the API's selects and the
  submit update reference missing columns, so it must be applied before deploying this code.
- Sign-in failure delay and throttle numbers are unchanged (10 per ID / 20 per IP / 15 min, 250 ms).
