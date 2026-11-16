# SwiftSlip web — how errors reach the user today

Read-only survey of `web/src`, taken 16 Nov 2026. Nothing under `web/src` was modified; this file is the only artefact.
Every claim below is tied to `path:line`. Anything I could not verify is marked **Unverified** in §10.

---

## 0. Scope and method

| Step | What I did |
|---|---|
| Contract | Read `lib/api-client.ts`, `lib/toast.ts`, the four `components/common/*` error components, `routes/__root.tsx`, `router.tsx` in full. |
| Surface census | Grepped `toast.error(`, `friendlyError`, `<ErrorState`, `errorElement\|errorComponent`, `isError`, `onError:`, `onMutate:`, `retry:`, `role="alert"`, `aria-live`, `suggestions`, `safeParse`, `409\|CONFLICT\|LOCKED`. |
| Counting | PowerShell `Select-String` over `web/src/**/*.{ts,tsx}`; counts are per call site (one line each), excluding the two illustrative lines inside the `lib/toast.ts` docblock. |
| Code taxonomy | Read `api/src/common/shared/utils/error/codes.ts` — the closed list of 19 API error kinds — so "no UI for this kind" is a check against a real list, not a guess. |
| Version | `web/package.json`: `@tanstack/react-query ^5.101.1`, `@tanstack/react-router 1.170.41`, `sonner ^2.0.7`, `react 19.2.0`, `vite 8.1.5`. The app is a Vite SPA (`web/src/main.tsx`), every call goes over HTTP via `api-client.ts`. |

---

## 1. The one existing reusable component: `ErrorState`

`web/src/components/common/ErrorState.tsx` — 148 lines, the only error component with a props API designed for reuse.

### 1.1 Exact props (`ErrorStateProps`, `ErrorState.tsx:50–64`)

| Prop | Type | Required | Default | Notes |
|---|---|---|---|---|
| `icon` | `LucideIcon` | no | `CircleAlert` | "Line icon in the tile." Rendered at `size-5`, `strokeWidth 1.5` (`:98–100`). |
| `title` | `string` | **yes** | — | `<h2 className="error-state__title">` (`:102`). |
| `description` | `string` | no | — | One or two lines, `<p className="error-state__text">` (`:103`). |
| `primaryAction` | `ErrorStateAction` | no | — | The single filled button (`:107–119`). |
| `secondaryAction` | `ErrorStateAction` | no | — | Quiet button — **ignored when `details` is set** (`:121–137`). |
| `details` | `string \| null` | no | — | Clipboard payload; renders a `Copy error details` → `Copied` / `Couldn't copy` button (`:81–91`, `:129–136`). |
| `meta` | `string \| null` | no | — | Technical footer, e.g. `Error 503 · Nov 16, 2026, 09:02 AM` (`:141`). |
| `className` | `string` | no | — | Merged through `cn()` (`:97`). |

`ErrorStateAction` (`:41–48`): `{ label: string; onClick: () => void; icon?: LucideIcon; busy?: boolean; busyLabel?: string }`.
`busy` disables the button and swaps in `busyLabel` — the only built-in loading story (`:111–117`).

Structural facts that matter to any successor:

- `role="alert"` on the root (`:97`) — the only error component besides `LoginForm`, `PhotoCropDialog`, `ShowroomDrawer`, `ViewAssetDrawer` that announces itself.
- There is a hidden `role="status"` live region for the copy result (`:143–145`).
- **No** `code`, `status`, `variant`, `size`, `onRetry`, or `compact` prop. The HTTP status and error code never arrive as props; they are pre-formatted into `meta` and `details` by the caller.
- Copy is deliberately kept out of the component: the API's raw message must not appear in `description` (docblock `:26–29`; enforced by `load-error.test.ts:20–21`).
- Styling lives in `web/src/styles.css:1552–1627` (`.error-state*`), with the filled action tinted by `--error-state-accent` falling back to `--primary` (`styles.css:1582–1583`; the inventory theme sets the token at `:1427`). The block is theme-neutral on purpose so the blue app and the orange inventory app share it.

### 1.2 The only consumer

`features/inventory/components/AssetTableError.tsx:80–94` wraps it in the assets-table chrome (inert tab strip and toolbar, `:52–78`) and supplies copy from `features/inventory/lib/load-error.ts`:

- `describeLoadError()` maps status → title/description: `0` offline (`load-error.ts:45–50`), `401` signed out (`:51–57`), `403` no access (`:58–63`), `404` not found (`:64–69`), everything else generic (`:70–71`).
- `meta` = `` `Error ${status} · date, time` `` and is suppressed for 401/403/404 (`:88–92`, `:36` `WITHOUT_META`).
- `details` is a 4–5 line clipboard payload: page, ISO timestamp, status+code, raw message, suggestions (`:93–99`).
- Coverage: 5 unit tests (`features/inventory/lib/load-error.test.ts`), including "hides the API message in the details" (`:20–21`).

