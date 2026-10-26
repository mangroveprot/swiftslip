# Security Audit — SwiftSlip (DTR App)

**Date:** 2026-10-23
**Scope:** `src/`, `drizzle/migrations/`, build output (`.output/`), git history, dependencies, deployment config.
**Method:** Static review of all 86 server functions and their auth gates, service-layer ownership checks, storage/auth/access-rule logic, migrations, bundle inspection, `npm audit`.
**Mode:** Read-only. No production requests were made, no data was exfiltrated.

---

## Executive summary

The app's **authorization model is fundamentally sound**: every data access goes through
`requireUser` / `requireAdmin` / `requireApp`, and every form/record/attachment query is
scoped by `owner_id`. I found **no cross-user IDOR** across the 5 record types. Secrets are
not in git or in the client bundle, and RLS is enabled on the core tables.

The risk is concentrated in **authentication**:

| # | Severity | Finding |
|---|----------|---------|
| C-1 | **Critical** | Default `admin` / `admin123` and `staff` / `staff123` accounts are seeded by migrations |
| H-1 | **High** | Unsalted SHA-256 password hashing |
| H-2 | **High** | Role is baked into the cookie; demotion/deletion/password change does not revoke access (12 h window) |
| H-3 | **High** | No sign-in rate limiting or lockout; 4-character minimum password |
| M-1 | Medium | Login is case-insensitive but the unique index is case-sensitive (account collision / lockout) |
| M-2 | Medium | `org_*` tables created without RLS |
| M-3 | Medium | Unbounded `base64` / JSON request bodies (memory DoS) |
| M-4 | Medium | No security headers or CSP |
| M-5 | Medium | AI endpoints have no per-user quota; employee PII is sent to Gemini |
| M-6 | Medium | Clients can self-approve and set identity fields (record integrity) |
| L-1 | Low | Failed sign-in writes an unauthenticated DB row (log flooding) |
| L-2 | Low | Uploaded file type is trusted from the client (no magic-byte check) |
| L-3 | Low | `xmldom@0.1.31` (critical CVEs) via `docxtemplater-image-module-free` |
| I-1 | Info | No view/edit/delete split inside Inventory |

## Remediation status — Batch A (2026-10-23)

| Finding | Status |
|---|---|
| **H-1** Unsalted SHA-256 | **Fixed** — PBKDF2-HMAC-SHA256 (210k iterations, per-row salt), lazy upgrade on the next successful sign-in. `password.server.ts`, `auth.server.ts` |
| **H-2** Stale sessions | **Fixed** — role is re-read from `users` on every request; a deleted account is rejected, a demotion applies immediately, and a password change (or admin reset) revokes every other device through a password-hash fingerprint in the cookie. `session.server.ts` |
| **H-3** No rate limiting | **Fixed** — 10 failures per ID / 20 per IP in 15 minutes, plus a 250 ms failure delay. `auth.functions.ts`, `activity-log.server.ts`. *Password minimum left at 4 per request.* |
| **M-1** Case-insensitive login | **Fixed** — sign-in is now an exact match; the duplicate check is case-insensitive so `jd123` cannot be created beside `JD123`. `auth.server.ts`, `access-codes.server.ts` |
| **L-1** Log flooding | **Mitigated** — failed-sign-in writes are bounded by the per-IP rate limit. |

**Verification:** `tsc --noEmit` clean · `eslint` clean on changed files · `npm run build` succeeds (Cloudflare preset) · 10-case hashing test passed (modern round-trip, wrong password, malformed hash, legacy SHA-256 compatibility, upgrade detection, per-hash salt uniqueness).

**Still open:** C-1 (database), M-2 (RLS), M-5 (privacy notice / PII decision), M-6 (approval/integrity), L-3, I-1.

## Remediation status — Batch B (2026-10-23)

