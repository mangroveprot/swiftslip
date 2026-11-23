# SwiftSlip API — complete error catalogue

Scope: `api/` at commit state of the working tree, read-only audit.
Method: every `new ErrorResponse(` in `api/src`, plus the middleware / framework paths that can
answer without one. Line numbers are 1-based and refer to the files as they exist now.

Layout: §1–§23 are the module tables (grouped by module), the unnumbered section after them lists
failure modes that never produce an `ErrorResponse`, and **Taxonomy** closes the catalogue by bucketing
every entry into the kinds the UI needs. Appendix A (findings) and Appendix B (coverage) are analysis,
not part of the table.

**Counts**

| Metric | Value |
| --- | --- |
| App modules under `api/src/apps` | 24 |
| Files containing `new ErrorResponse(` | 55 |
| Throw sites (`new ErrorResponse(`) | 266 |
| Distinct `(code, message)` pairs | 88 (16 with the codes.ts default text, 72 with a custom message) |
| Codes defined in `codes.ts` | 19 |
| Codes actually raised | 19 (every one is used) |

Envelope for every row below (`ApiResponse.error`, `api/src/common/shared/utils/response/api-response.ts:26`):

```json
{ "success": false, "error": { "status": 400, "code": "CODE", "message": "…", "suggestions": [] } }
```

`status` is always taken from the `codes.ts` table (`ErrorResponse` constructor, `response.ts:17-19`),
so a code can never contradict its HTTP status — the only way to get a different status is to pick a
different code. `suggestions` defaults to `[]` (`response.ts:12`).

---

## 1. Core, framework and cross-cutting middleware

| Module | Route | Code | HTTP | Message (exact) | Trigger condition | File:line |
| --- | --- | --- | --- | --- | --- | --- |
| auth guard | every route behind `authenticate` | `UNAUTHORIZED` | 401 | `Please sign in first.` | No cookie, malformed/tampered HMAC, expired `exp`, account deleted, unknown role, or password changed since the cookie was issued | `apps/auth/middlewares/auth.middleware.ts:14` |
| admin guard | every admin-only route | `FORBIDDEN` | 403 | `Only an administrator can do this.` | `req.user.role !== 'admin'` | `apps/auth/middlewares/auth.middleware.ts:31` |
| access guard | `/api/hr/*`, `/api/inventory/*` | `FORBIDDEN` | 403 | `You do not have access to this application.` | `AccessService.canAccess(user, app)` is false | `apps/access/middlewares/access.middleware.ts:26` |
| access guard | same routes | `UNAUTHORIZED` | 401 | `Please sign in first.` | `req.user` missing — unreachable after `authenticate` | `apps/access/middlewares/access.middleware.ts:21` |
| `validate()` | every route that declares a schema (body, query or params) | `VALIDATION_ERROR` | 400 | `Validation error` | `schema.safeParse` fails; `suggestions` = `["path: message", …]` | `common/shared/middlewares/validate.ts:27` |
| rate limiter | all `/api/*` except `/api/updates/stream` | `TOO_MANY_REQUESTS` | 429 | `Too many requests. Please try again later.` | More than `RATE_LIMIT_MAX` (default 300) requests per `RATE_LIMIT_WINDOW_MS` (default 15 min) per IP | `common/shared/middlewares/rate-limiter.ts:22` |
| body parser | any route with a JSON body | `BAD_REQUEST` | 400 | `The request body is not valid JSON.` | body-parser `entity.parse.failed` | `common/shared/utils/error/global.ts:14` |
| body parser | any route | `PAYLOAD_TOO_LARGE` | 413 | `The request is too large.` | body-parser `entity.too.large`; body over `BODY_LIMIT` (default `15mb`) | `common/shared/utils/error/global.ts:20` |
| global handler | any unmatched route | `NOT_FOUND_ERROR` | 404 | `Resources Not Found` | No route matched (`app.use(NotFoundHandler)` is last) | `common/shared/utils/error/notFound.ts:5` |
| global handler | any | `GENERAL_ERROR` | 500 | `An unexpected error occurred.` (non-production: the real `err.message`) | A non-`ErrorResponse` reached the error handler | `common/shared/utils/error/global.ts:47` |
| `ApiResponse.error` | any controller `catch` | `INTERNAL_SERVER_ERROR` | 500 | `Internal Server Error` (non-production: the real `error.message`) | Controller caught something that is not an `ErrorResponse` | `common/shared/utils/response/api-response.ts:41` |
| `BaseService` | every table-backed service method | `INTERNAL_SERVER_ERROR` | 500 | the raw `error.message` | Any non-`ErrorResponse` thrown by a repository | `core/engine/base/_services/base.service.ts:47,71,132,159,183` |
| `BaseService.findOne` | base `get` methods | `NOT_FOUND_ERROR` | 404 | `The requested document was not found.` | `findOne` returned null | `core/engine/base/_services/base.service.ts:59` |
| `BaseService.update` | base `save` methods | `NOT_FOUND_ERROR` | 404 | `Document to update not found.` | Update matched no row | `core/engine/base/_services/base.service.ts:147` |
| `BaseService.delete` | base `remove` methods | `NOT_FOUND_ERROR` | 404 | `Document to delete not found.` | Delete matched no row | `core/engine/base/_services/base.service.ts:171` |
| `BaseRepository.fail` | any Supabase table op | `UNIQUE_FIELD_ERROR` | 409 | `A field that is supposed to be unique already exists.` `suggestions` = `[error.details]` | Postgres `23505` | `core/engine/base/_repositories/base.repository.ts:117` |
| `BaseRepository.fail` | any Supabase table op | `BAD_REQUEST` | 400 | `A referenced record does not exist, or is still in use.` | Postgres `23503` (FK violation) | `core/engine/base/_repositories/base.repository.ts:124` |
| `BaseRepository.fail` | any Supabase table op | `REQUIRED_FIELD_MISSING` | 400 | the raw Postgres `error.message` | Postgres `23502` (NOT NULL violation) | `core/engine/base/_repositories/base.repository.ts:131` |
| `BaseRepository.fail` | any Supabase table op | `BAD_REQUEST` | 400 | `A value has the wrong format.` | Postgres `22P02`, `22007`, `22008` | `core/engine/base/_repositories/base.repository.ts:140` |
| `BaseRepository.fail` | any Supabase table op | `NOT_FOUND_ERROR` | 404 | `The requested item could not be found.` | PostgREST `PGRST116` (0 rows for `.single()`) | `core/engine/base/_repositories/base.repository.ts:147` |
| `BaseRepository.fail` | any Supabase table op | `DATABASE_ERROR` | 500 | the raw Postgres `error.message` | Any other PostgREST/Postgres error | `core/engine/base/_repositories/base.repository.ts:149` |
| `BaseRepository` | `update` / `delete` | `BAD_REQUEST` | 400 | `Refusing to update without a filter.` / `Refusing to delete without a filter.` | Empty filter object (programming-error guard) | `core/engine/base/_repositories/base.repository.ts:156` |
| `RgcRepository` | any `/api/inventory/*` op | `REFERENCED_ERROR` | 409 | `Cannot delete: still referenced by other records. Reassign or remove those first.` | SQLSTATE `23503` or message matching `/FOREIGN KEY\|still assigned\|cannot delete/i` | `core/engine/base/_repositories/rgc.repository.ts:33` |
| `RgcRepository` | any `/api/inventory/*` op | `UNIQUE_FIELD_ERROR` | 409 | `A field that is supposed to be unique already exists.` | SQLSTATE `23505` | `core/engine/base/_repositories/rgc.repository.ts:36` |
| `RgcRepository` | any `/api/inventory/*` op | `BAD_REQUEST` | 400 | the raw `raise exception` text from the DB trigger | SQLSTATE `P0001` (e.g. desktop details on a non-desktop type) | `core/engine/base/_repositories/rgc.repository.ts:38` |
| `RgcRepository` | any `/api/inventory/*` op | `DATABASE_ERROR` | 500 | the raw driver message (`original.message ?? String(error)`) | Any other Postgres/driver error | `core/engine/base/_repositories/rgc.repository.ts:42` |
| health | `GET /health/db` | `SERVICE_UNAVAILABLE` | 503 | `The database is unreachable.` | `Databases.supabase.check()` returns `ok: false` | `common/global-router/default.ts:46` |
| health | `GET /health/inventory-db` | `SERVICE_UNAVAILABLE` | 503 | `The inventory database is unreachable.` | `Databases.rgc.check()` returns `ok: false` | `common/global-router/default.ts:31` |
| inventory DB | any `/api/inventory/*` | `SERVICE_UNAVAILABLE` | 503 | `The inventory database is not configured. Set RGC_INVENTORY_DATABASE_URL in api/.env.` | `RGC_INVENTORY_DATABASE_URL` unset (lazy, on first query) | `core/framework/databases/postgres/client.ts:22` |