Dev harness: `web/__states.html` → `web/src/__states.tsx`, which renders `AssetTableError` with a synthetic `ApiError(503, 'SERVICE_UNAVAILABLE', …)`. It is a separate HTML entry, not reachable from the app.

---

## 2. The other error components, and how each differs

| | `ErrorState` | `RouteError` | `NotFound` | `FormUnavailable` | `__states.tsx` |
|---|---|---|---|---|---|
| File | `common/ErrorState.tsx` | `common/RouteError.tsx` | `common/NotFound.tsx` | `common/FormUnavailable.tsx` | `src/__states.tsx` |
| Trigger | caller decides | router `errorComponent` (`routes/__root.tsx:18`) | router `notFoundComponent` (`:17`) | `isMissingRow(error)` in an editor | dev only |
| Props | 8 (see §1.1) | `ErrorComponentProps` (`error`, `reset`) | **none** | `{ backTo, label }` | — |
| Layout | in-flow block, `error-state` | `min-h-screen` centred | `min-h-screen` centred | `min-h-full` centred | viewport |
| Icon | caller-supplied, neutral tile | none | none (giant “404”) | `FileQuestion` in a tile | via AssetTableError |
| Actions | 1 filled + 1 quiet **or** Copy | `Try again` (invalidates router + `reset()`) + `Go home` | `Go home` | `Back to {label}` + `Go home` | none (no-op) |
| Shows code/time | `meta` + `details` (caller-formatted) | **no** — `console.error(error)` only (`RouteError.tsx:4`) | no | no | yes (via load-error) |
| Announced | `role="alert"` | no | no | no | `role="alert"` |
| Reused by | 1 place (inventory) | every route (root only) | every route (root only) | **7** editors | — |

`FormUnavailable` consumers (all one line of logic each):

`CosEditor.tsx:288`, `LoaEditor.tsx:326`, `LiqEditor.tsx:277`, `ObEditor.tsx:437`, `OtEditor.tsx:301`, `RecordEditor.tsx:357`, `HrObDetailPage.tsx:246`.

`FormUnavailable`'s docblock (`:4–15`) records why it exists: without it a deleted form fell through to the loading skeleton forever, and on hard load surfaced as the router's generic crash screen.

**Duplicated layout.** `RouteError`, `NotFound`, `FormUnavailable`, the `ObEditor` local boundary (`ObEditor.tsx:969–985`) and `AssetTableError`'s inner block are five hand-rolled variants of the same "centred icon + title + sentence + one/two buttons" composition. Only one of them (`ErrorState`) is parameterised.

---

## 3. Every surface, grouped by pattern (counts)

**Totals:** 89 `toast.error(` call sites in 36 files (§P1 46 + §P2 43); 11 content-area failures (4 with a retry control — P3 ×3, P5 ×1 — and 7 without, P4); 1 `ErrorState` consumer; 7 `FormUnavailable` consumers; 1 router error component; 1 local boundary; 6 editor save-status labels; 1 global 401 handler.

### P1 — Toast only, raw message passed through · **46 call sites**
Shape: `toast.error(e instanceof Error ? e.message : "<fallback>")` or `err.message`.
The API's own wording (Postgres text, zod paths, `ErrorResponse` copy) goes straight to a toast that disappears on its own. No code, no status, no retry, no persistence.
Examples: `RecordEditor.tsx:405`, `OtEditor.tsx:345`, `LoaEditor.tsx:376`, `LiqEditor.tsx:342`, `CosEditor.tsx:332`, `HrObDetailPage.tsx:273`, `UserManagement.tsx:782`, `AppAccess.tsx:125/136/141`, `DataRetention.tsx:157`, `Storage.tsx:111`, `AttachmentCard.tsx:275/296`, `RecordsList.tsx:65`, `LoginForm.tsx:95`.

### P2 — Toast only, curated copy · **43 call sites** (36 fixed copy + 7 via `friendlyError`)
Two sub-kinds, and they behave identically to the user:
- **client-side pre-flight** (file type/size, empty required pickers, password length, "write a rough reason first"): `AttachmentUploadDialog.tsx:113/120/126/130/139`, `UserManagement.tsx:723–744`, `ProfileForm.tsx:147–185`, `OnboardingFlow.tsx:126–183`, `BiometricImportDialog.tsx:63/67`, `CosFormFields.tsx:300`, `AttachmentFileDialog.tsx:86/90`.
- **curated server-failure copy via `friendlyError()`** — only **7** sites: `HrObDetailPage.tsx:344`, `ObEditor.tsx:512/608/634/659`, `ObItineraryTable.tsx:455/474`.

