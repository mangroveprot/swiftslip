<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules (keep these when editing)

See `README.md` → "Architecture". In short:

- **Only `src/config/env.server.ts` reads `process.env`.** Add env vars there + `.env.example`.
- **Frontend never imports `@/server/*`.** It calls server functions in `@/api/*` (ESLint enforces this).
- **Server functions in `src/api/` are thin:** validate (zod, `@/shared/schemas`) → `requireUser()`/`requireAdmin()` → call a service in `src/server/services/`.
- **Routes are thin.** Page UI lives in `src/features/<feature>/`. Anything under `src/routes/_app/` is auth-guarded by `src/routes/_app.tsx`.
- `src/shared/` is pure (types, schemas, date logic) — no React, no server imports.
- Server-only modules are named `*.server.ts`.
