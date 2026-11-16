# Error sources outside the API error table — SwiftSlip

**Question.** Which user-visible error states does SwiftSlip generate *outside* `api/src/common/shared/utils/error/codes.ts`, so that a reusable error-state component must render them?
**Scope.** `shared/src/schemas.ts` (+ other shared schema files), upload/file paths in `api/src/apps/{attachments,files,profile,storage}`, `web/src/**` auth/session, the SSE live-update stream, and every network/silent-failure path.
**Repo state.** Working tree at `C:\Users\RGC_IT 1\Desktop\swiftslip-docker\swiftslip`, read 2026-11-16. Read-only review; no source file was modified.
**Counting rule used below.** One entry per *distinct rendered string* (a template with runtime values counts once), de-duplicated **within** its section. Purely decorative or success copy is excluded.

Evidence grades: **[C]** current code (highest) · **[D]** docs/comments · **[T]** tests · **[I]** inference (flagged as such, never used as a conclusion).

---

## 0. The baseline: what the table itself covers

19 error kinds in `codes.ts:12-109` — `BAD_REQUEST`, `VALIDATION_ERROR`, `REQUIRED_FIELD_MISSING`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND_ERROR`, `UNIQUE_FIELD_ERROR`, `RETENTION_DISABLED`, `CLEANUP_IN_PROGRESS`, `IN_USE_ERROR`, `FORM_LOCKED`, `REFERENCED_ERROR`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `TOO_MANY_REQUESTS`, `DATABASE_ERROR`, `GENERAL_ERROR`, `INTERNAL_SERVER_ERROR`, `SERVICE_UNAVAILABLE`.

Two structural facts that matter for a code-driven component:

1. **The table's `message` is only a default, and is frequently overridden.** `ErrorResponse` takes `message?: string` and uses it in place of the table copy (`error/response.ts:11-22`). `readUpload` alone overrides 3 codes with its own sentences (`BAD_REQUEST`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`). So `code` is stable but `message` is not — a component that renders `ErrorCodes[code].message` will print text the user was never meant to see, and miss the text they were.
2. **The wire envelope is flat** (`response/api-response.ts:26-33`): `{ success: false, error: { status, code, message, suggestions } }`. There is no issue list, no field map, no retry hint — `suggestions: string[]` is the only extension point. [C]

---

## 1. Zod validation

### 1.1 Schemas

`shared/src/schemas.ts` exports **98 consts**, of which `82` are `z.object(...)` routes-and-input schemas. `shared/src/inventory.ts` adds `10` and `shared/src/showrooms.ts` adds `3`, all also used by `validate()`
(`api/src/apps/inventory-assets/routes/inventory-asset.routes.ts:20-31`). [C]

Grouped: auth/session (`signInInput`, `changePasswordInput`, `upsertCodeInput`), paging/logs (`listActivityLogsInput`, `activityLogRangeInput`, `activityLogFeedInput`), records/DTR (`createRecordInput`, `dtrEntrySchema`, `dtrHeaderSchema`, `saveRecordInput`), the six forms (`saveObFormInput`, `saveLoaFormInput`, `saveLiqFormInput`, `saveCosFormInput`, `saveOtFormInput` + their `submit*/reject*/sign*` inputs), AI chat (`*ChatInput`, `*ReasonInput`, `obPurposeInput`), attachments/files (`attachmentUploadInput`, `attachmentPath*`, `fileUploadInput`, `fileKeyQuery`, `attachmentProxyQuery`), profile/admin (`employeeProfileSchema`, `profilePhotoInput`, `createUserInput`, `updateUserInput`, `userPhotosInput`), notifications, access rules, org options, retention, storage.

### 1.2 The exact `VALIDATION_ERROR` payload

`api/src/common/shared/middlewares/validate.ts:22-27`: [C]

```ts
const details = result.error.issues.map((issue) =>
  issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
);
next(new ErrorResponse('VALIDATION_ERROR', 'Validation error', details));
```

So a failed sign-in body produces:

```json
{ "success": false,
  "error": { "status": 400, "code": "VALIDATION_ERROR",
             "message": "Validation error",
             "suggestions": ["idNumber: Enter your ID number.", "entries.3.date: Date is required."] } }
```

