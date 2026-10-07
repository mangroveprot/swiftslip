# SwiftSlip / DTR-App — Top-to-Bottom Project Analysis

_Analysis date: 2026-10-06 · Scope: entire repository (`DTR-App-clean`)_

---

## 1. What this project is

**SwiftSlip** is a password-protected, multi-app internal portal built as a single
deployable. It currently hosts three distinct products behind one login:

| App | Route root | Purpose |
| --- | --- | --- |
| **SwiftSlip (DTR portal)** | `/_app/*` | Daily Time Records, Official Business (OB) forms, Leave of Absence (LOA) forms, employee profile |
| **Admin Panel** | `/admin` | Dashboard, user management, DTR template editor, 30-day activity/audit log |
| **RGC Asset Inventory** | `/rgc-asset-inventory/*` | Port of a legacy .NET/EF-Core desktop app — assets, branches, floors, Excel reports |

The flagship product is the DTR portal: employees fill in time records, import
biometric logs (AI-assisted), and print/download them as Word documents that
match the company's real paper forms pixel-for-pixel.

The Inventory module is a **rewrite in progress** — it is a faithful port of an
existing C# application (`InventoryReportService`, ClosedXML, EF Core), reaching a
**separate Postgres database** (not Supabase), with a golden test asserting the JS
Excel output is cell-for-cell identical to the .NET original.

---

## 2. Technology stack

| Layer | Choice |
| --- | --- |
| Framework | **TanStack Start 1.168** (React 19, SSR, file-based routing, server functions) |
| Build | **Vite 8** + **Nitro** (target: Cloudflare Workers `cloudflare-module`) |
| Routing / data | TanStack Router 1.170 (`routeTree.gen.ts`), TanStack Query 5 |
| UI | **Tailwind v4** (`@tailwindcss/vite`, lightningcss), **shadcn/ui** (new-york), Radix primitives, lucide icons, Recharts, Sonner |
| DB (main) | **Supabase Postgres** via `@supabase/supabase-js` (service-role admin client) |
| DB (inventory) | **`postgres`** driver — direct connection to a *separate* RGC Postgres DB |
| Migrations | **drizzle-kit** (SQL files in `drizzle/migrations/`) |
| Documents | `docx` + `docxtemplater` + `pizzip` + `docxtemplater-image-module-free` (Word), `exceljs` + `jszip` (Excel) |
| AI | **Google Gemini** (`generateContent`) — biometric import, OB chat agent, LOA chat agent, purpose/reason writing |
| Forms / validation | `react-hook-form` + `zod` + `@hookform/resolvers` |

**Scripts:** `dev`, `build`, `build:dev`, `preview`, `typecheck`, `lint`, `format`,
`test:inventory-report` (golden diff), `test:inventory-report:golden` (regenerate via .NET SDK).

---

## 3. Architecture — the core design decision

The project enforces a **strict one-directional dependency graph**, and it is
enforced in *three* independent places (README documents it, ESLint enforces it,
Vite `importProtection` enforces it at bundle time):

```
routes → features → components/lib → api → server → config/shared
```

```
src/
├── config/     the ONLY place that reads process.env (app.ts, env.server.ts, env.client.ts)
├── shared/     pure types + zod schemas + date/period logic (no React, no server, no UI)
├── server/     backend: db clients, auth, services, inventory, errors  (*.server.ts)
├── api/        THE BOUNDARY: thin createServerFn wrappers (validate → authorize → service)
├── features/   frontend by feature: {components, lib, queries.ts}
├── components/ shared UI: ui/ (shadcn), layout/, common/
├── routes/     thin routing files only
└── lib/        small frontend helpers (cn, seo, signature, file, toast)
```

**Rules in force** (`eslint.config.js`):

- `features/ components/ routes/ hooks/ lib/` **may not** import `@/server/**` or
  `@/config/env.server` — they call `@/api/*`.
- `server/ api/` **may not** import UI (`@/features|components|routes|hooks`).
- `shared/` imports neither side and **not React** (it must stay framework-free).
- Vite additionally fails the build if client code imports `**/server/**` or `server-only`.

**A request, end to end** (the pattern repeated everywhere):

```
component → useQuery/useMutation (features/<x>/queries.ts)
          → createServerFn in @/api/<x>.functions.ts   (zod validator)
          → requireUser() / requireAdmin()             (session re-check)
          → service in @/server/services/<x>.server.ts (business logic)
          → getDb()                                    (Supabase admin client)
```

