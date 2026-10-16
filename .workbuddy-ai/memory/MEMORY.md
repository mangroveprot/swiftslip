# Project memory — DTR-App (SwiftSlip)

## Conventions that must be followed

- **Every change gets an `ACTIVITY_LOG.md` entry at the TOP** (What / Why /
  Where / By). Insert after the three `---` separators that follow "How to
  write an entry". `CLAUDE.md` requires reading it before any change.
- **Before finishing:** `npm run typecheck`, `npx eslint <file>`,
  `npx prettier --write <file>`.
- **Layering enforced by ESLint** (`no-restricted-imports`) + Vite
  `importProtection`: `routes → features → components/lib → api → server →
  config/shared`. Frontend never imports `@/server/**` or
  `@/config/env.server`; `src/shared` imports neither React nor either side.
- Server-only modules are `*.server.ts`. `src/config/env.server.ts` is the only
  place that reads `process.env`.

## Writing style (stated by the user)

- **No emdashes in user-visible copy** — they read as AI-written. Substitute:
  colon (clarifying aside), `, so` (consequence), period (two independent
  clauses), `(full view)` for dialog titles, ` | ` for the SEO title separator.
- **One exception remains:** the placeholder dashes in the form previews
  (logo / typed-value stand-ins). The OrgSelect "no value" row was on the
  old exception list but the user asked it gone on 2026-10-16, then reversed
  that on the same day after seeing the empty row — `—` IS the correct
  "nothing picked" cue for a list picker, and the muted `text-sm` ghost
  text alone reads as a broken control. Keep the emdash here.
- Emdashes inside **code comments** (~527) stay — user decided 2026-10-14.
- Login screen: keep the **simple single centred card**. A two-column split
  with a dark navy brand panel was explicitly rejected.

## Design system (SwiftSlip half)

- Font **Geist**. Tokens in `src/styles.css` `:root`: `--primary` navy
  oklch(0.33 0.09 250), `--accent` orange oklch(0.62 0.13 45), `--background`
  warm paper oklch(0.968 0.008 85), `--card` white, `--radius: 0.5rem`.
- **Body background is `var(--app-gradient)` `fixed`** — a soft mint → pale
  green → cream → warm-paper sweep. The **peach/salmon end (hue 45 / 35) was
  cut on 2026-10-14** as an AI tell; do not reinstate it. Keep the wash.
  (I once deleted the whole gradient by mistake — the user wants a background,
  just not the orange corner.)
- **`--glass` is opaque** (`oklch(1 0 0)`) — it used to be 62% white to let the
  gradient through. Its three consumers (`sidebar-ui.tsx`, `AppShell.tsx`,
  `AdminPanel.tsx`) use `border-border`, not `border-white/40`.
- Utilities: `.btn`, `.btn-primary`, `.btn-outline`, `.inp`, `.lbl`, `.field`,
  `.form-fill`, `.zoom-card`, `.no-print`, `.print-sheet`.
- **`.form-fill`** = shared filled-field wrapper; put it on a white (`bg-card`)
  surface — `--muted` fill on `bg-background` is too faint.
- **Contrast gotcha:** `--muted-foreground` on `--background` is only ≈4.2:1
  (below AA). For small text use `text-foreground/70` (≈8:1) or darker.
- Inventory (`/rgc-asset-inventory`) uses its own scoped styles + Tailwind's
  default palette (slate/emerald/orange/rose) and brand-* vars — don't mix
  those into SwiftSlip screens.

## Single brand logo — Mindbridge only

`logoPath`, `obLogoPath`, `mindbridgeLogoPath` all point at
`public/mindbridge_logo.png`. Each call site keeps its own size
(auth/sidebar/mobile `h-10`, DTR preview `h-[42px]`, OB/COS/OT `w-[30%]`).
Keep it PNG — Word doesn't render WebP and previews load it directly.
Every `.docx` template carries its own embedded logo, so no export
injects one any more.

## Word export pipeline (all five forms)

LOA/OB/COS/OT/DTR: a tokenized `public/<x>_template.docx` (built once by
`scripts/<x>-template-tokenize.mjs`) is fetched and filled by
`features/<x>/lib/word-export.ts` via docxtemplater +
`docxtemplater-image-module-free`, then downloaded.

- Tokenize scripts must be **idempotent** (`{someToken}` guard), must
  **validate with a full fill AND an empty fill** before writing, and must back
  the original up to `os.tmpdir()` first.
- Row loops: `{#entries}` in the first cell's run, `{/entries}` in the last —
  the whole `<w:tr>` repeats. Works with `paragraphLoop: true`.