`friendlyError` (`lib/toast.ts:38–70`) knows exactly 5 codes — `NETWORK_ERROR`, `UNAUTHORIZED`, `FORM_LOCKED`, `VALIDATION_ERROR`, `REQUIRED_FIELD_MISSING` — and otherwise passes a message through if it is <160 chars and does not look technical (`:55–62`). So P1 and P2 collapse into the same visual result for 15 of the 19 API error kinds.

### P3 — Inline destructive banner + `Try again` · **3 call sites**
`border-destructive/30 bg-destructive/5` box, raw `error.message`, underlined retry:
- `HrQueue.tsx:446–456` (HR queue query)
- `ObList.tsx:241–251` (OB form list query)
- `AdminDashboard.tsx:81–91` (dashboard totals query)

Persistent while the query stays errored, but no `role="alert"` (`HrQueue.tsx:447`, `ObList.tsx:242`, `AdminDashboard.tsx:82`), no code, and retry is a bare `refetch()`.

### P4 — Inline paragraph or card, **no retry** · **7 call sites**
- `AppAccess.tsx:274–275` — `<p className="mt-4 text-sm text-destructive">{error}</p>`, message derived at `:237`.
- `AdminDashboard.tsx:774–777` (activity feed) and `:927–930` (security feed) — bare muted paragraph.
- `ActivityLogs.tsx:835–840` — bare muted paragraph in the table body.
- `InventoryShowroomsPage.tsx:228–235` — neutral card, `Could not load the showrooms.`, plus `text-xs text-red-600` raw detail via `messageOf()`.
- `InventoryReportsPage.tsx:195–201` — same shape, `Could not build the report.`.
- `StorageOrphanCleanupDialog.tsx:351–354` — neutral card, "Close this window and try again."

Only recovery: navigate away, or (AppAccess/AdminDashboard) wait for a background refetch. None has `role="alert"`.

### P5 — Full-section `ErrorState` · **1 call site**
`InventoryHomePage.tsx:387–394` → `AssetTableError` → `ErrorState`. The only place in the app that shows a status code, a timestamp, and a copyable payload. `retrying={isFetching}` gives the button a busy state.

### P6 — Full-section `FormUnavailable` (dead row) · **7 call sites**
Listed in §2. Chosen by `isMissingRow(error)` (`lib/missing-row.ts:13–16`), which is `/not found/i.test(message)` — **message text, not `status`**. The docblock (`:1–12`) still explains this by TanStack Start server functions answering `200` with `$TSR/Error`, which is no longer how the app talks to the API (`api/records.functions.ts:12–24` uses `api-client` with real status codes; the API throws `NOT_FOUND_ERROR` / 404, e.g. `api/src/apps/records/services/record.service.ts:58`, `api/src/apps/cos/services/cos.service.ts:54`). The client ignores a status code it now has.

### P7 — Router error component · **1 registration, all routes**
`routes/__root.tsx:18` `errorComponent: RouteError`. No nested `errorComponent` anywhere; a throw inside any route component or `beforeLoad` lands on the full-screen "This page didn't load" + `Try again` / `Go home`. Includes the session guard in `routes/_app.tsx:12–22`: a network failure on `ensureQueryData` there is indistinguishable from a crash.

### P8 — Local React error boundary · **1**
`ObEditor.tsx:952–985` — class boundary, "The editor could not load." + `Refresh` (`window.location.reload()`), `console.error` only. The other five editors have none, so their render crashes fall to P7.

### P9 — Field-level inline · **4 renderers**
- `LoginForm.tsx:129–138` — form-level `role="alert"` block; raw `err.message` at `:95–97` for anything that is not a 401 (`auth.functions.ts:17` turns 401 into `{ok:false}`, which gets the fixed vague copy at `:71`).
- `LoginForm.tsx:55–60` — per-field messages are built (`"Enter your ID number."`, a password one) and stored in `fieldErrors`, but `fieldErrors` is only ever read at `:105–106` (red frame) and `:164`/`:201` (an `aria-describedby` pointing at `id-number-error` / `password-error`, **ids that exist nowhere in the DOM** — grep for `id="id-number-error"`: 0 hits). So an empty-field submit gives a red box with no sentence and a dangling ARIA reference.
- `TextField` error prop (`components/common/FormField.tsx:82–89`) — red frame + one red line; used by `UserManagement.tsx` (`idError`) and `ChangePasswordForm.tsx:76`.
- `PhotoCropDialog.tsx:182–186` — `role="alert"` line for a failed crop/prepare.