---

## 2. auth — `/api/auth`

| Module | Route | Code | HTTP | Message (exact) | Trigger condition | File:line |
| --- | --- | --- | --- | --- | --- | --- |
| auth | `POST /api/auth/sign-in` | `TOO_MANY_REQUESTS` | 429 | `Too many sign-in attempts. Please wait 15 minutes and try again.` | ≥10 failures for that ID number **or** ≥20 for that IP within 15 min (counted from the activity log) | `apps/auth/services/auth.service.ts:48` |
| auth | `POST /api/auth/sign-in` | `UNAUTHORIZED` | 401 | `Wrong ID number or password.` | Unknown ID number or bad password (after a 250 ms delay and a `signin.failed` log row) | `apps/auth/services/auth.service.ts:73` |
| auth | `POST /api/auth/sign-in` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | Any unexpected throw, **including a failed activity-log read** — the throttle fails closed | `apps/auth/services/auth.service.ts:122` |
| auth | `GET /api/auth/session` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | `AccessService.resolveApps` throws | `apps/auth/services/auth.service.ts:145` |
| auth | `POST /api/auth/change-password` | `VALIDATION_ERROR` | 400 | `Password must be at least 4 characters.` | New password shorter than `PASSWORD_MIN_LENGTH` (4, `shared/src/schemas.ts:628`) | `apps/auth/services/auth.service.ts:160` |
| auth | `POST /api/auth/change-password` | `BAD_REQUEST` | 400 | `Current password is incorrect.` | Row missing, or `currentPassword` does not verify | `apps/auth/services/auth.service.ts:173` |
| auth | `POST /api/auth/change-password` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | Hash or update fails | `apps/auth/services/auth.service.ts:189` |
| auth | `POST /api/auth/sign-out` | — | 200 | — | Always succeeds; clears the cookie | `apps/auth/controllers/auth.controller.ts` |

---

## 3. users — `/api/users` (admin only)

| Module | Route | Code | HTTP | Message (exact) | Trigger condition | File:line |
| --- | --- | --- | --- | --- | --- | --- |
| users | `GET /api/users` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | List query throws | `apps/users/services/user.service.ts:117` |
| users | `GET /api/users/:id/card` | `NOT_FOUND_ERROR` | 404 | `That account no longer exists.` | Account row gone (e.g. a deleted actor in an old log page) | `apps/users/services/user.service.ts:143` |
| users | `GET /api/users/:id/card` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | Card read throws | `apps/users/services/user.service.ts:180` |
| users | `GET /api/users/photos` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | Photo lookup throws | `apps/users/services/user.service.ts:226` |
| users | `POST /api/users` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | Create throws | `apps/users/services/user.service.ts:181` |
| users | `POST /api/users`, `PATCH /api/users/:id` | `VALIDATION_ERROR` | 400 | `Password must be at least 4 characters.` | `password` missing on create (required) or too short on either | `apps/users/services/user.service.ts:354` |
| users | `POST /api/users`, `PATCH /api/users/:id` | `UNIQUE_FIELD_ERROR` | 409 | `That ID number is already in use.` | Pre-check `idNumberInUse` finds another account | `apps/users/services/user.service.ts:363` |
| users | `POST /api/users`, `PATCH /api/users/:id` | `UNIQUE_FIELD_ERROR` | 409 | `That ID number is already in use.` | Same race, caught from the `23505` raised by the DB (`duplicateToFriendly`) | `apps/users/services/user.service.ts:373` |
| users | `PATCH /api/users/:id` | `NOT_FOUND_ERROR` | 404 | `That account no longer exists.` | Account row gone between list and save | `apps/users/services/user.service.ts:244` |
| users | `PATCH /api/users/:id` | `BAD_REQUEST` | 400 | `Keep at least one administrator account.` | Demoting the last admin (`countAdmins(excludingId) === 0`) | `apps/users/services/user.service.ts:256` |
| users | `PATCH /api/users/:id` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | Update/profile write throws | `apps/users/services/user.service.ts:295` |
| users | `DELETE /api/users/:id` | `NOT_FOUND_ERROR` | 404 | `That account no longer exists.` | Row already deleted | `apps/users/services/user.service.ts:311` |
| users | `DELETE /api/users/:id` | `BAD_REQUEST` | 400 | `Keep at least one administrator account.` | Deleting the last admin | `apps/users/services/user.service.ts:320` |
| users | `DELETE /api/users/:id` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | Delete or file cleanup throws | `apps/users/services/user.service.ts:341` |

---

## 4. profile — `/api/profile`

| Module | Route | Code | HTTP | Message (exact) | Trigger condition | File:line |
| --- | --- | --- | --- | --- | --- | --- |
| profile | `GET /api/profile/me` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | Read throws | `apps/profile/services/profile.service.ts:53` |
| profile | `PUT /api/profile/me` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | Write throws | `apps/profile/services/profile.service.ts:103` |
| profile | `PUT /api/profile/me`, `PUT /api/profile/me/photo` | `VALIDATION_ERROR` | 400 | `That photo could not be read. Pick a JPG, PNG, GIF or WebP image.` | `photo` is not a `data:image/…;base64,…` URL | `apps/profile/services/photo-storage.ts:113` |
| profile | `PUT /api/profile/me`, `PUT /api/profile/me/photo` | `PAYLOAD_TOO_LARGE` | 413 | `That photo is too large.` | Decoded photo over `PROFILE_PHOTO_MAX_BYTES` (5 MB, `shared/src/schemas.ts`) | `apps/profile/services/photo-storage.ts:122` |
| profile | `PUT /api/profile/me/photo` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | Upload or row update throws | `apps/profile/services/profile.service.ts:178` |

---

## 5. access — `/api/access` (admin only)

| Module | Route | Code | HTTP | Message (exact) | Trigger condition | File:line |
| --- | --- | --- | --- | --- | --- | --- |
| access | `GET /api/access/overview` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | Overview query throws | `apps/access/services/access.service.ts:368` |
| access | `PUT /api/access/rules` | `BAD_REQUEST` | 400 | `That name is reserved.` | `scope: "department"` with `scope_value` equal to the internal `APP_DEFAULT_RULE_VALUE` | `apps/access/services/access.service.ts:155` |
| access | `PUT /api/access/rules` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | Upsert or log throws | `apps/access/services/access.service.ts:184` |
| access | `PUT /api/access/defaults` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | Write throws | `apps/access/services/access.service.ts:221` |
| access | `DELETE /api/access/rules/:id` | `NOT_FOUND_ERROR` | 404 | `That rule no longer exists.` | Delete matched no row (double click / stale list) | `apps/access/services/access.service.ts:238` |
| access | `DELETE /api/access/rules/:id` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | Delete throws | `apps/access/services/access.service.ts:255` |

---

## 6. activity-log — `/api/activity-logs` (admin only)

| Module | Route | Code | HTTP | Message (exact) | Trigger condition | File:line |
| --- | --- | --- | --- | --- | --- | --- |
| activity-log | `GET /api/activity-logs` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | Search query throws | `apps/activity-log/services/activity-log.service.ts:318` |
| activity-log | `GET /api/activity-logs/counts` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | Count query throws | `apps/activity-log/services/activity-log.service.ts:253` |
| activity-log | `GET /api/activity-logs/feed` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | Feed query throws | `apps/activity-log/services/activity-log.service.ts:200` |
| activity-log | *(internal — `POST /api/auth/sign-in`)* | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | `countRecentSignInFailures` throws → sign-in fails closed | `apps/activity-log/services/activity-log.service.ts:169` |

---

## 7. admin — `/api/admin`