- **Does it say which field failed? Yes — but only as prose inside `suggestions`.** The field path is a dot-joined string glued to the message with `": "`; there is no `field`, no `path[]`, no `code` per issue. Array indices appear as `entries.3.date`.
- `message` is the literal `'Validation error'` (lower-case v), **not** the table's `'The request contains invalid data.'`. The table entry for `VALIDATION_ERROR` never reaches the user on this path.
- `suggestions` is used as a generic string bag by the whole codebase — `REQUIRED_FIELD_MISSING` also fills it with field labels, and the comment on `ErrorResponse.suggestions` says nothing about shape.

**Who reads it.** Only one feature parses `suggestions`: `web/src/features/official-business/components/ObEditor.tsx:602-605` maps `REQUIRED_FIELD_MISSING` suggestions to labels (`obRequiredToastFromLabels`). For `VALIDATION_ERROR`, `friendlyError` collapses everything to one sentence (`web/src/lib/toast.ts:47-48`):

```ts
case "VALIDATION_ERROR":
  return "Some details could not be saved. Check the form and try again.";
```

So the field information the API does send is **discarded by default** before it reaches a toast, and nothing in the app renders `suggestions` as per-field errors. [C]

### 1.3 Custom messages a user can see — 18 distinct, 20 call sites

| # | Message | Location |
|---|---|---|
| Z1 | `Invalid period` | `schemas.ts:40` (`period` refine) |
| Z2 | `Enter your ID number.` | `schemas.ts:51` |
| Z3 | `Invalid date` | `schemas.ts:88` (`activityTimestamp`) |
| Z4 | `Tell the employee why this was rejected.` | `schemas.ts:187` |
| Z5 | `Date is required.` | `schemas.ts:196`, `schemas.ts:204` |
| Z6 | `Time is required.` | `schemas.ts:197`, `schemas.ts:205` |
| Z7 | `ID number is required.` | `schemas.ts:595` |
| Z8 | `Enter your current password.` | `schemas.ts:632` |
| Z9 | `` New password must be at least ${PASSWORD_MIN_LENGTH} characters. `` → "…at least 4 characters." | `schemas.ts:635` |
| Z10 | `New passwords don't match.` | `schemas.ts:638-641` (`.refine` with `path: ["confirmPassword"]`) |
| Z11 | `That photo is too large. Try a smaller one.` | `schemas.ts:769`, `schemas.ts:781` (600 000-char cap) |
| Z12 | `Enter the new name.` | `schemas.ts:842` |
| Z13 | `Enter the designation name.` | `schemas.ts:848` |
| Z14 | `Enter the department name.` | `schemas.ts:852` |
| Z15 | `Enter the position name.` | `schemas.ts:856` |
| Z16 | `Enter a whole number of days.` | `schemas.ts:913` |
| Z17 | `` Keep forms for at least ${RETENTION_MIN_DAYS} day. The period is yours to choose. `` | `schemas.ts:915-916` |
| Z18 | `That is more than 10 years. Pick a smaller number.` | `schemas.ts:918` |

`inventory.ts` and `showrooms.ts` contain **zero** custom messages, so every one of their failures surfaces as a raw zod default. [C]

### 1.4 The uncovered half: zod's default strings

Every constraint without an explicit message ships zod's English to the user, because `issue.message` is copied verbatim into `suggestions`. With `zod@^3.25.76` (`api/package.json:29`, `web/package.json:81`, `shared/package.json:14`) that is `Required`, `String must contain at least 1 character(s)`, `Invalid enum value. Expected 'admin' | 'user', received 'x'`, `Expected number, received string`, `Number must be less than or equal to 31`. Hundreds of field constraints are in this class (e.g. `schemas.ts:100-141`, `schemas.ts:284-308`). [C] for the mechanism, [C] for the version; the exact rendered wording is zod's, not this repo's.

---

## 2. Uploads / files

**Ceilings, in one place each.** Client `MAX_ATTACHMENT_MB = 10` / `MAX_ATTACHMENT_BYTES` (`web/src/lib/attachment-upload.ts:16-17`); server `ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024` (`api/src/apps/attachments/utils/upload.ts:3`); wire cap `MAX_UPLOAD_BASE64 = ceil(10 MiB × 4/3) + 64` = **13 981 529 chars** (`shared/src/schemas.ts:29`); preview cap `MAX_THUMB_BASE64 = 300 000` (`schemas.ts:36`) with a server-side `THUMB_MAX_BYTES = 200 * 1024` (`upload.ts:170`); body-parser `BODY_LIMIT` default `15mb` (`api/src/core/config/index.ts:20`, applied `core/framework/webserver/express.ts:127`); count cap `MAX_FILES = 8` per form (`LoaOtherAttachmentsCard.tsx:22`, `OtOtherAttachmentsCard.tsx:22`, `RecordOtherAttachmentsCard.tsx:22`). [C]