Plus decorative red borders that are *not* error surfaces: `ObFormFields.tsx:151`, `ObSection.tsx:104`, `ObItineraryTable.tsx:113`, `SignaturePad.tsx:113`, `PlaceChips.tsx:104`, `AssistantChat.tsx:512`, `HrObDetailPage.tsx:369` (Reject button), `StatusBadge.tsx:64` (status pill).

### P10 — Per-file upload status + retry · **1 component, all attachment kinds**
`AttachmentUploadDialog.tsx`: each queued file carries `status: "ready" | "uploading" | "done" | "failed"` and `error` (`:23–30`); a failure stores `err.message` on the row (`:209–215`); the row shows `· <error>` (`:369`); a retry arrow re-queues it (`:230–234`, `:384–392`); a summary line says "N files did not upload" (`:411–416`). The dialog stays open while anything failed (`:225–226`). This is the only place in the app with a genuine per-item partial-failure model.

### P11 — Editor save status text · **6 editors**
`saveStatus: "saving" | "saved" | "error" | "idle"` from `lib/auto-save.ts:31`, rendered as a small header label:
`CosEditor.tsx:380–385` + `:406–413`, `LoaEditor.tsx:408/434–440`, `LiqEditor.tsx:352/382–388`, `ObEditor.tsx:448/698–704`, `OtEditor.tsx:389/415–421`; `RecordEditor.tsx:562–568` puts it inside the button instead.
A background auto-save failure (`auto-save.ts:87–92` swallows the error and only calls `onStatus("error")`) therefore surfaces as **three words, in red, with no detail and no retry**. Pressing Save again is the only recovery, and only the user who notices can do it.

### P12 — Global 401 handler · **1**
`router.tsx:36–46`: `setUnauthorizedHandler` → clear cached session, `removeQueries` for everything else, `toast.info("Your session expired. Please sign in again.")`, `router.navigate({ to: "/" })`. Triggered from `api-client.ts:104` on any 401 outside `/auth/sign-in|sign-out|session`. Note it is `toast.info`, not `toast.error`, and the navigation destroys unsaved editor state.

### Other relevant mechanics

| Thing | State today |
|---|---|
| react-query `onError` handlers | **5** total: `AppAccess.tsx:125/136/141`, `DataRetention.tsx:211`, `StorageOrphanCleanupDialog.tsx:242`. No `QueryCache`/`MutationCache` global handler (`router.tsx:9–22` sets only `staleTime`, `refetchOnWindowFocus`, `refetchOnReconnect`). |
| `retry:` | **32 of 32** query-option files set `retry: false`. Nothing retries automatically, including the session guard. |
| Optimistic updates | **0** `onMutate`; 13 `useMutation`, 75 `invalidateQueries`. Every mutation is pessimistic, so there is no rollback UI to design — but also no "we already applied this" story. |
| `toast.loading` → replace | 14 sites use `const id = toast.loading(…); toast.error(…, { id })` (`save-pdf.ts:651`, editor Word exports, `HrObDetailPage.tsx:344`). |
| `ui/alert.tsx` | **0 consumers** — shadcn `Alert` is dead code. |
| `ui/form.tsx` (`FormMessage`, `react-hook-form`) | **0 consumers** outside the scaffold file; `react-hook-form` is a dependency with no usage. |
| `suggestions` | Read in exactly 2 places: `ObEditor.tsx:604` (`obRequiredToastFromLabels`) and `load-error.ts:79/97` (clipboard payload only). |
| `role="alert"` / `aria-live` | 6 / 2 across all of `web/src`. |

---

## 4. Matrix

| Pattern | n | User sees | Retry | Code / timestamp | Persists | Announced | Recoverable data? |
|---|---|---|---|---|---|---|---|
| P1 toast, raw message | 46 | top-right toast, red | no | no | ~4 s (sonner default) | yes (sonner live region) | no |
| P2 toast, curated copy | 43 (7 via `friendlyError`) | top-right toast | no | no | ~4 s | yes | no |
| P3 inline banner | 3 | red-tinted box in place of content | **yes** (`refetch()`) | no | until success | **no** | no |
| P4 inline paragraph/card | 7 | muted or red sentence | **no** | no | until success | **no** | no |
| P5 `ErrorState` | 1 | centred block + icon tile | **yes**, with busy label | **yes** (`Error 503 · …` + copy payload) | until success | **yes** | **yes** (clipboard) |
| P6 `FormUnavailable` | 7 | centred block, "no longer available" | no (navigation instead) | no | until navigation | **no** | no |
| P7 `RouteError` | all routes | full-screen page | **yes** (`invalidate` + `reset`) | no (console only) | until success | **no** | no |
| P8 local boundary | 1 (OB) | block, "editor could not load" | reload page | no | until reload | **no** | no |
| P9 field-level | 4 | red frame + line under input | by editing | no | until edit | partly (`LoginForm`, crop) | no |
| P10 upload rows | 1 | per-file row status + summary | **yes**, per file | no | while dialog open | no | no |
| P11 save status | 6 | 2–3 words in header | re-press Save | no | until next save | **no** | no |
| P12 401 | 1 | info toast + redirect home | no (re-auth) | no | ~4 s | yes | **no — unsaved work is discarded** |