| Finding | Status |
|---|---|
| **M-3** Unbounded request bodies | **Fixed** — any `Content-Length` over 16 MB is rejected with `413` in `src/server.ts` before SSR; every base64 field is capped by `MAX_UPLOAD_BASE64` (~13.98M chars = 10 MB file) in `schemas.ts`. The services still enforce the real 10 MB decoded limit. |
| **M-4** Missing security headers | **Fixed** — HSTS, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `COOP`, and a production CSP are added in `src/server.ts`. The CSP keeps `'unsafe-inline'` for script/style because TanStack Start hydration and inline styles require it; it still blocks external scripts, framing, `<base>` hijacking, plugins and cross-origin form posts. `style-src`/`font-src` allow the Google Fonts already referenced by `__root.tsx`. |
| **M-5** AI quota / PII | **Partially fixed** — per-account (100/day) and app-wide (1000/day) quotas, counted from `ai.request` rows in `activity_logs`, are enforced on all nine AI server functions (`ai-quota.server.ts`). **Still open:** an in-product privacy notice and an explicit data-processing decision for sending employee PII to Gemini. |
| **L-2** Declarative MIME only | **Fixed** — upload type is now an allowlist (PDF, PNG/JPEG/GIF/WebP/BMP, plain text, DOC/DOCX/XLS/XLSX/PPT/PPTX) with a magic-byte check; the extension is used only as a second opinion when the browser reports an empty or legacy type. The upload pickers' `accept` lists were narrowed to match. `attachments.server.ts` |

**Verification:** `tsc --noEmit` clean · `eslint` clean on changed files · `npm run build` succeeds (Cloudflare preset) · built-worker smoke test: every response carries the security headers, and a POST declaring a 20 MB `Content-Length` returns `413` before rendering.

---

## Detailed findings

### C-1 — Seeded default administrator credentials

**Evidence**
`drizzle/migrations/0000_create_dtr_schema.sql:56-58` (repeated in `0001` and `0002`):

```sql
INSERT INTO public.access_codes (label, role, password_hash) VALUES
  ('Administrator', 'admin', encode(sha256(convert_to('admin123','utf8')),'hex')),
  ('Staff', 'user', encode(sha256(convert_to('staff123','utf8')),'hex'));
```

**Impact**
If the production database still contains these rows and nobody rotated the passwords,
anyone on the internet can sign in as administrator with `admin123`. Full control of user
management, app-access rules, all forms, and the activity log.

**Verify**
```sql
select id_number, role, created_at from public.users order by created_at;
```
Then check the hash against `encode(sha256(convert_to('admin123','utf8')),'hex')`.

**Remediation**
1. Immediately rotate/remove both accounts in production.
2. Replace the seed with **no default users** (or force a password change on first login).
3. Add a startup assertion that refuses to run with a known default hash.

---

### H-1 — Unsalted SHA-256 password hashing

**Evidence**
`src/server/auth/password.server.ts:8-15`

```ts
export function hashPassword(password: string): string {
  return createHash("sha256").update(password, "utf8").digest("hex");
}
```

**Impact**
A leaked `users` table is crackable at billions of guesses/second (GPU). Combined with
the 4-character minimum (H-3) and the reused-password likelihood, most accounts would fall
in minutes. No per-user salt also enables rainbow-table and cross-account correlation.

**Remediation**
Use `argon2id` (preferred) or `scrypt`. Store `algo$params$salt$hash` and verify with a
constant-time compare. Migrate lazily: on successful login with the legacy hash, re-hash
and update the row.

```ts
// sketch
import { hash, verify } from "@node-rs/argon2";
export const hashPassword = (p: string) => hash(p, { memoryCost: 19456, timeCost: 2 });
export async function verifyPasswordHash(p: string, stored: string) {
  if (stored.length === 64 && /^[0-9a-f]+$/i.test(stored)) {
    return timingSafeEqual(...) // legacy SHA-256, then upgrade
  }
  return verify(stored, p);
}
```

---

### H-2 — Session role is never revalidated

**Evidence**
`src/server/auth/session.server.ts:8-45` stores `role` in the signed cookie and returns it
verbatim:

```ts
type SessionData = { id?: string; role?: Role; ... };
...
return { id: session.data.id, role: session.data.role, ... };
```

`requireAdmin()` (lines 53-57) trusts `user.role`. `deleteAccessCode` and
`changeOwnPassword` (`src/server/services/access-codes.server.ts`) never touch existing
sessions. Cookie lifetime is 12 h (`src/config/app.ts:34`).

**Impact**
- An admin demoted to `user` keeps admin powers until the cookie expires.
- A deleted account keeps a working session (including admin panel) for up to 12 h.
- A password reset does not evict an attacker who already stole a cookie.
- A password change does not evict other devices.

**Remediation**
- Re-fetch `role` from `users` in `getSessionUser()` (one indexed lookup per request), and
  return `null` if the row is gone.
- Add a `session_version` (or `updated_at`) column to `users`; embed it in the cookie and
  compare on every request. Bump it on password change, role change, and delete.
- Keep the 12 h cap but add an idle timeout (e.g. 30 min) if the threat model warrants it.

---

### H-3 — No rate limiting; weak passwords

**Evidence**
- `src/api/auth.functions.ts:9-34` — every attempt runs a full lookup + hash compare; only
  failures are logged.
- Password minimum is **4 characters** (`access-codes.server.ts:178, 207, 278`).
- `signInInput` allows 200-char passwords but there is no throttle, CAPTCHA, delay, or
  per-IP/per-account lockout (`src/shared/schemas.ts:31-34`).

**Impact**
Online brute force is trivial, especially with `admin123` still possible. The failure log
gives the attacker feedback but does nothing to slow them down.

**Remediation**
- Per-IP and per-ID-number counters (Cloudflare KV / Durable Object / Upstash), e.g.
  5 failures per 15 min → exponential backoff, then temporary lock.
- Add a small constant delay on failure.
- Raise minimum password length to 12 and reject the top-N common passwords.
- Consider MFA for `admin`.

---

### M-1 — Case-insensitive login vs case-sensitive uniqueness

**Evidence**
- Login: `src/server/services/auth.server.ts:23` → `.ilike("id_number", escapeLike(normalized))`.
- Admin duplicate check: `.eq("id_number", idNumber)` (`access-codes.server.ts:19`).
- Unique index: `CREATE UNIQUE INDEX ... ON public.users (id_number)` (`0007:42-43`) — exact match.

**Impact**
`JD123` and `jd123` can both exist. `verifyPassword` then gets two rows, `.maybeSingle()`
throws, and **both** users are locked out (`PGRST116`). Clever denial of service or an
accidental lockout after a rename.

**Remediation**
- Normalize on write (`lower(btrim(id_number))`) and create a unique index on that
  expression; keep the display form separately if needed.
- Or make login exact-match and tell users the ID is case-sensitive.
- Handle `maybeSingle` ambiguity gracefully (if >1, log and refuse without leaking).

---

### M-2 — Missing RLS on org tables

**Evidence**
`0024_org_option_lists.sql` and `0025_org_designation_options.sql` create
`org_departments`, `org_positions`, `org_designations` **without**
`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`. Every earlier table enables it.

**Impact**
Supabase grants `anon`/`authenticated` table privileges by default. With RLS disabled,
the public PostgREST endpoint (`https://<project>.supabase.co/rest/v1/...`) can read **and
write** these tables using the project's public anon/publishable key. Low data
sensitivity, but it is unauthenticated write access to org configuration that feeds access
rules.

**Remediation**
```sql
alter table public.org_departments     enable row level security;
alter table public.org_positions       enable row level security;
alter table public.org_designations    enable row level security;
```
Verify in the Supabase dashboard that RLS is on for **every** table in `public`.

---

### M-3 — Unbounded request bodies

**Evidence**
- `attachmentUploadInput.base64` is `z.string().min(1)` with no max (`schemas.ts:383-388`).
- `importBiometricInput.base64` likewise (`schemas.ts:427-431`).
- The 10 MB check happens **after** `Buffer.from(input.base64, "base64")`
  (`attachments.server.ts:93-97`).