**Type gate is enforced twice with different lists.** The browser accepts `image/*` broadly (`attachment-upload.ts:36-48`, and a *second, duplicated* copy at `AttachmentUploadDialog.tsx:36-47`); the server allow-list is 13 exact types plus magic-byte sniffing (`upload.ts:41-61`, `upload.ts:143-146`). A `.svg` or `image/tiff` therefore passes the client check and fails server-side. [C]

### 2.1 Client-side — 20 distinct strings (the API is never called)

| # | Message | Location |
|---|---|---|
| U1 | `"<name>" is not a PDF, image or Office document.` | `AttachmentUploadDialog.tsx:115` |
| U2 | `<n> of those files are not a PDF, image or Office document.` | `AttachmentUploadDialog.tsx:116` |
| U3 | `"<name>" is over 10 MB.` | `AttachmentUploadDialog.tsx:122` |
| U4 | `<n> of those files are over 10 MB.` | `AttachmentUploadDialog.tsx:123` |
| U5 | `An empty file can't be attached.` | `AttachmentUploadDialog.tsx:126` |
| U6 | `This form already has all its files, so remove one before adding another.` | `AttachmentUploadDialog.tsx:132` |
| U7 | `You can add <n> more file(s) here.` | `AttachmentUploadDialog.tsx:133` |
| U8 | `Only <n> more file(s fit) on this form.` | `AttachmentUploadDialog.tsx:139` |
| U9 | `Upload failed.` | `AttachmentUploadDialog.tsx:210`; `AttachmentCard.tsx:275` |
| U10 | `One file did not upload. Press the retry arrow to send it again, or remove it from the list.` | `AttachmentUploadDialog.tsx:413-415` |
| U11 | `<n> files did not upload. Press the retry arrow to send them again, or remove them from the list.` | `AttachmentUploadDialog.tsx:413-415` |
| U12 | `Use a PDF, picture or document (PNG, JPG, Word, Excel).` | `AttachmentFileDialog.tsx:86` |
| U13 | `Attachments must be 10 MB or smaller.` | `AttachmentFileDialog.tsx:90`; `AttachmentCard.tsx:238` |
| U14 | `That file is empty.` | `AttachmentCard.tsx:236` |
| U15 | `Could not remove that attachment.` | `AttachmentCard.tsx:296` |
| U16 | `Must be 10 MB or smaller.` | `LoaOtherAttachmentsCard.tsx:84`, `OtOtherAttachmentsCard.tsx:85`, `RecordOtherAttachmentsCard.tsx:86` |
| U17 | `<name> is not a photo or PDF.` | `AssistantChat.tsx:188` |
| U18 | `<name> is larger than 10 MB.` | `AssistantChat.tsx:192` |
| U19 | `The assistant could not reply. Please try again.` | `AssistantChat.tsx:268` |
| U20 | `Could not read that preview.` | `lib/attachment-upload.ts:176` |

Also present but not error copy: the blocked state `All 8 files added. Remove one to add another` (`LoaOtherAttachmentsCard.tsx:233` and the two siblings) — a silent cap with no toast.

### 2.2 Server-side — 14 distinct strings, 6 of them overriding a table code