| Module | Route | Code | HTTP | Message (exact) | Trigger condition | File:line |
| --- | --- | --- | --- | --- | --- | --- |
| admin | `GET /api/admin/stats` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | Any stat query throws | `apps/admin/services/admin.service.ts:128` |

---

## 8. org-options — `/api/org-options`

| Module | Route | Code | HTTP | Message (exact) | Trigger condition | File:line |
| --- | --- | --- | --- | --- | --- | --- |
| org-options | `GET /api/org-options` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | List read throws | `apps/org-options/services/org-option.service.ts:71` |
| org-options | `POST /api/org-options` (admin) | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | Insert or profile backfill throws (duplicates are silently ignored by design) | `apps/org-options/services/org-option.service.ts:123` |
| org-options | `PATCH /api/org-options` (admin) | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | Rename cascade throws | `apps/org-options/services/org-option.service.ts:191` |
| org-options | `DELETE /api/org-options` (admin) | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | Delete throws (FK from profiles surfaces as raw 500 here, see §18) | `apps/org-options/services/org-option.service.ts:262` |

---

## 9. notifications — `/api/notifications`

| Module | Route | Code | HTTP | Message (exact) | Trigger condition | File:line |
| --- | --- | --- | --- | --- | --- | --- |
| notifications | `GET /api/notifications`, `POST /api/notifications/read`, `POST /api/notifications/delete` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | Any read/write throws | `apps/notifications/services/notification.service.ts:38` |

---

## 10. updates — `/api/updates` (SSE)

| Module | Route | Code | HTTP | Message (exact) | Trigger condition | File:line |
| --- | --- | --- | --- | --- | --- | --- |
| updates | `GET /api/updates/stream` | `DATABASE_ERROR` | 500 | raw `error.message` | The `audit` probe query fails on connect | `apps/updates/repositories/updates.repo.ts:43` |
| updates | `GET /api/updates/stream` | `DATABASE_ERROR` | 500 | raw `error.message` | The incremental "anything newer?" probe fails | `apps/updates/repositories/updates.repo.ts:62` |

> Once `flushHeaders()` has run these two cannot be serialised as JSON — the browser sees a dropped
> `EventSource`, not the envelope. Exempt from the rate limiter (`rate-limiter.ts:19`).

---

## 11. Form modules: records / loa / cos / ot / liquidation

All five follow the same shape: a shared `toFailure()` at the top of the service, a `NOT_FOUND_ERROR`
per read/write, and the generic attachment sub-routes.

| Module | Route | Code | HTTP | Message (exact) | Trigger condition | File:line |
| --- | --- | --- | --- | --- | --- | --- |
| records | any `/api/records*` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | `toFailure` — anything that is not an `ErrorResponse` | `apps/records/services/record.service.ts:24` |
| records | `GET /api/records/:id` | `NOT_FOUND_ERROR` | 404 | `Record not found.` | Row missing or owned by someone else (`owner_id` scope) | `apps/records/services/record.service.ts:58` |
| records | `PUT /api/records/:id` | `NOT_FOUND_ERROR` | 404 | `Record not found.` | Row missing / not owned | `apps/records/services/record.service.ts:144` |
| records | `DELETE /api/records/:id` | `NOT_FOUND_ERROR` | 404 | `Record not found.` | Row already deleted | `apps/records/services/record.service.ts:166` |
| loa | any `/api/loa*` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | `toFailure` | `apps/loa/services/loa.service.ts:23` |
| loa | `GET /api/loa/:id` | `NOT_FOUND_ERROR` | 404 | `Form not found.` | Row missing / not owned | `apps/loa/services/loa.service.ts:55` |
| loa | `PUT /api/loa/:id` | `NOT_FOUND_ERROR` | 404 | `Form not found.` | Row missing / not owned | `apps/loa/services/loa.service.ts:138` |
| loa | `DELETE /api/loa/:id` | `NOT_FOUND_ERROR` | 404 | `Form not found.` | Row already deleted | `apps/loa/services/loa.service.ts:154` |
| cos | any `/api/cos*` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | `toFailure` | `apps/cos/services/cos.service.ts:20` |
| cos | `GET /api/cos/:id` | `NOT_FOUND_ERROR` | 404 | `Form not found.` | Row missing / not owned | `apps/cos/services/cos.service.ts:54` |
| cos | `PUT /api/cos/:id` | `NOT_FOUND_ERROR` | 404 | `Form not found.` | Row missing / not owned | `apps/cos/services/cos.service.ts:134` |
| cos | `DELETE /api/cos/:id` | `NOT_FOUND_ERROR` | 404 | `Form not found.` | Row already deleted | `apps/cos/services/cos.service.ts:156` |
| ot | any `/api/ot*` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | `toFailure` | `apps/ot/services/ot.service.ts:24` |
| ot | `GET /api/ot/:id` | `NOT_FOUND_ERROR` | 404 | `Form not found.` | Row missing / not owned | `apps/ot/services/ot.service.ts:58` |
| ot | `PUT /api/ot/:id` | `NOT_FOUND_ERROR` | 404 | `Form not found.` | Row missing / not owned | `apps/ot/services/ot.service.ts:144` |
| ot | `DELETE /api/ot/:id` | `NOT_FOUND_ERROR` | 404 | `Form not found.` | Row already deleted | `apps/ot/services/ot.service.ts:166` |
| liquidation | any `/api/liquidation*` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | `toFailure` | `apps/liquidation/services/liquidation.service.ts:22` |
| liquidation | `GET /api/liquidation/:id` | `NOT_FOUND_ERROR` | 404 | `Form not found.` | Row missing / not owned | `apps/liquidation/services/liquidation.service.ts:81` |
| liquidation | `PUT /api/liquidation/:id` | `NOT_FOUND_ERROR` | 404 | `Form not found.` | Row missing / not owned | `apps/liquidation/services/liquidation.service.ts:168` |
| liquidation | `DELETE /api/liquidation/:id` | `NOT_FOUND_ERROR` | 404 | `Form not found.` | Row already deleted | `apps/liquidation/services/liquidation.service.ts:190` |

---

## 12. official-business — `/api/official-business`

| Module | Route | Code | HTTP | Message (exact) | Trigger condition | File:line |
| --- | --- | --- | --- | --- | --- | --- |
| official-business | any `/api/official-business*` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | `toFailure` | `apps/official-business/services/official-business.service.ts:49` |
| official-business | `GET /api/official-business/:id` | `NOT_FOUND_ERROR` | 404 | `Form not found.` | Row missing / not owned | `…service.ts:198` |
| official-business | `PUT /api/official-business/:id` | `NOT_FOUND_ERROR` | 404 | `Form not found.` | Row missing / not owned | `…service.ts:304` |
| official-business | `PUT /api/official-business/:id` | `FORM_LOCKED` | 409 | `This form is with HR for review and can no longer be edited.` | `hr_status === 'submitted'` (`isObLocked`) — every autosave while HR has it | `…service.ts:307` |
| official-business | `PUT /api/official-business/:id` | `NOT_FOUND_ERROR` | 404 | `Form not found.` | Row disappears during the entry rewrite | `…service.ts:427` |
| official-business | `POST /api/official-business/:id/submit` | `NOT_FOUND_ERROR` | 404 | `Form not found.` | Row missing / not owned | `…service.ts:458` |
| official-business | `POST /api/official-business/:id/submit` | `FORM_LOCKED` | 409 | `This form is already with HR and cannot be submitted again.` | `hr_status === 'submitted'` | `…service.ts:464` |
| official-business | `POST /api/official-business/:id/submit` | `FORM_LOCKED` | 409 | `This form cannot be submitted.` | Status is neither post-approval, `draft` nor `rejected` | `…service.ts:470` |
| official-business | `POST /api/official-business/:id/submit` | `VALIDATION_ERROR` | 400 | `There are no unsent changes to send to HR.` | Post-approval form resubmitted with no `pending_content` | `…service.ts:476` |
| official-business | `POST /api/official-business/:id/submit` | `REQUIRED_FIELD_MISSING` | 400 | `Fill in <up to 3 field names> first. It is/They are marked in the form.` — built by `obRequiredMessage` (`shared/src/ob-required.ts:204`) | Any asterisked field empty; `suggestions` = the labels, e.g. `["Stop 1: Purpose(s)", …]` | `…service.ts:495` |
| official-business | `POST /api/official-business/:id/cancel-resubmit` | `NOT_FOUND_ERROR` | 404 | `Form not found.` | Row missing / not owned | `…service.ts:652` |
| official-business | `POST /api/official-business/:id/cancel-resubmit` | `FORM_LOCKED` | 409 | `Only a form that is waiting for HR can be withdrawn.` | `hr_status !== 'submitted'` | `…service.ts:654` |
| official-business | `POST /api/official-business/:id/cancel-resubmit` | `VALIDATION_ERROR` | 400 | `This submission cannot be withdrawn.` | Last resubmit is not `how: 'edited'`, or no `previous_content` | `…service.ts:669` |
| official-business | `DELETE /api/official-business/:id` | `NOT_FOUND_ERROR` | 404 | `Form not found.` | Row already deleted | `…service.ts:730` |

