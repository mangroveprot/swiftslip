# SwiftSlip — Daily Time Records

Password-protected DTR portal: fill in time records, import biometric logs (AI-assisted),
print or download as Word. Built with TanStack Start (React 19, file-based routing, server
functions), Supabase (Postgres), Tailwind v4 and shadcn/ui.

## Quick start

```sh
npm install
cp .env.example .env     # then fill in the values
npm run dev              # prints the local URL
```

| Script              | What it does                       |
| ------------------- | ---------------------------------- |
| `npm run dev`       | Dev server                         |
| `npm run build`     | Production build (`.output/`)      |
| `npm run typecheck` | `tsc --noEmit`                     |
| `npm run lint`      | ESLint, incl. architecture rules   |
| `npm run format`    | Prettier                           |

## Architecture

The app is one deployable, but the code is split so the **frontend and backend can't reach
into each other** (ESLint enforces it).

```
src/
├── config/          ← ALL configuration. The only place that reads process.env
│   ├── app.ts            static, non-secret settings (app name, cookie name, defaults)
│   ├── env.server.ts     validated server env  →  getServerConfig()
│   └── env.client.ts     browser-safe VITE_* env
│
├── shared/          ← used by BOTH sides: pure types, zod schemas, date/period logic
│
├── server/          ← BACKEND. Server-only (*.server.ts), never bundled to the browser
│   ├── db/               Supabase admin client + generated DB types
│   ├── auth/             session cookie, password hashing, requireUser / requireAdmin
│   ├── services/         business logic + queries (records, template, access codes, import)
│   └── errors/           SSR error capture / error page
│
├── api/             ← THE BOUNDARY. createServerFn wrappers: validate → authorize → call a service
│
├── features/        ← FRONTEND, by feature (auth, records, admin, template)
│   └── <feature>/{components,lib,queries.ts}
│
├── components/      ← shared UI: ui/ (shadcn), layout/ (AppShell, Sidebar), common/
├── routes/          ← routing only. Thin files that compose features
├── lib/             ← small frontend helpers (cn, seo, error reporting)
│
├── router.tsx  start.ts  server.ts  routeTree.gen.ts   ← framework entry points (keep at root)
```

**Dependency rule** — arrows only point down this list:

`routes → features → components/lib → api → server → config/shared`

* `features/`, `components/`, `routes/`, `lib/` **must not** import `@/server/*` — they call `@/api/*`.
* `server/` and `api/` **must not** import UI code.
* `shared/` imports neither side (and not React).

**A request, end to end:** a component calls `saveRecord()` from `@/api/records.functions` →
the server function validates the payload with a zod schema from `@/shared/schemas`, calls
`requireUser()`, then delegates to `@/server/services/records.server` → which queries Supabase
through `getDb()`.

## Environment & config

Everything configurable lives in `src/config/`; **change env behaviour there and nowhere else.**

| Variable                    | Required | Purpose                                             |
| --------------------------- | :------: | --------------------------------------------------- |
| `SUPABASE_URL`              |    ✓     | Supabase project URL                                |
| `SUPABASE_SERVICE_ROLE_KEY` |    ✓     | Server-only admin key (bypasses RLS)                |
| `SESSION_SECRET`            |    ✓     | Signs the login cookie, 32+ chars (`openssl rand -hex 32`) |
| `GEMINI_API_KEY`            |          | Enables AI biometric import; blank = feature off    |
| `GEMINI_MODEL`              |          | Overrides the default in `config/app.ts`            |
| `DATABASE_URL`              |          | Only for `drizzle-kit` migrations                   |

* `.env.example` is the committed template; `.env` (git-ignored) holds real values.
  Vite also honours `.env.local`, `.env.production`, etc.
* On deploy (Cloudflare/Nitro), set the same variables in your host's dashboard.
* Values are validated with zod on first use. A missing/short value fails fast with a message
  listing exactly what's wrong.
* Never put a secret in a `VITE_*` variable — those are bundled into browser JS.

**Adding a variable:** (1) add it to `EnvSchema` in `config/env.server.ts`, (2) expose it in
`buildConfig()`, (3) add it to `.env.example`. Consume it via `getServerConfig()`.

## Routing

File-based (TanStack Router). URLs are unchanged:

```
routes/
├── __root.tsx                 html shell, providers, 404 + error UI
├── index.tsx                  /                 login (redirects to /records if signed in)
├── _app.tsx                   pathless layout: auth guard + AppShell for everything below
└── _app/
    ├── records/index.tsx      /records
    ├── records/$id.tsx        /records/:id
    ├── admin.tsx              /admin            (admin-only guard)
    ├── change-rest-day.tsx    /change-rest-day
    └── change-time-schedule.tsx
```

* **Auth is enforced once**, in `_app.tsx`'s `beforeLoad`. Any file dropped into `routes/_app/`
  is automatically protected and wrapped in the app shell — no per-page wrapper or redirect logic.
* Role checks go in that route's own `beforeLoad` (see `_app/admin.tsx`). The server functions
  re-check permissions independently, so the UI guard is convenience, not security.
* Below `_app`, read the user with `useSession()` (`features/auth/use-session.ts`).
* Use `seo()` / `pageTitle()` from `lib/seo.ts` for `<head>` metadata.

## Recipes

**New page:** create `routes/_app/my-page.tsx` (`createFileRoute("/_app/my-page")`), keep the
component in `features/<x>/components/`, add a link in `components/layout/nav-items.ts`.

**New endpoint:** add a zod schema in `shared/schemas.ts` → a service function in
`server/services/` → a thin `createServerFn` in `api/*.functions.ts` (call `requireUser()` or
`requireAdmin()` first) → a query/mutation hook in the relevant `features/<x>/`.

## Database

Migrations live in `drizzle/migrations/` (SQL, applied in order). Generated Supabase types are in
`src/server/db/database.types.ts`.