| # | Message | Code | Location |
|---|---|---|---|
| U21 | `That file type can't be stored here. Attach a PDF, image or Office document.` | `UNSUPPORTED_MEDIA_TYPE` | `upload.ts:121-125` |
| U22 | `That file is empty or could not be read.` | `BAD_REQUEST` | `upload.ts:130-133` |
| U23 | `Attachments must be 10 MB or smaller.` | `PAYLOAD_TOO_LARGE` | `upload.ts:136-139` |
| U24 | `That file's contents don't match its type. Please pick the original file.` | `UNSUPPORTED_MEDIA_TYPE` | `upload.ts:148-152` |
| U25 | `That preview is too large.` | `PAYLOAD_TOO_LARGE` | `upload.ts:177` |
| U26 | `` That file type isn't accepted here. Allowed: ${allowedMime.join(', ')}. `` | `UNSUPPORTED_MEDIA_TYPE` | `files/services/file.service.ts:48-51` |
| U27 | `` Files must be ${limit} MB or smaller. `` | `PAYLOAD_TOO_LARGE` | `file.service.ts:53-58` |
| U28 | `File not found.` | `NOT_FOUND_ERROR` | `file.service.ts:93`, `:187` |
| U29 | `Could not create a download link.` | `GENERAL_ERROR` | `file.service.ts:96-99` |
| U30 | `That file link cannot be read here.` | `FORBIDDEN` | `file.service.ts:154-158` |
| U31 | `That attachment is no longer available.` | `NOT_FOUND_ERROR` | `file.service.ts:163-166` |
| U32 | `That photo is too large.` | `PAYLOAD_TOO_LARGE` | `profile/services/photo-storage.ts:84` |
| U33 | `File storage is not configured. Add the B2_* variables to api/.env.` | `SERVICE_UNAVAILABLE` | `files/repositories/b2.repo.ts:36-39` |
| U34 | `Storage rule is "b2-only" but B2 is not configured.` | `SERVICE_UNAVAILABLE` | `storage/services/storage.service.ts:272-275` |

Framework-level, before any controller: `The request body is not valid JSON.` (`BAD_REQUEST`, `error/global.ts:12-17`) and bare `PAYLOAD_TOO_LARGE` → `The request is too large.` (`global.ts:18-21` + `codes.ts:75-79`). A JSON body over `BODY_LIMIT` therefore dies in body-parser and never reaches zod, so "file too big" can surface with two different texts depending on how far the request got.

**There is no quota/"disk full" error at all.** Grepping `quota|no space|ENOSPC|storage full` across `api/src` finds only the *AI* quota; a full B2 bucket surfaces as whatever the storage SDK throws, wrapped by `INTERNAL_SERVER_ERROR` with a raw message. `STORAGE_GUIDE.md:191-196` shows `File type not allowed` / `File too large`, but those strings live in an operator-doc snippet, **not** in the app — do not treat them as UI copy.

**Client/server split, in one line.** Size is checked on both sides with the same 10 MB number (two independent constants, U3/U13 vs U23); type is checked three ways (client mime/ext, server mime, server magic bytes) and the three disagree on edge types; count is client-only (`MAX_FILES = 8`) with no server counterpart.

---

## 3. Auth / session

### 3.1 What actually reaches the user per failure

| Case | What the user sees | Evidence |
|---|---|---|
| Wrong ID number or password | Form-level `That ID number and password don't match an account.` — deliberately vague. The server's `Wrong ID number or password.` is **swallowed**: `signIn()` converts any 401 into `{ ok: false }`. | `LoginForm.tsx:71`; `auth.functions.ts:15-17`; `auth.service.ts:73` |
| Same, 10th+ attempt | `Too many sign-in attempts. Please wait 15 minutes and try again.` (429, custom message; 10/ID + 20/IP per 15 min) | `auth.service.ts:44-51` |
| Empty fields | Per-field messages `Enter your ID number.` / the empty-password message are computed and focused — **but never rendered**: only `id="signin-error"` exists, while `aria-describedby` points at `id-number-error` / `password-error`, which no element carries. | `LoginForm.tsx:53-54`, `:201`; grep finds no `id="password-error"` |
| Expired cookie / account deleted / password changed elsewhere / demoted role | All four collapse into `UNAUTHORIZED` → `Please sign in first.` Then the client's global handler fires: toast `Your session expired. Please sign in again.` + navigate to `/`. Identical copy for three different causes; nothing tells an ex-employee their account is gone. | `session.service.ts:112-139` (returns `null` in all four branches); `auth.middleware.ts:12-15`; `codes.ts:27-31`; `router.tsx:36-47` |
| 401 while already on `/` | Handler still clears caches but **skips the toast** (`if (pathname !== "/")`), so a failed session fetch on the login page is silent. | `router.tsx:41-45` |
| Cookie OK but API gone (offline page load) | Route guard `ensureQueryData` rejects (`retry: false`), `beforeLoad` does not catch → router `errorComponent` → `This page didn't load` / `Something went wrong on our end. You can try refreshing or head back home.` Not the "offline" copy, and not the login page. | `queries.ts:8-11`; `_app.tsx:13-19`; `RouteError.tsx:11-15` |
| Missing module grant, typed URL (`/hr`, `/admin`, `/rgc-asset-inventory`) | **Nothing at all.** Silent `redirect` to `/choose` (403→ `/records` for non-admin). No toast, no page, no explanation. | `routes/hr.tsx:23`; `routes/admin.tsx:24`; `routes/rgc-asset-inventory.tsx:28` |
| Missing module grant, in-page API call | `403 FORBIDDEN` with `You do not have access to this application.` — shown verbatim by `friendlyError` (short, non-technical, so it is passed through). | `access.middleware.ts:24-30` |
| Non-admin hits an admin API | `Only an administrator can do this.` (custom 403). | `auth.middleware.ts:28-33` |
| Change password, wrong current | `Current password is incorrect.` (400, custom) | `auth.service.ts:174-177` |
| Change password, too short | Client blocks the button; server would say `Password must be at least 4 characters.` | `ChangePasswordForm.tsx:82`; `auth.service.ts:158-164`; `PASSWORD_MIN_LENGTH = 4` at `schemas.ts:628` |
| Change password, mismatch | `New passwords don't match.` (client, duplicated from the zod message) | `ChangePasswordForm.tsx:19`; `schemas.ts:639` |
| Change password, other device | Sign-out on next request; on this device the cookie is re-issued (`SessionService.start`) | `auth.controller.ts:54-68` (re-issue at `:61`) |
| Sign-out fails (network) | **Nothing.** The cache is cleared *before* the call, so the user is already half signed-out; the catch closes the modal and rethrows into `void handleSignOut()`, i.e. an unhandled rejection. No toast, no message. | `SignOutButton.tsx:45-51`, invoked as `void handleSignOut()` at `:67` |

