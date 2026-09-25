# Routes

TanStack Start uses **file-based routing**. Every `.tsx` file in this directory
defines a route. Do **not** create `src/pages/` or `app/layout.tsx` — those are
Next.js / Remix conventions. The root layout is `src/routes/__root.tsx`.

Keep route files **thin**: metadata, guards, and a component imported from
`src/features/<feature>/`. Business UI does not live here.

## Structure

| File | URL | Notes |
| --- | --- | --- |
| `__root.tsx` | — | html shell + providers; preserve `<Outlet />` |
| `index.tsx` | `/` | login; redirects to `/records` when signed in |
| `_app.tsx` | — | **pathless layout**: auth guard + `AppShell` |
| `_app/records/index.tsx` | `/records` | |
| `_app/records/$id.tsx` | `/records/:id` | dynamic (bare `$`, no braces) |
| `_app/admin.tsx` | `/admin` | adds an admin-only `beforeLoad` |

Anything inside `_app/` is automatically protected and rendered inside the app
shell. To add a signed-in page, just add a file there.

## Conventions

| File | URL |
| --- | --- |
| `about.tsx` | `/about` |
| `users/index.tsx` | `/users` |
| `users/$id.tsx` | `/users/:id` |
| `posts/{-$category}.tsx` | `/posts/:category?` (optional segment) |
| `files/$.tsx` | `/files/*` (splat — read via `_splat` param, never `*`) |
| `_name.tsx` + `_name/` | pathless layout route (renders children via `<Outlet />`) |

`routeTree.gen.ts` is auto-generated. Don't edit it by hand.