---

## 13. hr — `/api/hr` (`requireApp('hr')`)

| Module | Route | Code | HTTP | Message (exact) | Trigger condition | File:line |
| --- | --- | --- | --- | --- | --- | --- |
| hr | any `/api/hr/*` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | `toFailure` | `apps/hr/services/hr.service.ts:45` |
| hr | `GET /api/hr/ob/:id` | `NOT_FOUND_ERROR` | 404 | `Form not found.` | Row missing | `apps/hr/services/hr.service.ts:259` |
| hr | `GET /api/hr/ob/:id/attachment` | `NOT_FOUND_ERROR` | 404 | `Form not found.` | Row missing | `apps/hr/services/hr.service.ts:304` |
| hr | `POST /api/hr/ob/:id/approve` | `NOT_FOUND_ERROR` / `BAD_REQUEST` | 404 / 400 | `Form not found.` — or `This form is draft; it can only be approved from submitted.` | `requireState(id, 'submitted', 'approved')`: missing row, else wrong status. The message interpolates the raw enum value and `allowed.join(' or ')` | `apps/hr/services/hr.service.ts:522,526` |
| hr | `POST /api/hr/ob/:id/reject` | `NOT_FOUND_ERROR` / `BAD_REQUEST` | 404 / 400 | `This form is draft; it can only be rejected from submitted.` | `requireState(id, 'submitted', 'rejected')` | `apps/hr/services/hr.service.ts:522,526` |
| hr | `POST /api/hr/ob/:id/sign-departure` | `NOT_FOUND_ERROR` / `BAD_REQUEST` | 404 / 400 | `This form is <status>; it can only be departed from approved or waiting_supervisor.` | `requireState(id, ['approved','waiting_supervisor'], 'departed')` | `apps/hr/services/hr.service.ts:522,526` |
| hr | `POST /api/hr/ob/:id/sign-arrival` | `NOT_FOUND_ERROR` / `BAD_REQUEST` | 404 / 400 | `This form is <status>; it can only be completed from departed.` | `requireState(id, 'departed', 'completed')` | `apps/hr/services/hr.service.ts:522,526` |
| hr | `POST /api/hr/ob/:id/sign-arrival` | `BAD_REQUEST` | 400 | `The supervisor must approve this form before it can be completed.` | `departed` but `obSupervisorDone(form)` is false | `apps/hr/services/hr.service.ts:483` |

---

## 14. retention — `/api/admin/retention` (admin only)

| Module | Route | Code | HTTP | Message (exact) | Trigger condition | File:line |
| --- | --- | --- | --- | --- | --- | --- |
| retention | any `/api/admin/retention*` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | `toFailure` | `apps/retention/services/retention.service.ts:47` |
| retention | `POST /api/admin/retention/run` | `RETENTION_DISABLED` | 400 | `Data retention is turned off. Turn it on and save before running a cleanup.` | `settings.enabled === false` | `…retention.service.ts:391` |
| retention | `POST /api/admin/retention/run` | `CLEANUP_IN_PROGRESS` | 409 | `A cleanup run is already in progress. Wait for it to finish.` | Module-level `runInProgress` latch is held (single-process only) | `…retention.service.ts:394` |
| retention | `POST /api/admin/retention/run` | `BAD_REQUEST` | 400 | `Choose at least one form type before running a cleanup.` | Saved rule has no form types ticked | `…retention.service.ts:398` |
| retention | `POST /api/admin/retention/run` | `BAD_REQUEST` | 400 | `Select at least one form to delete.` | A selection was sent but every type in it is outside the saved rule | `…retention.service.ts:416` |

---

## 15. storage — `/api/admin/storage` (admin only)

| Module | Route | Code | HTTP | Message (exact) | Trigger condition | File:line |
| --- | --- | --- | --- | --- | --- | --- |
| storage | any `/api/admin/storage*` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | `toFailure` | `apps/storage/services/storage.service.ts:28` |
| storage | `GET /api/admin/storage` (via `pickBackend`), and any attachment upload while the rule applies | `SERVICE_UNAVAILABLE` | 503 | `Storage rule is "b2-only" but B2 is not configured.` | Saved rule is `b2-only` and `config.storage.b2.configured` is false | `apps/storage/services/storage.service.ts:272` |
| storage | `POST /api/admin/storage/orphans/everywhere` | `INTERNAL_SERVER_ERROR` | 500 | `Cleanup did not report a result.` | Both backends answered `success` but one document is missing | `apps/storage/services/storage.service.ts:427` |

---

## 16. files — `/api/files` (optional B2 backend)

| Module | Route | Code | HTTP | Message (exact) | Trigger condition | File:line |
| --- | --- | --- | --- | --- | --- | --- |
| files | any `/api/files*` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | `toFailure` | `apps/files/services/file.service.ts:19` |
| files | all four routes | `SERVICE_UNAVAILABLE` | 503 | `File storage is not configured. Add the B2_* variables to api/.env.` | `B2_ENDPOINT` / `B2_UPLOAD_KEY_ID` / `B2_UPLOAD_APP_KEY` unset (thrown lazily by the repo) | `apps/files/repositories/b2.repo.ts:36` |
| files | all four routes | `GENERAL_ERROR` | 500 | `Could not <upload\|sign\|delete> the stored file: <raw AWS SDK message>` | Any S3/B2 SDK failure — **raw provider text in `message`** | `apps/files/repositories/b2.repo.ts:16` |
| files | `POST /api/files` | `UNSUPPORTED_MEDIA_TYPE` | 415 | `That file type isn't accepted here. Allowed: image/jpeg, image/png, image/webp, application/pdf.` | Sniffed type not in `ALLOWED_MIME` | `apps/files/services/file.service.ts:48` |
| files | `POST /api/files` | `PAYLOAD_TOO_LARGE` | 413 | `Files must be 10 MB or smaller.` | Decoded bytes over `MAX_UPLOAD_MB` (default 10) | `apps/files/services/file.service.ts:55` |
| files | `GET /api/files/url` | `NOT_FOUND_ERROR` | 404 | `File not found.` | Key missing or owned by another account | `apps/files/services/file.service.ts:93` |
| files | `GET /api/files/url` | `GENERAL_ERROR` | 500 | `Could not create a download link.` | `signedUrl` returned null | `apps/files/services/file.service.ts:96` |
| files | `GET /api/files/attachment` | `FORBIDDEN` | 403 | `That file link cannot be read here.` | Non-HTTPS, host not Supabase/B2, path outside `FormAttachement/`, or no signature | `apps/files/services/file.service.ts:155` |
| files | `GET /api/files/attachment` | `NOT_FOUND_ERROR` | 404 | `That attachment is no longer available.` | Upstream fetch answered non-2xx | `apps/files/services/file.service.ts:163` |
| files | `DELETE /api/files` | `NOT_FOUND_ERROR` | 404 | `File not found.` | Key missing or not owned | `apps/files/services/file.service.ts:187` |
| files | `GET /api/files/attachment` (controller) | `NOT_FOUND_ERROR` | 404 | `That attachment has no file.` | Service returned `success` without a body | `apps/files/controllers/file.controller.ts:57` |

---

## 17. attachments — shared sub-routes on forms and records

Mounted as `/:id/attachment` on records, loa, cos, ot, liquidation, official-business and as
`/:id/other-attachments` on records, loa and ot (`apps/attachments/routes/attachment.routes.ts`).