### 3.2 "Locked / deactivated account" does not exist

No account-status column, no `is_active`, no lock flag: grepping every migration under `api/drizzle/migrations/*.sql` for `is_active|deactivated|status` returns nothing, and `SessionService.currentUser` validates only `row.role === 'admin' | 'user'`. The only "locked" behaviour is the traffic throttle above (10 failures/ID, 20/IP, 15 min). [C] A deactivated account is modelled as **deleted** (`!row` → cookie cleared → 401). This is a scope correction to the brief, not a bug.

### 3.3 Distinct user-visible strings — 20

A1 `Enter your ID number.` (`LoginForm.tsx:53`) · A2 empty-password field message (`LoginForm.tsx:54`, same pattern as A1; literal masked by the file reader at review time, not quoted here) · A3 `That ID number and password don't match an account.` (`:71`) · A4 `Your session could not be started. Please try again.` (`:78`) · A5 `Sign-in failed. Please try again.` (`:96`) · A6 `Caps Lock is on` (`:180`) · A7 `Your session expired. Please sign in again.` (`router.tsx:42`, `toast.ts:44`) · A8 `You appear to be offline. Check your connection and try again.` (`toast.ts:42`) · A9 `New passwords don't match.` (`ChangePasswordForm.tsx:19`) · A10 `Could not update password.` (`ChangePasswordForm.tsx:30`) · A11 `Wrong ID number or password.` (`auth.service.ts:73`) · A12 `Too many sign-in attempts. Please wait 15 minutes and try again.` (`auth.service.ts:50`) · A13 `Password must be at least 4 characters.` (`auth.service.ts:162`) · A14 `Current password is incorrect.` (`auth.service.ts:175`) · A15 `Only an administrator can do this.` (`auth.middleware.ts:31`) · A16 `You do not have access to this application.` (`access.middleware.ts:28`) · A17 `You've been signed out` (`load-error.ts:53`) · A18 `For your security, sign in again to keep working. You'll come back to this page.` (`load-error.ts:54-55`) · A19 `You don't have access to this page` (`load-error.ts:56`) · A20 `Ask your system administrator to give you access.` (`load-error.ts:57`).

Plus one **absence**: the silent route redirect (§3.1) has no string to count — that is the gap, not a message.

**Session length copy is hardcoded.** The login page says `a session ends on its own after 12 hours` (`LoginForm.tsx:242`) from `web/src/config/app.ts:47`, while the server reads `SESSION_MAX_AGE_SECONDS` (default `60*60*12`, `api/src/core/config/index.ts:40-43`). Both defaults agree today; if the env var is changed, the login page lies. [C]

---

## 4. Live updates (SSE)

`web/src/lib/live-updates.tsx` — one `EventSource` per signed-in tab on `/updates/stream`, mounted in `__root.tsx:31`, **returns `null` and holds no state**. [C]