This is a genuinely well-disciplined codebase. The layering is not aspirational —
it is machine-checked, and the code follows it consistently.

---

## 4. Configuration & environment

**Single source of truth:** `src/config/env.server.ts` — the *only* file that reads
`process.env`. Values are zod-validated lazily on first use and cached; a missing
value fails fast with a message listing exactly what is wrong.

| Variable | Required | Purpose |
| --- | :---: | --- |
| `SUPABASE_URL` | ✓ | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ | Server-only admin key (bypasses RLS) |
| `SESSION_SECRET` | ✓ | Seals the login cookie, 32+ chars |
| `GEMINI_API_KEY` | — | Enables AI features; blank = off |
| `GEMINI_MODEL` | — | Overrides default (`gemini-3.1-flash-lite`) |
| `RGC_INVENTORY_DATABASE_URL` | — | Separate inventory Postgres (direct connection) |
| `DATABASE_URL` | — | Only for drizzle-kit migrations |

`.env` (git-ignored) is present on disk with real values; `.env.example` is the
committed template. `env.client.ts` is deliberately empty (no client secrets).

---

## 5. Data model

### 5a. SwiftSlip (Supabase) — 9 tables

| Table | Notes |
| --- | --- |
| `users` | Accounts: unique `id_number`, `role` (admin/user), `password_hash`, created_at. Renamed from `access_codes` in migration 0010. |
| `profiles` | 1:1 with `users`: `emp_no`, `full_name`, `designation`, `area`, `signature` (data URL). Auto-fills new forms. |
| `dtr_records` / `dtr_entries` | DTR header + per-day rows (unique `record_id, day`). Owned by `owner_id`. |
| `dtr_template` | Single-row (id=1) configurable template (title, labels, default schedule/period, columns). |
| `ob_forms` / `ob_entries` | Official Business header + itinerary rows (unique `form_id, idx`). |
| `loa_forms` | Leave of Absence — single-row form with leave type, pay status, reasons, `other_attachments` jsonb (0014). |
| `activity_logs` | Audit trail with a 30-day retention trigger + read-time pruning. |

Storage: one private Supabase bucket `swiftslip`, per-user folders
`ApprovalSlip/<owner-id>/…`, accessed only via short-lived signed URLs (1 h TTL).

**RLS is enabled with no policies on every table** — i.e. only the service-role key
(used exclusively by the server) can touch data. Ownership is enforced in the
queries themselves (`.eq("owner_id", user.id)`), not by the database.

### 5b. RGC Inventory (separate Postgres)

`branches`, `locations`, `departments`, `status_options`, `condition_options`,
`asset_type_options`, `assets`, `asset_desktop_details`. Reached through
`src/server/inventory/*.server.ts` using the `postgres` driver. Explicitly **never**
mixed with SwiftSlip tables.

---

## 6. Features in detail

### Authentication & session
- Sign-in by **ID number + password** (`verifyPassword` → ILIKE-escaped lookup).
- Session is a **sealed cookie** (`swiftslip-session`, httpOnly, secure in prod,
  sameSite=lax, 12 h max age) via TanStack's `useSession`.
- **Auth enforced once** in `routes/_app.tsx` `beforeLoad`; any file dropped in
  `routes/_app/` is automatically protected and shell-wrapped. Role checks live in
  each route's own `beforeLoad` (convenience only — server functions re-check).
- Failed sign-ins are logged with ID + IP; CSRF middleware protects server functions.

### Daily Time Records (DTR)
- Create a record for a month + period (`first_half` / `second_half` / `full` /
  `custom:N-M`), edit a per-day grid, draw/upload a signature, attach a file.
- **AI biometric import**: upload a scan/export, Gemini extracts rows as strict JSON,
  merged into the sheet with a custom period spanning the imported days.
- **"Scaffold" pattern**: a brand-new record pre-filled from the profile is
  recognised as *unused* and silently swept away on exit — so abandoned auto-fills
  never pollute the list (`isScaffoldRecord`).
- Export: tokenized `dtr_template.docx` → Word; print CSS for a clean A4 sheet.