| Module | Route | Code | HTTP | Message (exact) | Trigger condition | File:line |
| --- | --- | --- | --- | --- | --- | --- |
| attachments | any attachment route | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | `toFailure` | `apps/attachments/services/attachment.service.ts:34` |
| attachments | `POST/GET/DELETE /:id/attachment`, `…/other-attachments` | `NOT_FOUND_ERROR` | 404 | `<Entity> not found.` — `Form not found.` / `LOA form not found.` / `Record not found.` | Row missing or `owner_id` is not the caller | `apps/attachments/services/attachment.service.ts:73` |
| attachments | `POST /:id/other-attachments` | `BAD_REQUEST` | 400 | `This form has no additional files.` | Table is not `loa_forms` / `ot_forms` / `dtr_records` (defensive; those routes are only mounted with `withOthers`) | `apps/attachments/services/attachment.service.ts:261` |
| attachments | `POST /:id/other-attachments` | `BAD_REQUEST` | 400 | `A form can hold up to 8 additional files.` | `OTHER_ATTACHMENTS_MAX` (8) already attached | `apps/attachments/services/attachment.service.ts:283` |
| attachments | `DELETE /:id/other-attachments` | `NOT_FOUND_ERROR` | 404 | `File not found.` | `path` in the query is not in the row's list | `apps/attachments/services/attachment.service.ts:395` |
| attachments | `POST /:id/attachment`, `…/other-attachments` | `UNSUPPORTED_MEDIA_TYPE` | 415 | `That file type can't be stored here. Attach a PDF, image or Office document.` | Declared type/extension not in the allowlist at all | `apps/attachments/utils/upload.ts:122` |
| attachments | `POST /:id/attachment`, `…/other-attachments` | `BAD_REQUEST` | 400 | `That file is empty or could not be read.` | Decoded base64 has zero bytes | `apps/attachments/utils/upload.ts:130` |
| attachments | `POST /:id/attachment`, `…/other-attachments` | `PAYLOAD_TOO_LARGE` | 413 | `Attachments must be 10 MB or smaller.` | Decoded bytes over `ATTACHMENT_MAX_BYTES` (10 MB, hard-coded) | `apps/attachments/utils/upload.ts:136` |
| attachments | `POST /:id/attachment`, `…/other-attachments` | `UNSUPPORTED_MEDIA_TYPE` | 415 | `That file's contents don't match its type. Please pick the original file.` | Magic-byte sniff disagrees with the declared type (e.g. `.pdf` without `%PDF-`) | `apps/attachments/utils/upload.ts:149` |
| attachments | `POST /:id/attachment`, `…/other-attachments` | `PAYLOAD_TOO_LARGE` | 413 | `That preview is too large.` | `thumbBase64` decodes to over `THUMB_MAX_BYTES` (200 KB) | `apps/attachments/utils/upload.ts:177` |
| attachments | any attachment route | `GENERAL_ERROR` | 500 | raw Supabase Storage message (`error.message`, `createError.message`) | Bucket create / upload / sign / list / remove fails — **raw provider text in `message`** | `apps/attachments/repositories/storage.repo.ts:42,51,70,80,165` |
| attachments | all routes | `GENERAL_ERROR` | 500 | `Could not create a download link.` | `requireSignedUrl` got no data and no message | `apps/attachments/repositories/storage.repo.ts:80` |

---

## 18. AI — `/api/ai` (9 POST routes, all `authenticate` only)

Every message below is raised identically across the prompt files; the `File:line` cell lists every
occurrence so nothing is lost by collapsing the 80 prompt throw sites into 18 rows.

Routes: `POST /api/ai/ob/purpose`, `/ob/chat`, `/loa/reason`, `/loa/chat`, `/cos/reason`, `/cos/chat`,
`/ot/reason`, `/ot/chat`, `/liq/chat`.

| Module | Route | Code | HTTP | Message (exact) | Trigger condition | File:line |
| --- | --- | --- | --- | --- | --- | --- |
| ai | all 9 | `TOO_MANY_REQUESTS` | 429 | `You've reached today's AI limit. Please try again tomorrow.` | ≥100 successful `ai.request` rows for this account in 24 h | `apps/ai/services/ai-quota.service.ts:46` |
| ai | all 9 | `TOO_MANY_REQUESTS` | 429 | `The AI helper is at capacity right now. Please try again later.` | ≥1000 `ai.request` rows app-wide in 24 h | `apps/ai/services/ai-quota.service.ts:52` |
| ai | all 9 | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | `AiService.run` catch — anything not an `ErrorResponse` | `apps/ai/services/ai.service.ts:58` |
| ai | all 9 | `SERVICE_UNAVAILABLE` | 503 | `AI is not configured for this app.` | `GEMINI_API_KEY` unset | `ai/prompts/ob-purpose.ts:81`, `ob-chat.ts:80`, `loa-reason.ts:76`, `loa-chat.ts:410`, `cos-reason.ts:79`, `cos-chat.ts:85`, `ot-reason.ts:79`, `ot-chat.ts:84`, `liq-chat.ts:454` |
| ai | all 9 | `TOO_MANY_REQUESTS` | 429 | `Too many requests right now. Please try again in a moment.` | Gemini answered HTTP 429 (after 2 retries) | `ob-purpose.ts:121`, `ob-chat.ts:116`, `loa-reason.ts:116`, `loa-chat.ts:440`, `cos-reason.ts:119`, `cos-chat.ts:121`, `ot-reason.ts:119`, `ot-chat.ts:120`, `liq-chat.ts:484`; also `apps/biometric-import/services/biometric-import.service.ts:51` |
| ai | all 9 | `GENERAL_ERROR` | 500 | `The Gemini API key is invalid or missing permissions.` | Gemini answered HTTP 403 | `ob-purpose.ts:126`, `ob-chat.ts:121`, `loa-reason.ts:121`, `loa-chat.ts:445`, `cos-reason.ts:124`, `cos-chat.ts:126`, `ot-reason.ts:124`, `ot-chat.ts:125`, `liq-chat.ts:489`; `biometric-import.service.ts:57` |
| ai | all 9 | `GENERAL_ERROR` | 500 | `The AI request failed (<status>).` | Any other non-OK Gemini status | `ob-purpose.ts:130`, `ob-chat.ts:125`, `loa-reason.ts:125`, `loa-chat.ts:449`, `cos-reason.ts:128`, `cos-chat.ts:130`, `ot-reason.ts:128`, `ot-chat.ts:129`, `liq-chat.ts:493` |
| ai | `…/reason` and `…/chat` | `GENERAL_ERROR` | 500 | `The AI didn't return anything. Please try again.` | Empty candidate text, or no JSON object in the reply | `ob-purpose.ts:146`, `loa-reason.ts:141`, `cos-reason.ts:144`, `ot-reason.ts:144`, `ob-chat.ts:142`, `loa-chat.ts:457`, `cos-chat.ts:147`, `ot-chat.ts:145`, `liq-chat.ts:355` |
| ai | `…/chat` | `GENERAL_ERROR` | 500 | `The AI returned an unexpected response. Please try again.` | Reply is not parsable JSON, or fails the shape check | `ob-chat.ts:151,159`, `loa-chat.ts:335`, `cos-chat.ts:156,164`, `ot-chat.ts:154,162`, `liq-chat.ts:362,508,527` |
| ai | `…/chat` | `GENERAL_ERROR` | 500 | `The AI didn't reply. Please try again.` | Parsed reply has neither `reply` nor a form patch | `ob-chat.ts:198`, `loa-chat.ts:483`, `cos-chat.ts:207`, `ot-chat.ts:202` |
| ai | `…/chat` (loa, liq only) | `GENERAL_ERROR` | 500 | `The AI took too long to respond. Please try again.` | Aborted at `REQUEST_TIMEOUT_MS` (25 s) on the last attempt | `loa-chat.ts:283`, `liq-chat.ts:310` |
| ai | `…/chat` (loa, liq only) | `GENERAL_ERROR` | 500 | `Couldn't reach the AI service. Please try again.` | Network error on every retry | `loa-chat.ts:288`, `liq-chat.ts:315` |
| ai | `…/chat` (loa, liq only) | `BAD_REQUEST` | 400 | `That message was blocked by the AI safety filter. Try rephrasing it.` | `payload.promptFeedback.blockReason` present | `loa-chat.ts:296`, `liq-chat.ts:323` |
| ai | `…/chat` (loa, liq only) | `BAD_REQUEST` | 400 | `The AI couldn't answer that for safety reasons. Try rephrasing it.` | `finishReason === 'SAFETY'` | `loa-chat.ts:303`, `liq-chat.ts:330` |
| ai | `…/chat` (loa, liq only) | `GENERAL_ERROR` | 500 | `The AI's reply got cut off. Please try again.` | Empty text with `finishReason === 'MAX_TOKENS'` | `loa-chat.ts:313`, `liq-chat.ts:340` |
| ai | `POST /api/ai/{ob/purpose,loa/reason,cos/reason,ot/reason}` | `BAD_REQUEST` | 400 | `Add a few words of context so the AI knows what to write.` | `mode: "generate"` with blank `context` | `ob-purpose.ts:87`, `loa-reason.ts:82`, `cos-reason.ts:85`, `ot-reason.ts:85` |
| ai | `POST /api/ai/{loa,cos,ot}/reason` | `BAD_REQUEST` | 400 | `Write a rough reason first, then let the AI enhance it.` | `mode: "enhance"` with blank `current` | `loa-reason.ts:88`, `cos-reason.ts:91`, `ot-reason.ts:91` |
| ai | `POST /api/ai/ob/purpose` | `BAD_REQUEST` | 400 | `Write a rough purpose first, then let the AI enhance it.` | `mode: "enhance"` with blank `current` | `ob-purpose.ts:93` |

