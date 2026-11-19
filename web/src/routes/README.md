# Routes

The web app is a Vite SPA using TanStack Router's **file-based routing** (`routeTree.gen.ts` is generated). Every `.tsx` file in this directory
defines a route. Do **not** create `src/pages/` or `app/layout.tsx` — those are
Next.js / Remix conventions. The root layout is `src/routes/__root.tsx`.

Keep route files **thin**: metadata, guards, and a component imported from
`src/features/<feature>/`. Business UI does not live here.

## Structure

| File | URL | Notes |
| --- | --- | --- |
| `__root.tsx` | — | providers + `<HeadContent />`; preserve `<Outlet />` |
| `index.tsx` | `/` | login; signed in → `/choose` (admin) or `/records` (staff) |
| `choose.tsx` | `/choose` | admin-only app picker; own chrome (no `_app` shell) |
| `rgc-asset-inventory.tsx` | `/rgc-asset-inventory` | admin-only placeholder for the future inventory app |
| `_app.tsx` | — | **pathless layout**: auth guard + `AppShell` |
| `_app/records/index.tsx` | `/records` | |
| `_app/records/$id.tsx` | `/records/:id` | dynamic (bare `$`, no braces) |
| `admin.tsx` | `/admin` | admin-only panel with its own chrome; the current section is `?section=` |
| `admin/profile.tsx` | `/admin/profile` | the panel's copy of My Account, so it keeps the panel's sidebar |
| `hr.tsx` | `/hr` | HR app shell with its own chrome |
| `hr/profile.tsx` | `/hr/profile` | the HR app's copy of My Account |

Anything inside `_app/` is automatically protected and rendered inside the app
shell. To add a signed-in page, just add a file there.

A screen that belongs to an app with its own shell gets a copy under that shell
(`admin/profile.tsx`, `hr/profile.tsx`) instead of linking to `/_app/profile`,
or the sidebar would jump to a different app.

## Sub-view state

A route's path is the page. A tab, section or view **inside** that page belongs
in the search string, not in `useState`, so a refresh, a copied link or the
browser's Back button returns to the same screen. Use `useUrlState()` from
`lib/use-url-state.ts`:

```ts
const [tab, setTab] = useUrlState("tab", ["all", "open"], "all");
```

It validates against the allowed values, replaces the current history entry
(changing tabs is not a new page), and drops the param when the value is the
default. Admin uses `?section=backup`, `?tab=person`, `?role=incomplete` and
`?filter=signin`; the HR queue uses `?tab=overdue` beside its `?view=`.

A route with its own `validateSearch` must list the key there (see
`routes/hr/index.tsx`) or the router strips it on the next navigation.

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