- Blank cells often hold a **self-closing** `<w:p .../>`. Match with
  `/<w:p\b[^>]*?\/>/`; the OT script's `insertIntoCell` (which looks for
  `</w:p>`) will not find these.
- `w:lineRule="auto"` → `w:spacing/@w:line` counts **240ths of a line**, so 240
  is single spacing; anything much lower overlaps text.
- `docxtemplater-image-module-free` throws on an empty `Uint8Array` — for a
  missing signature pass a 1×1 transparent PNG and `getSize` `[1, 1]`.

## Form previews

`LoaPreview`/`ObPreview`/`CosPreview`/`OtPreview`/`DtrPreview` replicate their
`public/*_template.docx`.

**House style = the OB preview:** fluid `w-full` with inline Tailwind,
`text-[13px]` body, `border-[2.5px] border-ink` boxes, `mx-auto w-full
bg-paper px-6` root carrying `print-sheet`, logo at `w-[30%]`, *separate
bordered boxes with an `h-2.5` gap* rather than one continuous grid. A
`HeaderField` helper renders label-bold/value-below cells; `bg-yellow-300`
marks a highlighted label. No sheet CSS in `styles.css`.

**Do NOT** (tried 2026-10-07, reverted): pixel-exact replica scaled to fit —
accurate on paper, unreadable on screen. Only LOA needs it (`.loa-fitbox`).
Don't generalise.

## Verifying UI without a dev server

No reachable dev server here, but presentational components can be
screenshotted: `npx tsx <script>.mts` → `renderToStaticMarkup` from
`react-dom/server` with a hand-written CSS shim, then
`chrome.exe --headless=new --disable-gpu --hide-scrollbars
--force-device-scale-factor=1.5 --window-size=830,900 --screenshot=<png>
"file:///<abs html>"`.

For **real Tailwind**, use the v4 Node API: `const { compile } = await
import("tailwindcss")`, `compile(readFileSync("src/styles.css"), { base,
loadStylesheet })`, `compiler.build([...classNames])`. Map `tailwindcss` and
`tw-animate-css` to their `node_modules` CSS paths — `readFileSync` on a bare
package name throws `EISDIR`.

## Verifying document exports (Word/Excel)

Builders are browser-only but runnable headlessly: `npx tsx <script>.mts`
stubbing `fetch` (read `public/<template>`), `document.createElement`,
`body.appendChild`, and `URL.createObjectURL` (capture the Blob). `tsx`
resolves `@/` paths. **Patch `URL` by assignment, never replace
`globalThis.URL`** — the ESM loader uses `instanceof URL` and throws.

Word is at `C:\Program Files\Microsoft Office\root\Office16\WINWORD.EXE`;
PowerShell COM gives a page count (`$doc.ComputeStatistics(2)`) and a PDF
(`ExportAsFixedFormat($pdf, 17)`). Reliable **if** no other Word process holds
the file — copy to a fresh `C:\Temp\<name>.docx` first. Render the PDF with
PyMuPDF (110 dpi full page, 300 dpi crop). Probe `Range.Information(3)` on
every paragraph/row to find exactly what spills.

## Attachments (LOA / OT — NOT COS)

One table-agnostic trio in `src/server/services/attachments.server.ts`, keyed
on `(table, id, owner_id)`. Max 8 files, 10 MB each; a printable file follows
the form on its own page. **COS deliberately has none.**

Gotchas (all hit 2026-10-07):

- **A print page inside the card can never print** — `.no-print` is
  `display:none !important` under `@media print`, and the cards live in the
  editor's `.no-print` form column. Printable pages are a separate component
  (`src/components/common/OtherAttachmentsPrint.tsx`) mounted in the preview
  column with `print:order-3` (sheet `order-1`, approval slip `order-2`).
- Union param must list only tables with the column:
  `Extract<AttachmentTable, "loa_forms" | "ot_forms">`.
- `setQueryData` updaters must build the empty branch too (`{ ...next,
  others: [] }`).

## Known state

- Uncommitted WIP set (~14 files, 9 commits ahead of origin) from a parallel
  session; `LoaFormFields.tsx` had transient type errors from that WIP.
- `npm run build` cannot complete in this sandbox — Nitro bulk-deletes
  `.output/` (241 files) and the safe-delete guard blocks it. Verify with
  `npm run typecheck` + ESLint instead.
- **Migrations 0017–0020 not yet applied in Supabase.** The OT card fails at
  runtime until they run. There is deliberately **no** 0021.
