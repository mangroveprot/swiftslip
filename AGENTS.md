# AGENTS.md — rules for anyone (human or AI) changing SwiftSlip

Read [`ACTIVITY_LOG.md`](./ACTIVITY_LOG.md) (top) and [`MIGRATION_CHECKLIST.md`](./MIGRATION_CHECKLIST.md)
first. After any change, add an entry at the **top** of `ACTIVITY_LOG.md` (What / Why / Where / By).

## Layout

```
api/     Express API (@swiftslip/api)     port 9095   secrets live in api/.env
web/     Vite + React SPA (@swiftslip/web) port 8080   only VITE_* in web/.env (public)
shared/  zod schemas + types (@swiftslip/shared) — imported as @swiftslip/shared/<file>
```

In production the API container also serves `web/dist` (one Docker image, see README → Production).
`web` talks to `api` **only** over HTTP (`web/src/lib/api-client.ts`, base `VITE_API_URL` or `/api`).
`shared/` holds schemas and types only — no server or browser code. That is what keeps the
three folders splittable into separate repos later with no code change.

## API structure (copy it for every new module)

`api/src/apps/<module>/{controllers,routes,services,repositories,types}` + `index.ts` barrel.
controller → service → repository. Supabase / SQL only in repositories.

- Services extend `BaseService`, return `ServiceResponse<T>` and **never throw**. Every method ends in:

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

  Repositories throw `ErrorResponse`.
- Controllers: `if (response.success) ApiResponse.success(res, response, code); else throw response;`
  inside `try`; `catch (error) { ApiResponse.error(res, error as ErrorResponseType) }`.
- Wire format — success: `{ success: true, document | documents, total?, … }`;
  error: `{ success: false, error: { status, code, message, suggestions } }`.
- New error kinds go in `common/shared/utils/error/codes.ts`, never ad-hoc strings.
- Validate requests with a zod schema from `shared/src/schemas.ts` through `validate()`.
  Never re-declare a schema in `web` or `api`.
- Env vars: add to `api/src/core/config/index.ts` **and** `api/.env.example` — nowhere else
  reads `process.env`.
- Every query is scoped to the signed-in user unless the route is admin-only. The Supabase key is
  service-role (bypasses RLS), so scoping is the API's job.
- Do not change table or column names; do not edit old migrations.

## Web rules

- Server calls go through `web/src/api/*.functions.ts` (fetch wrappers; names and `({ data })` shape
  are kept so `features/*` stay untouched). Do not call `fetch` directly elsewhere.
- Route guards (`getSession()`) are a convenience; the API re-checks every request.
- Never put a secret in a `VITE_*` variable — it is bundled into browser JS.
- No UX changes during a port.

## Before you finish

`npm run typecheck` and `npm run lint` (all workspaces) must pass, then tick the box in
`MIGRATION_CHECKLIST.md` and write the `ACTIVITY_LOG.md` entry.