“~4 s” is sonner's default duration: `routes/__root.tsx:34` passes no `duration` (see §10).

---

## 5. Call-site table (representative sample, 36 rows)

| # | Module | File:line | Pattern | What triggers it |
|---|---|---|---|---|
| 1 | Time records | `records/components/RecordEditor.tsx:405` | P1 | `onSave` → `PUT /records/:id` rejects (409 `FORM_LOCKED`, 500, offline) |
| 2 | Time records | `RecordEditor.tsx:436` | P1 | Biometric import (`POST /records/import`) fails; overlay stays open |
| 3 | Time records | `RecordEditor.tsx:456` | P1 + toast id | Word export fails after `toast.loading` |
| 4 | Time records | `RecordEditor.tsx:357` | P6 | Editor query 404 — `isMissingRow` matches "Record not found." |
| 5 | Time records | `RecordEditor.tsx:562–568` | P11 | Background auto-save fails (`auto-save.ts:87–92`) — button reads "Save failed" |
| 6 | Time records | `RecordsList.tsx:65` | P1 | `DELETE /records/:id` fails (409 `IN_USE_ERROR`) |
| 7 | Overtime | `overtime/components/OtEditor.tsx:345` | P1 | Save fails; header also flips to P11 "Save failed" (`:389`) |
| 8 | Overtime | `OtEditor.tsx:301` | P6 | Editor row gone |
| 9 | Overtime | `OtList.tsx:61` | P1 | Delete fails |
| 10 | Leave of absence | `LoaEditor.tsx:376` | P1 | Save fails |
| 11 | Leave of absence | `LoaFormFields.tsx:530/549` | P1 | "Write for me" / "Enhance" AI call fails |
| 12 | Change of schedule | `CosEditor.tsx:332` | P1 + P11 | Save fails (`:331` sets status `error`) |
| 13 | Liquidation | `LiqEditor.tsx:342` | P1 | Save fails |
| 14 | Official business | `ObEditor.tsx:608` | P2 (`friendlyError`) | Submit to HR fails — the only editor that maps 409 `FORM_LOCKED` to plain copy |
| 15 | Official business | `ObEditor.tsx:602–606` | P2 + **field reveal** | 400 `REQUIRED_FIELD_MISSING`: reads `e.suggestions`, opens the required section, scrolls to first miss |
| 16 | Official business | `ObEditor.tsx:437` | P6 | OB detail 404 |
| 17 | Official business | `ObEditor.tsx:973` | P8 | Render crash inside the editor |
| 18 | Official business | `ObList.tsx:241–251` | P3 | Form-list query fails; red banner + Try again |
| 19 | HR | `hr/components/HrQueue.tsx:446–456` | P3 | Queue query fails |
| 20 | HR | `HrObDetailPage.tsx:273` | P1 | Approve / reject fails |
| 21 | HR | `HrObDetailPage.tsx:246` | P6 | OB detail 404 |
| 22 | Admin | `AdminDashboard.tsx:81–91` | P3 | Totals query fails |
| 23 | Admin | `AdminDashboard.tsx:774` / `:927` | P4 | Activity / security feed fails — sentence only, no retry |
| 24 | Admin | `ActivityLogs.tsx:835` | P4 | Logs page query fails — sentence only |
| 25 | Admin | `AppAccess.tsx:274` | P4 | Access overview fails — sentence only, `error` string built at `:237` |
| 26 | Admin | `UserManagement.tsx:777` | P9 | 409 `UNIQUE_FIELD_ERROR` → red frame on the ID box, caret returned |
| 27 | Admin | `DataRetention.tsx:157` / `Storage.tsx:111` | P1 (mutation `onError`) | Settings auto-save fails |
| 28 | Inventory | `InventoryHomePage.tsx:387` | P5 | Inventory query fails → full `ErrorState` with code/timestamp/copy |
| 29 | Inventory | `InventoryHomePage.tsx:226` | P1 (wrapped) | Background refetch fails while rows are on screen → `Failed to load data: <message>` |
| 30 | Inventory | `InventoryShowroomsPage.tsx:228` | P4 | Showrooms or stock query fails |
| 31 | Inventory | `InventoryReportsPage.tsx:195` | P4 | Report build fails, or `document` missing |
| 32 | Attachments | `AttachmentUploadDialog.tsx:209–215` | P10 | One of N files fails; row keeps the server message, retry arrow |
| 33 | Attachments | `AttachmentCard.tsx:275` | P1 | Single-file replace fails |
| 34 | Auth | `LoginForm.tsx:95` | P9 (raw) | 429 throttled / 500 / network on sign-in — API text shown verbatim |
| 35 | Auth | `router.tsx:42` | P12 | Any 401 mid-session → info toast + redirect to `/` |
| 36 | Any route | `routes/__root.tsx:18` | P7 | Throw in `beforeLoad` (incl. offline session check) or during render |