**Impact**
Any authenticated user can post a multi-hundred-MB JSON body; it is buffered and decoded
before the size check. On the Cloudflare Workers runtime this is a memory/CPU DoS and can
burn the request quota.

**Remediation**
- Cap `base64` in Zod: `.max(Math.ceil(10 * 1024 * 1024 * 4 / 3) + 16)`.
- Also enforce `Content-Length` at the edge.
- Return `413` early for oversized requests.

---

### M-4 — No security headers / CSP

**Evidence**
- No `public/_headers`, no middleware setting headers.
- `vite.config.ts` and `src/server.ts` set none.
- Grep for `Content-Security-Policy`, `X-Frame-Options`, `Strict-Transport-Security`,
  `X-Content-Type-Options`, `Referrer-Policy` → **zero hits**.

**Impact**
No clickjacking protection, no HSTS, no CSP mitigation for any future XSS, and referrer
leakage. `SameSite=Lax` mitigates most CSRF but not top-level GET navigation.

**Remediation**
Add a Cloudflare `_headers` file (or set them in the Nitro/Workers entry):

```
/*
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https://*.supabase.co https://generativelanguage.googleapis.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
```

Tighten `script-src` after checking inline bootstrapping needs.

---

### M-5 — AI endpoints: quota + data processing

**Evidence**
- `biometric-import.functions.ts`, `*reason*`, `*assistant*` all guard with `requireUser`
  only.
- Uploads/documents and full form state are sent to
  `generativelanguage.googleapis.com` (`biometric-import.server.ts:24-39`,
  `cos-assistant.server.ts:88-99`).
- No per-user rate limit or token budget.

**Impact**
- Any employee can burn the Gemini quota / inflate cost without limit.
- Employee PII (names, ID numbers, leave reasons, medical notes, signatures in images) is
  sent to a third party. This is a privacy/compliance exposure that must be documented and
  consented to.

**Remediation**
- Per-user daily quota + global cap; log usage.
- Add a clear notice in the UI and a data-processing agreement with Google.
- Never send `employee_signature` (already excluded from the patch) or full records when a
  short summary would do.
- Consider a "no-AI" deployment flag (already supported by the empty key check).

---

### M-6 — Record integrity: self-approval and identity fields

**Evidence**
- `attachment_approved` is accepted from the client on every form schema
  (`schemas.ts:149, 190, ...`) and persisted (`cos.server.ts` save payload and peers).
- The UI explicitly toggles it (`ObAttachmentCard.tsx:38`, `LoaAttachmentCard.tsx:36`,
  `CosAttachmentCard.tsx:36`, `OtAttachmentCard.tsx`).
- `saveRecord` writes `emp_no`, `name`, `designation`, `area`, `certified_by`,
  `employee_signature` straight from the client (`records.server.ts:89-100`).
- No approval workflow, lock, or immutable revision exists; records are editable forever.

**Impact**
An employee can mark their own form "Approved", put a colleague's name/ID number on a DTR,
draw any signature, and back-date edits. In a time-record system this is the exact fraud
vector that matters. Whether it is acceptable depends on your process — if HR verifies the
physical slip independently, the flag is only a claim.

**Remediation (choose based on process)**
- If approval is meaningful: move `attachment_approved` / `approved_by` to an admin-only
  server function, and log who approved and when.
- Bind `emp_no` / `name` to the session profile server-side instead of accepting them.
- Add a `status` (`draft` → `submitted` → `approved`) and make submitted records read-only.
- Keep an append-only revision table for DTR entries.

---

### L-1 — Unauthenticated log writes

`signIn` logs every failure (`auth.functions.ts:17-22`). An attacker can flood
`activity_logs` and bury real events; each attempt also costs a DB write.

**Fix:** aggregate failures per IP/ID (e.g. one row per minute) or log to an edge store
first.

### L-2 — Declarative MIME only