### Official Business (OB) & Leave of Absence (LOA)
These two are near-siblings and share an architecture: list → editor → live
template-replicating preview → Word export, plus an **AI chat assistant** that
patches the form field-by-field (never resets it, never touches signatures).
- OB: header + itinerary table (`ob_entries`), approval slip attachment.
- LOA: leave-type checkboxes, pay boxes, "Others:" line, reasons, report-back date,
  medical certificate + up to 8 extra attachments.
- **Attachments auto-mark approval** (OB/LOA): uploading ticks
  `attachment_approved` + `approved_via_viber`; removing clears them.

### Admin Panel (`/admin`)
- Dashboard (totals + 6-month Recharts chart + security/forms activity rails).
- User management (create/edit/delete accounts, roles).
- Activity log: search, action filters, date range, pagination, 30-day auto-prune.
- DTR template editor.

### RGC Asset Inventory (`/rgc-asset-inventory`)
- Assets table with filters, bulk actions, drawer-based editor (create/edit inline
  options), stat cards.
- Reports: build a per-branch, per-floor document → **Excel export** that must match
  the legacy .NET output exactly (enforced by a golden test).
- Settings: manage option lists (branches/departments/statuses/conditions/asset types).

---

## 7. Document generation — the most impressive engineering here

This is where the project's real depth shows. The Word/Excel outputs must match
real company paper forms and a legacy app's output, so the team took an unusual,
high-fidelity approach:

- **Word (`docx` templates + `docxtemplater`)**: The actual `.docx` templates ship
  in `public/`. One-shot **tokenizer scripts** (`scripts/loa-template-tokenize.mjs`,
  `scripts/tokenize-ob-template.mjs`) surgically inject `{tokens}` into
  `word/document.xml`, validate the result by rendering a full *and* empty fill, back
  up the original, and only then write. Export code then reaches into raw OOXML to
  nudge paragraph properties by `w14:paraId` for exact layout.
- **Excel (`exceljs`)**: `report-export.ts` (755 lines) is a **line-by-line port of
  the C# `InventoryReportService`** — including embedded **Arial/Calibri glyph-advance
  tables** and a reimplementation of ClosedXML's column auto-sizing math
  (`AdjustToContents`, `SaveRound`, EMU→pixel image sizing) so the JS output is
  cell-for-cell identical.
- **Golden test**: `scripts/inventory-report-golden/compare.mjs` diffs the JS
  workbook against a `.NET`-produced `golden.xlsx` (cells, merges, image anchors,
  page setup, exact column widths).

The `ACTIVITY_LOG.md` (97 KB) documents this work in extraordinary detail —
pixel-level measurements, print-page-count verification, PDF band probes, etc.

---

## 8. Strengths

1. **Architectural discipline that is actually enforced** — three independent
   guardrails (docs, ESLint, bundler). Rare and valuable.
2. **Single env reader + zod validation** with fail-fast errors.
3. **Strict TypeScript** — `strict`, `noUncheckedIndexedAccess`,
   `exactOptionalPropertyTypes`, `noImplicitReturns`, `noImplicitOverride`.
4. **Security-aware by design** — server-side re-authorization on every function,
   private bucket + signed URLs, MIME blocklist (blocks HTML/SVG/JS = stored-XSS
   vectors), filename sanitization, CSRF middleware, RLS enabled, ownership filters.
5. **Excellent fidelity engineering** with automated golden verification.
6. **Rich, self-documenting conventions** — `*.server.ts`, `shared/` purity,
   the scaffold pattern, `pending-forms`/`pending-records` local-draft helpers.
7. **Strong AI hygiene** — all model output is zod-validated before reaching the
   client, with an explicit field allowlist (signatures can never be AI-set).
8. **PWA-ready** — manifest, apple-touch-icon, install button, mobile shell.

---

## 9. Risks, gaps & recommendations

### High priority

1. **Password hashing is unsalted SHA-256.**
   `src/server/auth/password.server.ts` uses `createHash("sha256")` — fast,
   unsalted, and rainbow-table-vulnerable. The code acknowledges it ("kept for
   compatibility"). **Recommendation:** migrate to `argon2id` or `scrypt` (Node's
   built-in `crypto.scrypt` avoids new deps) with a lazy re-hash-on-login migration.
2. **Default seeded credentials.** Migration `0002` inserts `admin` / `admin123`
   and `staff` / `staff123`. Ensure these are rotated/removed in any real deployment.
