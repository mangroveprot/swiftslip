# Project memory — DTR-App (SwiftSlip)

## Conventions that must be followed

- **Every change gets an `ACTIVITY_LOG.md` entry at the TOP** (format: What /
  Why / Where / By). `CLAUDE.md` mandates reading `ACTIVITY_LOG.md` before
  changing anything and adding an entry after. Insert after the three `---`
  separators that follow "How to write an entry".
- **Before finishing any change, run:** `npm run typecheck` (tsc --noEmit),
  `npx eslint <file>`, `npx prettier --write <file>`. The repo keeps these
  clean and the log records the result.
- **Layering is enforced by ESLint** (`no-restricted-imports`) and Vite
  `importProtection`: `routes → features → components/lib → api → server →
  config/shared`. Frontend must never import `@/server/**` or
  `@/config/env.server`; `src/shared` must not import React or either side.
- Server-only modules are named `*.server.ts`. `src/config/env.server.ts` is
  the only place that reads `process.env`.

## Design system (SwiftSlip part of the app)

- Font: **Geist** (`--font-display` / `--font-sans`).
- Tokens in `src/styles.css` `:root`: `--primary` deep navy oklch(0.33 0.09 250),
  `--accent` orange oklch(0.62 0.13 45), `--background` warm paper
  oklch(0.968 0.008 85), `--card` white, `--muted-foreground` oklch(0.52 0.02 250),
  `--radius: 0.5rem`. Body background is the green→pink `--app-gradient`.
- Utility classes: `.btn` / `.btn-primary` / `.btn-outline`, `.inp`, `.lbl`,
  `.field`, `.form-fill`, `.zoom-card`, `.no-print`, `.print-sheet`.
- **`.form-fill`** is the shared "filled field" wrapper: any container with it
  makes its descendant `.inp` fields borderless + `--muted` filled (focus shows
  the ring). Applied to the LOA boxes, the OB header + itinerary boxes and the
  DTR header + daily-entries boxes. Put fields on a white (`bg-card`) surface
  when using it — a `--muted` fill on `bg-background` is too faint to read.
  (Renamed from `.loa-card` on 2026-10-06 when OB and DTR adopted it.)
- **Contrast gotcha:** `--muted-foreground` on `--background` is only ≈4.2:1 —
  below WCAG AA for body text. For small text use `text-foreground/70` (≈8:1)
  or darker instead.
- Inventory section (`/rgc-asset-inventory`) uses its own scoped styles +
  Tailwind's default palette (slate/emerald/orange/rose) and the brand-* theme
  vars — don't mix those into the SwiftSlip screens.

## Verifying a React component's look without a dev server

There is no reachable dev server in this environment, but a presentational
component can still be screenshotted:

1. `npx tsx <script>.mts` — `renderToStaticMarkup(<Component {...props} />)` from
   `react-dom/server`, wrapped in a small hand-written CSS shim for the Tailwind
   utilities the component uses (no Tailwind CLI is installed).
2. `"C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new
   --disable-gpu --hide-scrollbars --force-device-scale-factor=1.5
   --window-size=830,900 --screenshot=<png> "file:///<abs html>"`, then read the
   PNG back.

Good for checking wrapping, proportions and borders — not for anything that
needs hooks, data fetching or the real stylesheet.

To measure a rendered sheet rather than eyeball it, append a `<script>` that
writes `getBoundingClientRect()` values into a `<pre>` and read it back with
`chrome --headless=new --dump-dom`.

**To render a Tailwind component headlessly**, compile the real stylesheet with
the v4 Node API rather than hand-writing a shim — `const { compile } = await
import("tailwindcss")`, then `compile(readFileSync("src/styles.css"), {
base, loadStylesheet })` and `compiler.build([...classNames])`. The only trap is
that `loadStylesheet` receives the *package* imports (`tailwindcss`,
`tw-animate-css`) and `readFileSync` on a bare package name resolves to a
directory and throws `EISDIR`; map those two ids to
`node_modules/tailwindcss/index.css` and
`node_modules/tw-animate-css/dist/tw-animate.css`. There is no
`@tailwindcss/cli` in this repo. Harvest candidate class names by scanning the
component's string literals.

## Form previews

Each form's preview (`LoaPreview`, `ObPreview`, `CosPreview`, `OtPreview`) is a
replica of the matching `public/*_template.docx`.

**Follow the OB preview's idiom — it is the house style.** Fluid `w-full` with
Tailwind utilities written inline, `text-[13px]` body, `border-[2.5px]
border-ink` boxes, an `mx-auto w-full bg-paper px-6` root carrying
`print-sheet`, the logo at `w-[30%]`, and *separate bordered boxes with an
`h-2.5` gap between them* rather than one continuous table grid. A `HeaderField`
helper renders each label-bold/value-below cell; `bg-yellow-300` marks a label
the template highlights. No sheet CSS in `styles.css`, no scaling wrapper, and
`styles.css` only needs `@page` plus the shared `.print-sheet` print rules.