- **On disconnect**, `source.onerror` closes the stream and reconnects on its own schedule: 2 s, 4 s, 8 s … capped at 60 s (`live-updates.tsx:132-142`, constants `:33-34`). The server deliberately does not back off, so this is pure client-side.
- **No UI whatsoever.** No banner, no badge, no toast, no `aria-live`, no `data-` attribute — the component cannot render anything, by construction. A tab can be silently "not live" for an hour and every screen still looks current.
- **A 401 on reconnect is indistinguishable from a network blip**: `onerror` fires for both, and the stream path is exempt from the rate limiter (`rate-limiter.ts:17`), so nothing upstream ever clears the retry.
- **Auth is checked once per connect, not per event** — the controller comment states a revoked session keeps receiving `{v}` hints until it reconnects (`updates.controller.ts:11-14`). No data leaks, but the "live" claim silently degrades.
- **Recovery is invisible but real**: `onopen` refreshes only after the first successful connect (`live-updates.tsx:101-107`), and `visibilitychange` (>30 s away) or `online` triggers a refresh (`:145-155`).

**Distinct user-visible strings: 0.** Any component that promises "reconnecting…" would be inventing a state the app never exposes.

---

## 5. Network / silent failures

### 5.1 Strings that exist — 15

| # | Message | Location |
|---|---|---|
| N1 | `Could not reach the server. Check your connection.` (status **0**, code `NETWORK_ERROR`) | `lib/api-client.ts:92` |
| N2 | `Something went wrong. Please try again.` (envelope with no `error.message`, incl. an HTML 502) | `lib/api-client.ts:108` |
| N3 | `The server sent an empty answer.` (2xx with no `document`) | `lib/api-client.ts:126` |
| N4 | `Can't reach the server` | `inventory/lib/load-error.ts:47` |
| N5 | `Check your connection, then try again.` | `load-error.ts:48` |
| N6 | `No connection` (footer label for status 0) | `load-error.ts:83` |
| N7 | `Something went wrong` / N8 `We couldn't load this page. Try again, and if the problem continues, contact your system administrator.` | `load-error.ts:38-42` |
| N9 | `This page didn't load` / N10 `Something went wrong on our end. You can try refreshing or head back home.` | `RouteError.tsx:11-15` |
| N11 | `Page not found` / N12 `The page you're looking for doesn't exist or has been moved.` | `NotFound.tsx:8-11` |
| N13 | `The preview is not ready yet. Try again in a moment.` | `lib/save-pdf.ts:670` |
| N14 | `Could not save the PDF.` | `save-pdf.ts:651` |
| N15 | `<name> could not be added to the PDF.` / `<n> attachments could not be added to the PDF.` | `save-pdf.ts:644-648` |

`NETWORK_ERROR` is **not a member of `ErrorCodes`** — it is invented in the browser (`api-client.ts:92`). `describeLoadError` keys off HTTP *status*, not code, which is why it already handles it (`load-error.ts:44-62`).

### 5.2 Silently swallowed — a failure that looks like an empty state

| Where | Swallow | User-visible consequence |
|---|---|---|
| `features/profile/onboarding.ts:63-69` | `loadProfileForGate` catches and returns `undefined` | A failed profile read is read as "profile complete": the welcome is skipped and the user starts with half a profile |
| `lib/api-client.ts:132-134` | `documentsOf` returns `[]` when `documents` is absent | A malformed success envelope renders as "no rows" instead of an error |
| `web/src/api/hr.functions.ts:74-78` | `document?.unread ?? 0`, `documents ?? []` | A failed notification fetch shows "0 unread" — indistinguishable from an empty inbox |
| `features/hr/components/HrSidebar.tsx:68` | `queue ?? []` | The HR badge shows 0 pending when the queue call failed |
| `features/admin/components/AdminDashboard.tsx:54,750,846` | `data?.formEvents ?? []`, `data ?? []` | Dashboard panels render zeros/empty charts on failure |
| `features/admin/components/AppAccess.tsx:147` | `data?.people ?? []` | Empty roster, no error |
| `lib/save-pdf.ts:523-555`, `:587-590` | attachment load/merge failures pushed to `skipped` | Correct (partial success is stated), but only after the PDF exists |
| `lib/draft.ts:59-62` | catch → `null` | Draft backup lost silently (documented trade-off) |
| `lib/pwa.ts:140-142` | `register().catch(() => {})` | "Installable / offline shell" is simply absent |
| `lib/signature.ts:350-353` | `console.warn` on quota | Signature backup lost, console-only |
| `components/common/SignOutButton.tsx:45-51,67` | catch rethrows into `void handleSignOut()` | Sign-out failure = unhandled rejection, no message, user left half signed-out |
| `api/src/apps/ai/services/ai-quota.service.ts:29-34` | count failure → `0`, "fail open" | A broken counter silently removes the AI limit (server-side, no user message) |
| `live-updates.tsx` (whole file) | no state | §4 |