---

## 19. biometric-import — `/api/biometric-import`

| Module | Route | Code | HTTP | Message (exact) | Trigger condition | File:line |
| --- | --- | --- | --- | --- | --- | --- |
| biometric-import | `POST /api/biometric-import` | `SERVICE_UNAVAILABLE` | 503 | `AI is not configured for this app.` | `GEMINI_API_KEY` unset | `apps/biometric-import/services/biometric-import.service.ts:25` |
| biometric-import | `POST /api/biometric-import` | `TOO_MANY_REQUESTS` | 429 | `Too many requests right now. Please try again in a moment.` | Gemini answered 429 | `…biometric-import.service.ts:51` |
| biometric-import | `POST /api/biometric-import` | `GENERAL_ERROR` | 500 | `The Gemini API key is invalid or missing permissions.` | Gemini answered 403 | `…biometric-import.service.ts:57` |
| biometric-import | `POST /api/biometric-import` | `GENERAL_ERROR` | 500 | `Could not read the file (<status>).` | Any other non-OK Gemini status | `…biometric-import.service.ts:62` |
| biometric-import | `POST /api/biometric-import` | `BAD_REQUEST` | 400 | `No time log rows were found in that file.` | No JSON extracted, or the model returned zero rows | `…biometric-import.service.ts:76` |

> Note: this route is **not** wrapped in `AiService.run`, so it does **not** apply the 100/1000 quota —
> only the global IP rate limiter.

---

## 20. inventory-assets — `/api/inventory` (`requireApp('inventory')`)

| Module | Route | Code | HTTP | Message (exact) | Trigger condition | File:line |
| --- | --- | --- | --- | --- | --- | --- |
| inventory-assets | `GET /api/inventory/data` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | Lookup or join query throws (incl. 503 from `getRgcSql`) | `apps/inventory-assets/services/inventory-asset.service.ts:43` |
| inventory-assets | `POST /api/inventory/assets`, `PUT /api/inventory/assets/:id` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | `saveWithDetail` throws | `…inventory-asset.service.ts:70` |
| inventory-assets | `POST /api/inventory/assets/bulk-delete` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | `deleteMany` throws | `…inventory-asset.service.ts:91` |
| inventory-assets | `POST /api/inventory/assets` | `DATABASE_ERROR` | 500 | `Failed to save asset.` | Insert returned no id inside the transaction | `apps/inventory-assets/repositories/inventory-asset.repo.ts:99` |
| inventory-assets | `PUT /api/inventory/assets/:id` | `NOT_FOUND_ERROR` | 404 | `Asset not found.` | Update matched no row inside the transaction | `apps/inventory-assets/repositories/inventory-asset.repo.ts:120` |

---

## 21. inventory-options — `/api/inventory/options` (`requireApp('inventory')`)

| Module | Route | Code | HTTP | Message (exact) | Trigger condition | File:line |
| --- | --- | --- | --- | --- | --- | --- |
| inventory-options | `GET /api/inventory/options` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | Usage counts query throws | `apps/inventory-options/services/inventory-option.service.ts:63` |
| inventory-options | `POST /api/inventory/options` | `UNIQUE_FIELD_ERROR` | 409 | `That branch already exists.` (label is `branch` / `department` / `status` / `condition` / `assetType`) | Name pre-check finds an existing row | `…inventory-option.service.ts:81` |
| inventory-options | `POST /api/inventory/options` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | Insert throws | `…inventory-option.service.ts:107` |
| inventory-options | `PATCH /api/inventory/options` | `UNIQUE_FIELD_ERROR` | 409 | `That <label> already exists.` | Renaming onto another row's name | `…inventory-option.service.ts:125` |
| inventory-options | `PATCH /api/inventory/options` | `NOT_FOUND_ERROR` | 404 | `Failed to update: record not found.` | `rename` affected 0 rows | `…inventory-option.service.ts:132` |
| inventory-options | `PATCH /api/inventory/options` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | Rename throws | `…inventory-option.service.ts:145` |
| inventory-options | `DELETE /api/inventory/options?kind=branch` | `IN_USE_ERROR` | 409 | `Cannot delete branch: still used by <n> asset(s).` | `countAssetsInBranch(id) > 0` | `…inventory-option.service.ts:159` |
| inventory-options | `DELETE /api/inventory/options` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | Delete throws (DB guard triggers arrive here as raw 500) | `…inventory-option.service.ts:173` |
| inventory-options | `POST /api/inventory/options/quick`, `PATCH /api/inventory/options` | `DATABASE_ERROR` | 500 | `Failed to update: <raw pg message>` / `Failed to add the new <label>: <raw pg message>` | `guard()` re-labels any `DATABASE_ERROR`, keeping the raw driver tail | `…inventory-option.service.ts:36` |
| inventory-options | `POST /api/inventory/options/quick` | `DATABASE_ERROR` | 500 | `Failed to add the new <label>.` | Insert returned no id | `…inventory-option.service.ts:202` |
| inventory-options | `POST /api/inventory/options/quick` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | Anything else | `…inventory-option.service.ts:220` |

---

## 22. inventory-showrooms — `/api/inventory/showrooms` (`requireApp('inventory')`)

| Module | Route | Code | HTTP | Message (exact) | Trigger condition | File:line |
| --- | --- | --- | --- | --- | --- | --- |
| inventory-showrooms | `GET /api/inventory/showrooms` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | List query throws | `apps/inventory-showrooms/services/inventory-showroom.service.ts:88` |
| inventory-showrooms | `POST /api/inventory/showrooms`, `PUT /api/inventory/showrooms/:id` | `UNIQUE_FIELD_ERROR` | 409 | `That showroom already exists.` | `nameExists(name, excludingId)` | `…inventory-showroom.service.ts:111` |
| inventory-showrooms | `POST /api/inventory/showrooms` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | Save throws | `…inventory-showroom.service.ts:140` |
| inventory-showrooms | `PUT /api/inventory/showrooms/:id` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | Save throws | `…inventory-showroom.service.ts:170` |
| inventory-showrooms | `DELETE /api/inventory/showrooms/:id` | `NOT_FOUND_ERROR` | 404 | `Showroom not found.` | Delete affected 0 rows | `…inventory-showroom.service.ts:156` |
| inventory-showrooms | `DELETE /api/inventory/showrooms/:id` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | Delete throws | `…inventory-showroom.service.ts:189` |
| inventory-showrooms | `GET /api/inventory/showrooms/stock`, `PUT /api/inventory/showrooms/stock` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | Stock read/write throws | `…inventory-showroom.service.ts:221` |
| inventory-showrooms | `POST /`, `PUT /:id` | `DATABASE_ERROR` | 500 | `Failed to save showroom.` | Insert/update returned no id inside the transaction | `apps/inventory-showrooms/repositories/inventory-showroom.repo.ts:305` |
| inventory-showrooms | `PUT /:id` | `NOT_FOUND_ERROR` | 404 | `Showroom not found.` | Update matched no row inside the transaction | `…inventory-showroom.repo.ts:323` |
| inventory-showrooms | `PUT /api/inventory/showrooms/stock` | `DATABASE_ERROR` | 500 | `Failed to save the CCTV total.` | Upsert returned no row | `…inventory-showroom.repo.ts:364` |

