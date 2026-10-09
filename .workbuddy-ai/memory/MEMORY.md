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
- **`.form-fill`** is the shared "filled field" wrapper; put it on a white
  (`bg-card`) surface — a `--muted` fill on `bg-background` is too faint.
- **Contrast gotcha:** `--muted-foreground` on `--background` is only ≈4.2:1 —
  below WCAG AA. For small text use `text-foreground/70` (≈8:1) or darker.
- Inventory section (`/rgc-asset-inventory`) uses its own scoped styles +
  Tailwind's default palette (slate/emerald/orange/rose) and the brand-* theme
  vars — don't mix those into the SwiftSlip screens.

## Single brand logo — Mindbridge only

- All three logo slots in `src/config/app.ts` (`logoPath`, `obLogoPath`,
  `mindbridgeLogoPath`) point at the same PNG file:
  `public/mindbridge_logo.png`. There are no other brand logos on disk.
- Each call site keeps its OWN size — the image file is the big one, CSS
  scales it: DTR preview `h-[42px] w-auto`, OB/COS/OT previews
  `w-[30%] h-auto`, auth/sidebar `h-6`/`h-9`, LOA preview header logo.
- **Every `.docx` template carries its own embedded Mindbridge logo**, so no
  export injects one any more (DTR's export used to embed `APP.logoPath` as a
  data-URL `<img>` — it hasn't since 2026-10-08). Keep the shared file a PNG
  regardless: Word doesn't render WebP, and the previews load it directly.
  `public/mindbridge_logo.png` is the on-disk logo — previews, favicon, and
  anything not bundled inside a `.docx`.

## Word export pipeline (all five forms)

LOA/OB/COS/OT/**DTR** all work the same way: a tokenized
`public/<x>_template.docx` (built once by `scripts/<x>-template-tokenize.mjs`)
is fetched and filled by `features/<x>/lib/word-export.ts` using docxtemplater
+ `docxtemplater-image-module-free`, then downloaded as `.docx`. DTR joined on
2026-10-08; before that it built an HTML string and saved a `.doc`.

- A tokenize script must be **idempotent** (`{someToken}` guard) and must
  **validate by rendering a full fill AND an empty fill** before writing, and
  back the original up to `os.tmpdir()` first.
- Table-row loops: `{#entries}` rides in the first cell's run, `{/entries}` in
  the last — the whole `<w:tr>` repeats. Works with `paragraphLoop: true`.
- Cells in a blank company form often hold a **self-closing** `<w:p .../>`, not
  `<w:p></w:p>`. Match it with `/<w:p\b[^>]*?\/>/` and replace it with
  `<w:p ...><w:r><w:t>{token}</w:t></w:r></w:p>`. The OT script's
  `insertIntoCell` (which looks for `</w:p>`) will not find these.

## Form previews

Each form's preview (`LoaPreview`, `ObPreview`, `CosPreview`, `OtPreview`,
`DtrPreview`) is a replica of the matching `public/*_template.docx`.

**Follow the OB preview's idiom — it is the house style.** Fluid `w-full` with
Tailwind utilities written inline, `text-[13px]` body, `border-[2.5px]
border-ink` boxes, an `mx-auto w-full bg-paper px-6` root carrying
`print-sheet`, the logo at `w-[30%]`, and *separate bordered boxes with an
`h-2.5` gap between them* rather than one continuous table grid. A `HeaderField`
helper renders each label-bold/value-below cell; `bg-yellow-300` marks a label
the template highlights. No sheet CSS in `styles.css`, no scaling wrapper, and
`styles.css` only needs `@page` plus the shared `.print-sheet` print rules.

**What NOT to do** (tried on 2026-10-07 and reverted the same day): rendering a
pixel-exact replica at the template's true content width and scaling it to fit.
It is accurate on paper but unreadable on screen. Only the LOA preview
genuinely needs that treatment (literal A4 page replica with the template's
margins as padding) — which is why `.loa-fitbox` exists. Don't generalise it.

## Verifying a React component's look without a dev server

There is no reachable dev server in this environment, but a presentational
component can still be screenshotted:

1. `npx tsx <script>.mts` — `renderToStaticMarkup(<Component {...props} />)` from
   `react-dom/server`, wrapped in a small hand-written CSS shim for the Tailwind
   utilities the component uses.
2. `"C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new
   --disable-gpu --hide-scrollbars --force-device-scale-factor=1.5
   --window-size=830,900 --screenshot=<png> "file:///<abs html>"`, then read the
   PNG back.

To render a **real Tailwind** stylesheet, use the v4 Node API:
`const { compile } = await import("tailwindcss")`,
`compile(readFileSync("src/styles.css"), { base, loadStylesheet })`, then
`compiler.build([...classNames])`. Map the two package imports
(`tailwindcss`, `tw-animate-css`) to their `node_modules/.../...css` paths
because `readFileSync` on a bare package name throws `EISDIR`.

## Verifying document exports (Word/Excel)

The `.docx`/`.xlsx` builders are browser-only, but they can be run headlessly:

1. `npx tsx <script>.mts` — import the real module and call it, stubbing
   `globalThis.fetch` (read `public/<template>` from disk),
   `globalThis.document` (`createElement`/`body.appendChild`) and
   `URL.createObjectURL` (capture the Blob → write to disk). `tsx` resolves the
   `@/` tsconfig paths. **Patch `URL` with assignment, not by replacing
   `globalThis.URL`** — the loader uses `instanceof URL` and will throw.
2. **Microsoft Word is installed** at
   `C:\Program Files\Microsoft Office\root\Office16\WINWORD.EXE`. PowerShell
   COM via the tool gives a real page count
   (`$doc.ComputeStatistics(2)`) and a PDF (`ExportAsFixedFormat($pdf, 17)`).
   Works reliably in this sandbox as long as the file isn't open in another
   Word process — copy to a fresh `C:\Temp\<name>.docx` before opening and read
   the result from disk.
3. Render the PDF: PyMuPDF in the managed venv — `page.search_for('...')`,
   then `page.get_pixmap(dpi=110).save(png)` for a full-page sanity check
   and `page.get_pixmap(dpi=300, clip=rect)` for a zoomed crop. Read the
   PNG back via the Read tool.
4. Probe `Range.Information(3)` (page number) on every paragraph/row of the
   document to find what spills — this is how the "only the certifier caption
   line overflows" diagnosis happened.

Delete the harness and artifacts afterwards. **OOXML gotcha:** under
`w:lineRule="auto"`, `w:spacing/@w:line` counts **240ths of a single line**, so
`w:line="240"` is single spacing and anything well under that overlaps text.
**One more**: `docxtemplater-image-module-free` throws if `getImage` receives
an empty `Uint8Array` — when the signature is missing, fall back to a 1×1
transparent PNG and `getSize` `[1, 1]`.

## Attachments (LOA / OT — NOT COS)

The "other attachments" feature lives on **two** form types (LOA first, then
OT) and is served by one table-agnostic trio in
`src/server/services/attachments.server.ts`, keyed on `(table, id, owner_id)`.
Behaviour on every form: max 8 files, 10 MB each; a printable (PDF/image) file
follows the form on its own page and a non-printable one contributes no page.
**COS deliberately does NOT have it** — do not add a column or card there.

Three gotchas, all hit on 2026-10-07:

- **A print page rendered inside the card can NEVER print.** `.no-print` is
  `display: none !important` under `@media print`. Both cards live in the
  editor's form column, which is `.no-print`, so the printable pages are a
  **separate component** (`src/components/common/OtherAttachmentsPrint.tsx`)
  mounted by the *editor* in the preview column with `print:order-3` (after
  the sheet at `order-1` and the approval slip at `order-2`).
- **The union table param must list only tables that really have the column.**
  `OtherAttachmentTable = Extract<AttachmentTable, "loa_forms" | "ot_forms">`.
  Don't widen the union to satisfy the typecheck.
- **`setQueryData` updaters must build the empty branch too.** Once the query
  data carries a key that the written payload doesn't, the `prev === undefined`
  branch needs the extra key as well (e.g. `{ ...next, others: [] }`).

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
  layout with a dark navy brand panel was explicitly rejected. Don't
  reintroduce a full-bleed brand/side panel on the login.