**What NOT to do** (tried on 2026-10-07 and reverted the same day): rendering a
pixel-exact replica at the template's true content width (714px for OT,
`pgMar`-derived) and scaling it to fit with a `.X-fit` / `.X-fitsheet` pair.
It is accurate on paper but wrong on screen — the type shrinks to unreadable —
and it drags in a parallel styling system no other form has. Only the LOA
preview genuinely needs that treatment (it is a literal A4 page replica with the
template's margins as padding), which is why `.loa-fitbox` exists. Don't
generalise it.

If you do need exact geometry, the numbers are: content box = A4 11906 twips
minus `pgMar`, at 1 twip = 1/15 px (96 dpi); column widths come off the
`word/document.xml` `gridCol`/`tblGrid`, best confirmed against Word's own PDF
render; a `w:trHeight hRule="auto"` is a *minimum*. And note **Chrome will not
honour sub-pixel table columns** — under `border-collapse: collapse` it floors
each to a whole pixel and ignores `<colgroup>`, so a fractional-px replica needs
CSS Grid with explicit `grid-template-columns`.

## Verifying document exports (Word/Excel)

The `.docx`/`.xlsx` builders are browser-only, but they can be run headlessly:

1. `npx tsx <script>.mts` — import the real module and call it, stubbing
   `globalThis.fetch` (read `public/<template>` from disk),
   `globalThis.document` (`createElement`/`body.appendChild`) and
   `URL.createObjectURL` (capture the Blob → write to disk). `tsx` resolves the
   `@/` tsconfig paths. `scripts/` is outside `tsconfig.include`, so a temp
   harness there needs no lint/typecheck dance.
2. **Microsoft Word is installed** at
   `C:\Program Files\Microsoft Office\root\Office16\WINWORD.EXE`. PowerShell
   COM gives a real page count:
   `$w = New-Object -ComObject Word.Application; $w.Visible=$false; $w.DisplayAlerts=0;
   $d = $w.Documents.Open($src,$false,$true); $d.ComputeStatistics(2);
   $d.ExportAsFixedFormat($pdf, 17); $d.Close(0); $w.Quit()`
3. Render the PDF to look at it: PyMuPDF in the managed venv
   (`pip install pymupdf`) — `page.search_for('...')` to locate text, then
   `page.get_pixmap(dpi=300, clip=rect).save(png)` and read the PNG back.

Delete the harness and artifacts afterwards. **OOXML gotcha:** under
`w:lineRule="auto"`, `w:spacing/@w:line` counts **240ths of a single line**, so
`w:line="240"` is single spacing and anything well under that overlaps text.

## Attachments (LOA / OT — NOT COS)

The "other attachments" feature exists on **two** form types (LOA first, then
OT) and is served by one table-agnostic trio in
`src/server/services/attachments.server.ts`, keyed on `(table, id, owner_id)`.
Behaviour on every form: max 8 files, 10 MB each; a printable (PDF/image) file
follows the form on its own page and a non-printable one contributes no page, so
a form with only a `.docx` attached still prints exactly one. **COS deliberately
does NOT have it** — do not add a column or card there.

Three gotchas, all hit on 2026-10-07:

- **A print page rendered inside the card can NEVER print.** `.no-print` is
  `display: none !important` under `@media print`, and hiding a box hides its
  whole subtree — so any `print:block` inside a `.no-print` ancestor is dead on
  arrival. Both cards live in the editor's form column, which is `.no-print`, so
  the printable pages are a **separate component**
  (`src/components/common/OtherAttachmentsPrint.tsx`) mounted by the *editor* in
  the preview column with `print:order-3` (after the sheet at `order-1` and the
  approval slip at `order-2`). It reuses the card's signed-URL query, so there
  is no extra request. Verified by printing a replica in headless Chrome: 4
  pages with the fix vs 1 with the markup back inside the `.no-print` column.
- **The union table param must list only tables that really have the column.**
  `OtherAttachmentTable = Extract<AttachmentTable, "loa_forms" | "ot_forms">`
  feeds the service's first parameter, and the Supabase client builds
  `db.from(table)` as a *union* of those table types. If any member is missing
  the column in `src/server/db/database.types.ts`, the whole chain collapses to
  `SelectQueryError<"column 'other_attachments' does not exist on '…'.">` and
  every `.select()`/`.update()` result becomes `never`. The fix is to **narrow
  the union to the tables that actually carry the card** (plus, if a listed table
  genuinely has the feature, add the column to its Row + Insert + Update and a
  migration). Do NOT widen the union to a table with no UI just to satisfy the
  typecheck — that is how an unwanted `cos_forms.other_attachments` migration
  got written and then reverted the same day.
- **`setQueryData` updaters must build the empty branch too.** Once the query
  data carries a key that the written payload doesn't,
  `(prev) => (prev ? { ...prev, ...next } : next)` fails typecheck — the
  `prev === undefined` branch needs the extra key as well (here
  `{ ...next, others: [] }`).

## Known state

- Repo has an uncommitted WIP set (~14 files, 9 commits ahead of origin) from a
  parallel session; `LoaFormFields.tsx` had transient type errors from that WIP
  that are not from this work.
- `npm run build` cannot complete in the WorkBuddy sandbox: Nitro's build step
  bulk-deletes `.output/` (241 files) and the safe-delete guard blocks it.
  Verify changes with `npm run typecheck` + ESLint instead.
- **Migrations 0017–0020 are not yet applied in Supabase** (0017–0019 from the
  COS work, `0020_ot_other_attachments.sql` for the OT card). The OT card will
  fail at runtime until those run. There is deliberately **no** 0021.

## UI preferences (stated by the user)

- Login screen: keep the **simple single centred card**. A two-column split
  layout with a dark navy brand panel was explicitly rejected ("i dont like it,
  remove this"). Don't reintroduce a full-bleed brand/side panel on the login.

