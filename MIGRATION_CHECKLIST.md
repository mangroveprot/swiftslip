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

Added per `STORAGE_GUIDE.md` as a **second, optional** storage backend for future features. The
existing Supabase Storage attachments are untouched.
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
- Sign-in failure delay and throttle numbers are unchanged (10 per ID / 20 per IP / 15 min, 250 ms).