---

## 6. Which API error code lands where

Codes from `api/src/common/shared/utils/error/codes.ts`. "Web handling" is what a user actually experiences.

| Code | Status | Web handling today |
|---|---|---|
| `BAD_REQUEST` | 400 | none — P1 raw message |
| `VALIDATION_ERROR` | 400 | `friendlyError` copy, **only** in the 7 P2 sites that call it; elsewhere raw |
| `REQUIRED_FIELD_MISSING` | 400 | `friendlyError` copy; special field-reveal in `ObEditor.tsx:602` only |
| `UNAUTHORIZED` | 401 | global P12 redirect + `friendlyError` copy; `load-error` "You've been signed out" |
| `FORBIDDEN` | 403 | `load-error` copy in inventory only; elsewhere raw toast |
| `NOT_FOUND_ERROR` | 404 | P6 for editor rows (but detected by *message*, not status); `load-error` copy in inventory |
| `UNIQUE_FIELD_ERROR` | 409 | **field-level** in `UserManagement.tsx:777` only; `WARNING_CODES` toast level in `api/inventory.functions.ts:52` |
| `RETENTION_DISABLED` | 400 | raw toast (`DataRetention.tsx:157`) |
| `CLEANUP_IN_PROGRESS` | 409 | raw toast |
| `IN_USE_ERROR` | 409 | raw toast (warning level only for inventory options) |
| `FORM_LOCKED` | 409 | plain copy via `friendlyError` — but only OB uses it (1 of 6 editors) |
| `REFERENCED_ERROR` | 409 | raw toast |
| `PAYLOAD_TOO_LARGE` | 413 | raw toast; client pre-checks 10 MB so it is usually unreachable |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | raw toast; client pre-checks type |
| `TOO_MANY_REQUESTS` | 429 | **raw toast**; on sign-in the raw text lands in the inline form error |
| `DATABASE_ERROR` | 500 | raw toast |
| `GENERAL_ERROR` | 500 | raw toast |
| `INTERNAL_SERVER_ERROR` | 500 | raw toast / `load-error` generic |
| `SERVICE_UNAVAILABLE` | 503 | `load-error` generic ("Something went wrong") in inventory; raw toast elsewhere |
| *(client)* `NETWORK_ERROR` | 0 | `friendlyError` + `load-error`; **not** recognized by P3/P4 banners or P7 |

Only 4 of the 19 API codes have deliberate copy (plus the client-side `NETWORK_ERROR`), and only 3 codes change *structure* (field reveal, field error, dead-row page). 11 of 19 codes have no UI decision at all.

---

## 7. Gaps

### G1 — 409 conflicts mid-edit have no state
`FORM_LOCKED`, `IN_USE_ERROR`, `REFERENCED_ERROR`, `CLEANUP_IN_PROGRESS`, `UNIQUE_FIELD_ERROR` are five different situations. The web distinguishes **two**: OB submit (`friendlyError`) and the user-management ID field. In `RecordEditor`, `OtEditor`, `LoaEditor`, `LiqEditor`, `CosEditor` a form HR has just taken produces a toast that auto-dismisses, while the editor stays open and fully editable — the user keeps typing into a form the server will refuse. Nothing re-reads the row, disables the fields, or offers "reload the approved copy". Grep for `409` in `web/src`: **0 hits**.

### G2 — API field validation is never re-rendered
The API returns `suggestions: string[]` (`api-client.ts:36/41/109`) describing what failed. Only `ObEditor.tsx:604` reads it. No form maps a server field back to an input; `safeParse` in `web/src`: **0**. `TextField`'s `error` prop is wired to a *client* check plus one `UNIQUE_FIELD_ERROR` special case (`UserManagement.tsx:777–781`). So a `VALIDATION_ERROR` from a stale tab becomes a generic toast ("Some details could not be saved. Check the form and try again.") with no indication of which field, on a form that can be 40 fields long. The one place that does build per-field messages, `LoginForm`, never renders them (§P9).