---

## 6. Totals

| Section | Distinct user-visible strings |
|---|---|
| 1. Zod validation (custom only; zod defaults uncounted) | **18** |
| 2. Uploads / files (20 client + 14 server) | **34** |
| 3. Auth / session | **20** |
| 4. Live updates | **0** |
| 5. Network / silent failures | **15** |
| **Total, deduplicated within sections** | **87** |

For scale: the web app has **98** `toast.*` call sites (`grep -c 'toast\.(error|info|warning)' web/src`), so this brief's five areas cover roughly a third of the total error surface. Duplicates across sections exist (`Attachments must be 10 MB or smaller.` U13/U23, `New passwords don't match.` Z10/A9, `Enter your ID number.` Z2/A1); a global dedupe would land near 83.

---

## 7. What a component built only from `ErrorCodes` would miss

1. **Offline / unreachable API.** `NETWORK_ERROR` + `status: 0` exist only in the client (`api-client.ts:92`); zero presence in `codes.ts`. `ErrorCodes["NETWORK_ERROR"]` is `undefined` → the component must special-case status 0 or it renders nothing useful. This is the single most common real-world failure and the only one the table cannot describe.
2. **Which field failed.** `VALIDATION_ERROR` carries N issues as `"path: message"` strings in `suggestions` (`validate.ts:22-27`), and the default path throws them away (`toast.ts:47-48`). A code-keyed component can only print one sentence; the field-level information exists on the wire but has no consumer and no structured shape.
3. **Five different texts behind one code.** `PAYLOAD_TOO_LARGE` renders as `The request is too large.`, `Attachments must be 10 MB or smaller.`, `That preview is too large.`, `That photo is too large.`, `Files must be N MB or smaller.`; `UNSUPPORTED_MEDIA_TYPE` as `This type of file is not accepted.`, `That file type can't be stored here. …`, `That file's contents don't match its type. …`, `That file type isn't accepted here. Allowed: …`. Code alone cannot pick the copy, and the client-side upload toasts (U1-U20) never involve a code at all.
4. **Session death is not rendered — it is a redirect.** 401 on any non-session path never reaches a component: `api-client.ts:104` calls the global handler, which toasts `Your session expired. Please sign in again.` and navigates (`router.tsx:36-47`). Meanwhile a 403 from a route guard produces *no* message (silent redirect), and the same 403 from the API produces `You do not have access to this application.` A code-driven component would duplicate the toast, fight the redirect, and still miss the silent case.

Also outside the table, with no code at all: the live-update stream (0 strings, no state), `RouteError`/`NotFound` render nothing but hardcoded copy, and `friendlyError` rewrites 5 codes into different sentences than the table — so the same code has two possible user-facing texts depending on which path renders it.

---

## 8. Open / unverified

- **`LoginForm.tsx:54`** — the empty-password message literal could not be read verbatim (masked by the file-reading tool). Behaviour and position are certain; the exact wording is not quoted. Read the raw line to fill it in.
- **Exact zod default wording** — asserted from the pinned `zod@3.25.76`, not observed in a running app. A single `POST /api/auth/sign-in` with `{}` would confirm the strings in `suggestions`.
- **A >15 MB body vs `MAX_UPLOAD_BASE64`** — arithmetic says a 10 MiB file (~13.98 MB of base64) plus JSON overhead stays under `BODY_LIMIT=15mb`, but no request was sent, so the boundary behaviour (413 from body-parser vs from `readUpload`) is unconfirmed.
- **Storage-backend failures** — what a full/unauthorised B2 bucket actually throws was not traced past `FileStorageService`; it lands as `INTERNAL_SERVER_ERROR` with the raw SDK message, which `friendlyError` will then filter by its `looksTechnical` heuristic (`toast.ts:58-62`).
- **`accounts` status** — confirmed absent from migrations, not from a live schema dump; if a column exists outside `api/drizzle/migrations`, §3.2 would need revising.