3. **No rate limiting on sign-in.** Failed attempts are *logged* but not *throttled*.
   Add per-IP / per-ID backoff or a CAPTCHA after N failures.
4. **No automated test suite.** No vitest/jest/playwright; no CI workflow. The
   pure logic in `shared/period.ts`, `shared/time.ts`, and the scaffold predicates
   is highly testable and currently unguarded. The inventory golden test is the only
   regression net. **Recommendation:** add Vitest for `shared/` + services and a
   GitHub Actions workflow running `typecheck`, `lint`, and tests.

### Medium priority

5. **Missing `AGENTS.md`.** `CLAUDE.md` and `README.md` both instruct readers to
   read `AGENTS.md`, but the file does not exist. Either create it (merge the
   architecture rules) or fix the references.
6. **Drizzle schema is a stub.** `drizzle/schema.ts` is intentionally blank
   ("auto-generated and left blank, do not edit"), and `migrations/meta` only tracks
   `0000–0002`. The 15 SQL migrations are hand-written. This means `drizzle-kit
   generate` is effectively unusable and could produce conflicting output.
   **Recommendation:** either commit a real schema + regenerate the journal, or drop
   drizzle-kit entirely and document the SQL files as the source of truth.
7. **Large files hurt maintainability.** `ViewAssetDrawer.tsx` (1 298 lines),
   `LoaPreview.tsx` (838), `report-export.ts` (755), `RecordEditor.tsx` (525),
   `LoaEditor.tsx` (514). Consider extracting sub-components / pure helpers.
8. **Service-role key for all DB access.** Powerful and convenient, but it means a
   single missing `owner_id` filter becomes a data-leak (IDOR). Ownership checks are
   currently consistent — keep them that way, and consider a defensive helper that
   *requires* an owner scope.
9. **Uncommitted work-in-progress.** The tree is 9 commits ahead of `origin/main`
   with 14 modified files (Sidebar, AdminPanel, LoaEditor, loa-assistant, styles…).
   Notably `loa-assistant.server.ts` has +448 lines staged-ish. Commit or stash
   before continuing.

### Low priority / cleanup

10. **Component duplication:** `ConfirmDialog.tsx` vs `ConfirmModal.tsx`;
    `AttachmentCard` vs `LoaAttachmentCard` vs `ObAttachmentCard` (the LOA one is
    documented as "an OB mirror" — a shared component would remove the copy).
11. **`noUnusedLocals` / `noUnusedParameters` are off** and `@typescript-eslint/no-unused-vars`
    is off — dead code can accumulate silently.
12. **Heavy `as unknown as` casting** in the export code (necessary given library
    gaps, but worth isolating behind typed adapters).
13. **`public/` redundancy:** both `ob_form_template.docx` and `ob_template.docx`,
    plus `dtr_template.pdf` / `loa_phone.jpg` / `image.png` — verify which are live.
14. **`ACTIVITY_LOG.md` is 97 KB** and will keep growing. Consider archiving entries
    older than ~90 days into a `ACTIVITY_LOG_ARCHIVE.md`.

---

## 10. Verdict

This is a **mature, unusually well-architected internal application** — well above
typical project quality. The layering is enforced rather than merely documented, the
type safety is strict, the security posture is thoughtful, and the document-generation
work (pixel-exact Word forms, cell-exact Excel reports with glyph metrics and a golden
test) reflects genuine craft.

Its main weaknesses are **operational rather than structural**: an unsalted password
hash, no automated tests or CI, seeded default credentials, and a Drizzle setup that
has drifted from the hand-written migrations. Fix those four and this becomes a
genuinely production-solid codebase. The immediate housekeeping item is the 14
uncommitted files on a branch that is already 9 commits ahead of origin.

---

### Appendix — quick numbers

| Metric | Value |
| --- | --- |
| Source files (`.ts`/`.tsx`) | 206 |
| Total source lines | ~26 445 |
| Features code | ~13 805 lines (68 files) |
| Server code | ~3 895 lines (25 files) |
| Shared code | ~859 lines (5 files) |
| Routes | 19 files / ~399 lines (deliberately thin) |
| Supabase tables | 9 (+1 storage bucket) |
| Inventory tables | 8 (separate DB) |
| SQL migrations | 15 |
| API server-function modules | 10 |
| Largest file | `ViewAssetDrawer.tsx` — 1 298 lines |
| Automated tests | 1 (inventory golden diff) |