### G3 — Offline, 429 and 503 are not modelled
`NETWORK_ERROR` is recognised in only two places (`toast.ts:41`, `load-error.ts:45`). Every P3/P4 banner and `RouteError` treat a dead connection as an unknown server fault: the HR queue shows the raw "Could not reach the server." sentence, and a cold load of any `/_app` route while offline hits the session guard's `retry: false` (`features/auth/queries.ts:13`) and lands on the full-screen "Something went wrong on our end" — which blames the server for the user's Wi-Fi. `TOO_MANY_REQUESTS` has no cooldown/countdown UI anywhere; on sign-in it renders the raw API sentence under the password box. `SERVICE_UNAVAILABLE` collapses to "Something went wrong" even when it means "the inventory database is not configured".

### G4 — 401 mid-action destroys work and offers the wrong action
`router.tsx:36–46` clears the whole query cache (`removeQueries` for every non-session key) and navigates to `/`. An editor with 20 minutes of typing loses the form the user was looking at; only the localStorage draft survives (`lib/draft.ts`, `auto-save.ts` tier 2), and nothing tells the user that. If the 401 arrives as a *query* error before the handler runs, `ErrorState` would offer "Try again" (`AssetTableError.tsx:86`), which can never succeed — the copy says "You'll come back to this page" (`load-error.ts:55`) but there is no sign-in action.

### G5 — Nothing persists, nothing is copyable, and most failures have no retry
46 toast sites auto-dismiss; 7 of the 11 content-area failures offer no retry at all (P4); only inventory carries a status code, a timestamp, and a clipboard payload. A user reporting "it said something about a constraint" has nothing to quote. `role="alert"` appears on only 6 elements app-wide (`ErrorState`, `LoginForm`, `PhotoCropDialog`, `ShowroomDrawer`, `ViewAssetDrawer`, `ui/alert`), so none of the 3 P3 banners, the 7 P4 paragraphs/cards, the upload summary or the OB boundary is announced to a screen reader.

### G6 — Raw `e.message` in 46 places, against the project's own doctrine
`lib/toast.ts:30–37` states that server messages "are written for debugging (error codes, zod paths, Postgres text, JSON bodies)" and must not be repeated verbatim. `friendlyError` exists for exactly that. It is used in **7** of 89 sites. `api-client.ts:9` simultaneously claims `.message` "is safe to show to the user" — the two files contradict each other, and the code follows `api-client.ts`.

### G7 — Partial and background failures are invisible
- Auto-save failure = `"Save failed"` in red, 3 words, no detail, no retry, no persistence (`P11`). The next successful auto-save silently clears it (`auto-save.ts:85`).
- PDF export's skipped attachments are a `toast.warning` that disappears (`save-pdf.ts:642–649`).
- Retention cleanup's partial failure is one paragraph inside the result panel (`CleanupResultPanel.tsx:88–93`).
- Attachment uploads are the exception and the model to copy (P10).

### G8 — Component fragmentation
Five layouts for the same idea (§2) plus 12 bespoke blocks written inline (3 P3 banners, 7 P4 paragraphs/cards, the upload summary, the OB boundary); `ErrorState` has 1 consumer while `FormUnavailable` has 7 and `RouteError` has all routes. `ui/alert.tsx` and `ui/form.tsx` are dead. Anything reusable has to either absorb these or live beside them deliberately.

### G9 — `isMissingRow` reads prose, not status
`lib/missing-row.ts:15` `return /not found/i.test(message);`. Any API message containing "not found" (e.g. "File not found." from `api/src/apps/attachments/services/attachment.service.ts:73`) is classified as a deleted row; conversely a localized or reworded API message silently downgrades a 404 to a loading skeleton. The status code is available (`ApiError.status`). The docblock's rationale is stale (§P6).

---

## 8. Forms: does the web re-render API field errors?

**No.** Verified three ways:

1. `safeParse` in `web/src`: **0**. `zod` appears 20 times there; 18 are `import type { z } from "zod"` (`api/records.functions.ts:1`, `api/inventory.functions.ts:5`, …, `features/hr/queries.ts:14`), one is a type alias using `z.ZodTypeAny` (`features/hr/queries.ts:22`), one is prose (`lib/toast.ts:32`). No runtime validator call anywhere. The shared schemas type the payload; they never validate in the browser.
2. `react-hook-form` / `FormMessage` / `@hookform/resolvers`: present in `package.json`, consumed only by the unused scaffold `components/ui/form.tsx`.
3. Every form is hand-rolled `useState` + `if` checks. `LoginForm.tsx:55–60` (empty fields), `ProfileForm.tsx:147–155` (picker "Others"), `UserManagement.tsx:718–745` (ID, password, three pickers), `ChangePasswordForm.tsx:76` (mismatch), `DataRetention.tsx:424` / `Storage.tsx:378` (numeric ranges).