`attachments.server.ts:88-91` trusts the client's `contentType` and denylists a handful of
types. No magic-byte sniffing. Exploitability is low because the bucket is private, URLs are
signed, and browsers do not sniff when `X-Content-Type-Options: nosniff` is set — but a
sniff-based allowlist is stronger than a denylist.

**Fix:** allowlist `application/pdf`, `image/png`, `image/jpeg`, and the Office types, and
verify the first bytes.

### L-3 — Dependency findings

`npm audit` reports 12 issues (2 critical, 3 high):

- **`xmldom@0.1.31`** (critical, no fix) via `docxtemplater-image-module-free`. Only used
  client-side against **bundled** `public/*.docx` templates, not user uploads — so not
  exploitable today. The package is abandoned; replace it or pin/verify templates.
- **`shell-quote`** (critical) and **`launch-editor`** (high) are dev-only transitive deps.
- **`vite@8.1.5`** (high) affects the dev server, not production builds.

**Fix:** upgrade Vite when 8.3.x is compatible, run `npm audit fix` for the dev chain, and
plan a replacement for the docx image module.

### I-1 — Inventory has no role granularity

`requireApp("inventory")` gates all inventory functions, including `deleteAssets`. Any
granted user can delete any asset. If read-only users are expected, split
`inventory:read` / `inventory:write`.

---

## What passed (verified, no action needed)

- **Secrets:** `.env` is git-ignored and was never committed (`git log --all` clean); only
  `.env.example` is tracked. No secret literals in `.output/public` (client bundle) or in the
  server build — only variable names. `SESSION_SECRET` is 66 chars of hex-range characters
  (32 bytes of entropy).
- **Service-role key isolation:** `src/server/db/client.server.ts` is server-only, protected
  by `tanstackStart.importProtection` (`vite.config.ts`), and never imported from client code.
- **Authorization:** all 86 server functions have an explicit gate; the only ungated one is
  `signIn`, as intended. `requireApp` re-resolves access rules from the DB per request.
- **IDOR:** `records`, `ob`, `loa`, `cos`, `ot`, and attachments all filter by `owner_id`
  (verified 37 owner-scoped queries). Attachment paths include the owner id and are checked
  against stored rows before signing.
- **SQL injection:** the inventory layer uses `postgres` tagged templates with bound
  parameters, including array binding for `deleteAssets`. No string interpolation of user
  data. PostgREST `or=` search terms strip `, % ( )`.
- **Stored XSS:** no `dangerouslySetInnerHTML` on user data (only the shadcn chart style
  block); React escapes output; storage blocks HTML/SVG/JS types.
- **CSRF:** `SameSite=Lax` + `httpOnly` + `Secure` in prod; no state-changing GET endpoints
  (all mutations are POST).
- **RLS:** enabled on all core tables (`access_codes`, `records`, `profiles`, forms,
  `activity_logs`, `app_access_rules`). No policies are defined, which is the correct
  closed-by-default posture for a service-role-only app.
- **Path traversal:** `safeFilename()` strips separators, leading dots, and caps length.
- **Account safety:** "keep at least one administrator" guards exist on demote/delete.

---

## Recommended remediation order

1. **Today:** check production for the seeded accounts (C-1); rotate if present.
2. **This week:** RLS on `org_*` (M-2), then decide the approval/integrity model (M-6).
3. **Then:** add the AI privacy notice and settle the Gemini PII decision (M-5 remainder);
   replace `docxtemplater-image-module-free` / `xmldom` (L-3), and add role granularity
   inside Inventory (I-1).
4. **Ongoing:** keep dependency scanning and run the Phase 4–6 tests below.

## Suggested next audit phases

- **Phase 4:** dynamic testing with two test accounts against a staging Supabase project —
  attempt cross-user fetch, rule flips, replay, and oversized uploads.
- **Phase 5:** review DOCX/XLSX export for formula injection (`=`, `+`, `-`, `@` in exported
  cells) and PDF/signature rendering.
- **Phase 6:** secrets scanning in CI (`gitleaks`), dependency policy, and a
  `SECURITY.md` vulnerability-disclosure path.