---

## 23. inventory-reports — `/api/inventory/reports` (`requireApp('inventory')`)

| Module | Route | Code | HTTP | Message (exact) | Trigger condition | File:line |
| --- | --- | --- | --- | --- | --- | --- |
| inventory-reports | `GET /api/inventory/reports/:branchId` | `NOT_FOUND_ERROR` | 404 | `Branch not found.` | Branch id unknown | `apps/inventory-reports/services/inventory-report.service.ts:18` |
| inventory-reports | `GET /api/inventory/reports/:branchId` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | Asset query throws | `…inventory-report.service.ts:31` |
| inventory-reports | `POST /api/inventory/reports/downloads` | `INTERNAL_SERVER_ERROR` | 500 | raw `error.message` | Download log insert throws | `…inventory-report.service.ts:56` |

---

# Non-`ErrorResponse` failure modes

| Kind | Where | What the client actually gets |
| --- | --- | --- |
| Body too large (framework) | `express.json({ limit: config.bodyLimit })`, default `15mb` | 413 `PAYLOAD_TOO_LARGE` — `The request is too large.` `global.ts:20`. Note a 10 MB attachment becomes ~13.3 MB of base64 JSON, so it fits with little headroom. |
| Malformed JSON | same | 400 `BAD_REQUEST` — `The request body is not valid JSON.` `global.ts:14` |
| Rate limit | `app.use('/api', apiRateLimiter)`, default 300 / 15 min / IP | 429 `TOO_MANY_REQUESTS` — `Too many requests. Please try again later.` Headers `RateLimit-*` set (`standardHeaders: true`). `/api/updates/stream` is exempt. |
| Missing / invalid session | `authenticate` on every module except `sign-in`, `sign-out`, `session` | 401 `UNAUTHORIZED` — `Please sign in first.` No cookie, bad HMAC, expired, tampered `pw` fingerprint, deleted account. Cookie is `httpOnly`, `SameSite=Lax`, `secure` in production (`session.service.ts:36-41`). |
| CSRF | — | **No CSRF token exists anywhere in the API** (no `csrf` match in `api/src`). The only defence is `SameSite=Lax` + CORS origin allowlist. |
| Unsupported media type (framework) | — | There is **no** content-type rejection middleware. `express.json` silently ignores `multipart/form-data` / `text/plain`, leaves `req.body` undefined, and zod then answers 400 `VALIDATION_ERROR` `"Validation error"` with `suggestions: ["Required"]` *(inferred from express + zod behaviour; not exercised at runtime)*. Every real 415 comes from the app's own magic-byte check. |
| Timeout | — | No timeout on ordinary routes (Node's default applies). Only Gemini calls time out: 25 s per attempt, 3 attempts (`ai/prompts/*-chat.ts:16`). |
| CORS rejection | `cors({ origin: config.cors.origins })` | No JSON body at all. A non-matching origin simply gets no `Access-Control-Allow-Origin` header, so the browser blocks the *reading* of an otherwise normal response — including a 200. Nothing reaches the error handler. |
| 503 for unconfigured Supabase | — | **Does not exist as an HTTP path.** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are required by `EnvSchema` (`core/config/index.ts`), so the process refuses to boot instead. Likewise `SESSION_SECRET`. Only the *reachability* check surfaces as 503 (`GET /health/db`). |
| 503 for unconfigured optional services | inventory DB, B2, Gemini | 503 `SERVICE_UNAVAILABLE` with a per-service message — see §1, §16, §18. |
| SPA / static 404 | `express.static` + SPA fallback (`webserver/express.ts:134-145`) | A non-`/api`, non-`/health` path **without** a file extension returns `index.html` (200). `/api/*` and `/health*` keep the JSON 404. A missing `/assets/x.js` also returns the JSON 404. |
| SSE mid-stream failure | `apps/updates/repositories/updates.repo.ts:43,62` | The JSON envelope is attempted after `flushHeaders()`, so the browser sees a dropped `EventSource` and reconnects. |
| Boot-time failure | `buildConfig()` throws | Not an HTTP response: the container exits with `Invalid or missing environment variables: …`. |

---

# Taxonomy — every entry bucketed for UI purposes

Nine kinds are enough to drive the whole web error layer. Each row maps 1:1 to a treatment.

| # | Kind | Codes | Typical HTTP | What the user should see | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | **Sign in again** | `UNAUTHORIZED` | 401 | Redirect to `/sign-in`, keep the intended path | Only 3 throw sites, but they cover every guarded route |
| 2 | **No permission** | `FORBIDDEN` | 403 | "You don't have access to this app" panel, not a toast | Covers admin guard, app grant, and the file-proxy host check — three very different causes behind one code |
| 3 | **Fix a field** | `VALIDATION_ERROR`, `REQUIRED_FIELD_MISSING`, `BAD_REQUEST` | 400 | Inline highlight + focus the first bad field; `suggestions` carries the paths/labels | `BAD_REQUEST` is overloaded: also used for business refusals (see #5) |
| 4 | **Upload rejected** | `UNSUPPORTED_MEDIA_TYPE`, `PAYLOAD_TOO_LARGE` | 415 / 413 | Stay in the file picker, name the limit | Three different size limits (15 MB body, 10 MB attachment, 5 MB photo, 200 KB thumb) |
| 5 | **Business rule refusal** | `FORM_LOCKED`, `IN_USE_ERROR`, `REFERENCED_ERROR`, `RETENTION_DISABLED`, `CLEANUP_IN_PROGRESS`, part of `BAD_REQUEST` | 400 / 409 | Toast with the sentence as written; the message *is* the instruction | This is the bucket that most needs exact copy, and where the inconsistencies cluster |
| 6 | **Gone or stale** | `NOT_FOUND_ERROR` | 404 | "This was removed" + refresh the list | Four different sentence styles for the same situation (Appendix A, finding 5) |
| 7 | **Slow down** | `TOO_MANY_REQUESTS` | 429 | Countdown, disable the button | Three unrelated causes: IP limiter, sign-in throttle, AI quota |
| 8 | **Feature off / unreachable** | `SERVICE_UNAVAILABLE` | 503 | Hide or disable the control with an explanation | Correctly used for AI, B2, inventory DB — but *not* for the "AI key invalid" case, which is 500 `GENERAL_ERROR` |
| 9 | **Our fault** | `INTERNAL_SERVER_ERROR`, `GENERAL_ERROR`, `DATABASE_ERROR` | 500 | "Something went wrong, try again" + a correlation id | 128 of the 266 throw sites. The message here is untrustworthy (raw driver text); see Appendix A, finding 1 |

---

# Appendix A — Findings: inconsistencies and risks

Ordered by how much they affect the web's ability to render a correct message.

### 1. Raw driver / provider text reaches `error.message` on 128 server errors — *high severity*

Every service's mandated `catch` block builds its own `ErrorResponse` and passes the exception text:

```ts
// core/engine/base/_services/base.service.ts:44-49
error:
  error instanceof ErrorResponse
    ? error
    : new ErrorResponse('INTERNAL_SERVER_ERROR', (error as Error).message),
```

so the production redaction in `global.ts:47-50` (`config.runningProd ? undefined : err.message`) and in
`api-response.ts:41-44` **never runs** — the error is already an `ErrorResponse` by the time it arrives.
Identical pattern in `base.repository.ts:131,149`, `rgc.repository.ts:38,42`,
`attachments/repositories/storage.repo.ts:42,51,70,80,165`, `files/repositories/b2.repo.ts:16`,
`inventory-option.service.ts:36`. Consequences: Postgres constraint names, column names, Supabase
Storage internals and AWS SDK messages are shown verbatim to employees in production. The AGENTS.md
template is what propagates this.

### 2. The same SQL condition maps to three different codes — *high severity*

| SQLSTATE | Supabase mapper | RGC mapper | Hand-written equivalent |
| --- | --- | --- | --- |
| `23503` FK violation | `BAD_REQUEST` 400 `"A referenced record does not exist, or is still in use."` (`base.repository.ts:124`) | `REFERENCED_ERROR` 409 (`rgc.repository.ts:33`) | `IN_USE_ERROR` 409 `"Cannot delete branch: still used by N asset(s)."` (`inventory-option.service.ts:159`) |

So "can't delete, still referenced" is 400 on Supabase, 409 `REFERENCED_ERROR` on the inventory DB,
and 409 `IN_USE_ERROR` when a pre-check catches it. `REFERENCED_ERROR` — whose default text is
literally "Cannot delete: still referenced by other records" — is only ever raised by the inventory DB.

### 3. `validate()` produces a useless `message` on every route — *high severity*

```ts
// common/shared/middlewares/validate.ts:27
next(new ErrorResponse('VALIDATION_ERROR', 'Validation error', details));
```

The literal string `"Validation error"` is the user-facing text for **every** schema failure on
**every** route (body, query and params); the actionable part lives in `suggestions` as
`"field.path: message"`. If the web renders `error.message` (as the brief states), a bad `:id`, a
missing required field and a malformed body all read identically. This single site is the highest
leverage fix in the file.

### 4. Two different 500 codes with no rule separating them — *medium severity*

`GENERAL_ERROR` (60 sites) and `INTERNAL_SERVER_ERROR` (59 sites) are both 500 and both mean "our
fault", but they are not interchangeable in meaning: `GENERAL_ERROR` is used for *upstream AI* states
(quota, invalid key, blocked reply) that are really 503-class, while `INTERNAL_SERVER_ERROR` is the
catch-all wrapper. A client cannot pick a retry policy from the code. Also inside the AI block:
Gemini 429 → `TOO_MANY_REQUESTS` (correct), Gemini 403 (bad key) → `GENERAL_ERROR` 500 (should be
503/500 with an ops alert), Gemini 5xx → `GENERAL_ERROR` 500.

### 5. `NOT_FOUND_ERROR` speaks in four registers — *medium severity*

| Text | Where |
| --- | --- |
| `Resources Not Found` (no period, Title Case) | `notFound.ts:5` |
| `The requested item could not be found.` | default, `codes.ts` |
| `The requested document was not found.` / `Document to update not found.` | `base.service.ts:59,147` |
| `Form not found.` / `Record not found.` / `Asset not found.` / `Branch not found.` / `That account no longer exists.` / `That rule no longer exists.` | 20+ service sites |

The generic-route 404 is the only one written in Title Case without a full stop, so it reads as a
different product from the entity 404s.

### 6. State-machine conflicts use `FORM_LOCKED` in one module and `BAD_REQUEST` in another — *medium severity*

`official-business` refuses a blocked transition with `FORM_LOCKED` 409
(`…service.ts:307,464,470,654`), while `hr.service.requireState` refuses the equivalent condition with
`BAD_REQUEST` 400 and interpolates raw enum values into the sentence:

```
This form is submitted; it can only be approved from submitted.
This form is waiting_supervisor; it can only be departed from approved or waiting_supervisor.
```

(`hr.service.ts:522-526`.) Two problems: the code differs for the same class of refusal, and
`submitted` / `waiting_supervisor` / `departed` are internal tokens shown to HR staff, e.g.
`This form is draft; it can only be approved from submitted.` The `allowed.join(' or ')` also degrades
to a single value for the `approve` / `reject` / `sign-arrival` calls (only one allowed state), so the
sentence reads like a tautology instead of naming what the user should do.

### 7. `suggestions` is empty almost everywhere — *medium severity*

Of 72 custom messages, only three sites populate `suggestions`: `validate.ts:27` (field paths),
`base.repository.ts:117` (unique-violation `details`), and
`official-business.service.ts:495` (missing field labels). Everything else ships `[]`, so any
"suggestion / fix-it" affordance in the web is dead on 263 of 266 sites — including `FORM_LOCKED`,
which is the case where telling the user *what to do* matters most ("Ask HR to reject it").

### 8. Three rate limits, one code — *medium severity*

| Source | Message | Window |
| --- | --- | --- |
| IP limiter | `Too many requests. Please try again later.` | 15 min / 300 req |
| Sign-in throttle | `Too many sign-in attempts. Please wait 15 minutes and try again.` | 15 min / 10 per ID, 20 per IP |
| AI quota | `You've reached today's AI limit. Please try again tomorrow.` | rolling 24 h / 100 per user, 1000 global |

All 429 `TOO_MANY_REQUESTS`, but the remedies differ by orders of magnitude (seconds vs. tomorrow).
Only the message distinguishes them, and the IP limiter's message says nothing about how long.

### 9. `REQUIRED_FIELD_MISSING` used for a NOT NULL violation — *low/medium severity*

`base.repository.ts:131` maps Postgres `23502` to `REQUIRED_FIELD_MISSING` **and passes
`error.message`**. That turns a server-side schema mismatch into a 400 that blames the client, with a
Postgres sentence like `null value in column "owner_id" of relation "loa_forms" violates not-null
constraint`. It should be a 500 (a bug) or a 400 with a friendly field name.

### 10. `PAYLOAD_TOO_LARGE` names three different ceilings, two without a number — *low severity*

| Limit | Message | Number in message |
| --- | --- | --- |
| 15 MB JSON body | `The request is too large.` | no |
| 10 MB attachment | `Attachments must be 10 MB or smaller.` | yes (hard-coded in `upload.ts:3`; independent of the configurable `MAX_UPLOAD_MB`) |
| 5 MB profile photo | `That photo is too large.` | no |
| 200 KB thumbnail | `That preview is too large.` | no |

The attachment limit is a literal `10 * 1024 * 1024` in `upload.ts:3`, separate from `MAX_UPLOAD_MB`
(capped at 10 by `EnvSchema`). Lowering `MAX_UPLOAD_MB` therefore makes `/api/files` stricter than
the form attachments while the attachment copy keeps claiming 10 MB.

### 11. `ErrorResponse` silently downgrades an unknown code — *low severity*

```ts
// common/shared/utils/error/response.ts:15
const errorCode: ErrorCode = ErrorCodes[code] ?? ErrorCodes.GENERAL_ERROR;
```

The constructor's type is `ErrorCodeKey`, so this is unreachable from typed code — but the fallback
means a code introduced through a cast (or a runtime string) becomes a 500 `GENERAL_ERROR` instead of
failing loudly. The comment above `ErrorCodes` claims "a typo in a code is a compile error"; the
runtime guard contradicts that only for untyped callers.

### 12. The comments about 503s are ahead of the code — *low severity*

`file.routes.ts:13` says "every route answers 503 when the B2_* variables are unset", but
`FileService.remove` (`file.service.ts:181-187`) reads and deletes the DB row first and removes bytes
quietly, so `DELETE /api/files` answers 404/200 even with B2 unconfigured. Same class of drift:
`uploads` and `sign` do throw the 503, `remove` does not.

### 13. Unreachable / defensive branches worth deleting — *informational*

* `access.middleware.ts:21` — `UNAUTHORIZED` when `req.user` is missing; `authenticate` already guarantees it.
* `attachment.service.ts:261` — "This form has no additional files." cannot fire: `withOthers` is only `true` for loa/ot/records, the exact three tables the assert allows.
* `files/controllers/file.controller.ts:57` — "That attachment has no file." requires `success: true` with no `document`, which the service never returns.

---

# Appendix B — Coverage and what was not verified

**Fully covered:** every `new ErrorResponse(` in `api/src` (266/266), every `catch` that can answer
without one, the four repository mappers, all 24 module routers, both global handlers, the rate
limiter, `validate`, and the two guards.

**Verified by reading, not by running:** all messages and conditions above. The response envelope was
traced through `ApiResponse.error` → `ErrorResponse`; no server was started, so no status code was
observed live.

**No unused codes:** `ErrorCodes` contains no entries that never fire — all 19 appear at least once.

**Out of scope (not audited):** `web/` rendering of these errors, the `shared/` zod messages that end
up in `suggestions`, Supabase/Postgres schema-level `RAISE` texts, and the Docker/nginx layer in front
of the API.