So the flow is: client checks block obviously-wrong input with a toast or a red line → the request goes out → any server-side field error comes back as `ApiError` and is shown as one whole-form message (toast, or `LoginForm`'s form block). Two exceptions exist and are worth keeping in any refactor:

- `UserManagement.tsx:777–781` — `UNIQUE_FIELD_ERROR` → `setIdError("This ID number is already in use.")` + focus the ID box.
- `ObEditor.tsx:602–606` — `REQUIRED_FIELD_MISSING` → read `e.suggestions`, `setShowRequired(true)`, `revealFirstMissing()`.

The API *does* ship field detail (`suggestions`, and `validate()` failures carry zod paths per `AGENTS.md`), so the data needed for real field mapping exists; the client just never consumes it.

---

## 9. What a single reusable error state has to cover

Grouped by what the survey says it must absorb, not by what would be nice.

**1. Three densities, one component.** Full-page (P5/P7/P8, `min-h-screen` vs in-flow), section (P3/P4, replaces a card or table body), and inline (P9, under a field). `ErrorState` today only does the middle one, and its `className` escape hatch is how `AssetTableError` fakes the rest.

**2. A status→copy map that is shared, not per-module.** `load-error.ts` already encodes 0/401/403/404/generic and its tests pin the wording. It should be the single source, with the remaining codes (§6) added: 409 family, 413/415, 429, 5xx, and the "not configured" 503.

**3. Retry as a first-class prop** — `onRetry?: () => void`, `retrying?: boolean`, plus the policy: show it for network/5xx/503/429(backoff), hide it for 400/403/404/409 (retrying repeats the same refusal). Today only P3/P5/P7 have any retry, and never a policy.

**4. A code + timestamp + copy payload everywhere**, not just inventory. Requires a `meta`/`details` builder that takes `ApiError` + route + time. `load-error.ts:93–99` is the shape to reuse; the component already renders it (`:129–141`).

**5. A 409-conflict state that can change the screen**, not just talk: disable editing, offer "reload the current copy", "withdraw my changes", or "ask HR to send it back" depending on the code. This needs a hook into the editor's `canEdit`, so the component has to expose an action model beyond one `onClick`.

**6. Field-error plumbing**: accept a list of `{ field, message }` derived from `suggestions`/zod paths and hand them to the form's inputs, with a fallback "3 fields need attention" summary when the mapping fails. `TextField`'s `error` prop already exists; the missing half is `ApiError → field map`.

**7. Persistence and re-notification policy** for the toast-bound cases: either promote a dismissible toast into a sticky bar, or keep a "last error" affordance (a status chip in the editor header that opens the details payload). Today 46 failures exist for a few seconds and leave no trace; the editor's `"Save failed"` label is the closest thing to memory and carries no information.

**8. Accessibility**: `role="alert"` for appearing errors, `aria-live="polite"` for retry results, `aria-describedby` wiring to the field it belongs to (`LoginForm.tsx:107–110` is the existing pattern), and `aria-busy` while retrying.

**9. A 401 variant that preserves context**: sign-in action instead of "Try again", and a return path (`router.tsx` currently always goes to `/`, losing the route *and* the unsaved draft).

**10. Per-item partial failures**: the `AttachmentUploadDialog` row model (`status` + `error` + `retry(key)`, `:23–30`, `:230–234`) generalised to a `results: Array<{id, ok, error}>` prop, so bulk delete / bulk upload / retention runs share one failure list instead of three different summaries.

Constraints from `AGENTS.md` worth respecting: the component belongs in `components/common/`, must not introduce a second design language (tokens, `.error-state` classes, `--error-state-accent`), and any UX change needs the `ui-taste` skill and a rendered check.

---

## 10. Not verified / next steps

| Item | Why it is open | How to close it |
|---|---|---|
| Sonner's actual dismiss duration | Not configured in `routes/__root.tsx:34` (`<Toaster position="top-right" richColors closeButton />`); sonner's default is 4 s in v2, but I did not read `node_modules` | Read `sonner`'s default or add `duration` explicitly |
| Which API paths actually return 429 | `TOO_MANY_REQUESTS` exists in `codes.ts`; I did not trace which controllers raise it | `grep -rn "TOO_MANY_REQUESTS" api/src` |
| Whether any editor *re-reads* the row after a 409 | I read 2 of 6 editor catch blocks in full (`RecordEditor`, `ObEditor`); the other 4 use the same `toast.error(e.message)` shape but I did not audit their `canEdit` recomputation | Read the 4 remaining `catch` blocks end-to-end |
| `suggestions` content for `VALIDATION_ERROR` | `ObEditor` only handles `REQUIRED_FIELD_MISSING`; whether `validate()` fills `suggestions` for generic zod failures is an API-side question | Read `api/src/common/shared/utils/validate*` |
| Visual check of `ErrorState` at phone width | `styles.css:1609+` stacks actions under 640 px; not rendered | Load `web/__states.html?device=phone` |
