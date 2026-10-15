/* Throwaway: render the new mobile drawer to a PNG for review. Delete after. */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MobileSidebarDrawer } from "@/components/layout/MobileSidebarDrawer";
import { SidebarBrand, SidebarFooter, SidebarSection } from "@/components/layout/sidebar-ui";

const base = process.cwd();
const out = process.env.OUT_DIR || base;

// A stand-in for the real sidebar body (the real one needs the router), built
// from the same pieces so the preview shows the true chrome.
const child = (
  <>
    <SidebarBrand />
    <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto px-2 py-4">
      <SidebarSection label="Records & Forms">
        {["Daily Time Record", "Official Business", "Leave of Absence", "Overtime"].map((r) => (
          <span
            key={r}
            className="flex items-center gap-3 rounded-md px-2 py-2 text-sm text-foreground"
          >
            <span className="size-4 shrink-0 rounded-sm bg-muted" />
            <span className="min-w-0 truncate">{r}</span>
          </span>
        ))}
      </SidebarSection>
    </nav>
    <SidebarFooter name="Gerald Vilaver" sublabel="Administrator">
      <span className="flex items-center gap-3 rounded-md px-2 py-2 text-sm text-foreground">
        Sign out
      </span>
    </SidebarFooter>
  </>
);

const markup = renderToStaticMarkup(
  <MobileSidebarDrawer open onClose={() => {}}>
    {child}
  </MobileSidebarDrawer>,
);

// Collect the class names actually used, then compile just those.
const classes = new Set<string>();
for (const m of markup.matchAll(/class="([^"]*)"/g)) {
  for (const c of m[1].split(/\s+/)) if (c) classes.add(c);
}

const loadStylesheet = async (id: string, from: string) => {
  const candidates =
    id === "tailwindcss"
      ? [path.resolve(base, "node_modules/tailwindcss/index.css")]
      : id === "tw-animate-css"
        ? [
            path.resolve(base, "node_modules/tw-animate-css/dist/tw-animate.css"),
            path.resolve(base, "node_modules/tw-animate-css/dist/tw-animate-prefix.css"),
          ]
        : [path.resolve(from, id)];
  for (const p of candidates) {
    try {
      return { path: p, base: path.dirname(p), content: readFileSync(p, "utf8") };
    } catch {
      /* try next */
    }
  }
  throw new Error(`could not resolve stylesheet ${id}`);
};

const { compile } = await import("tailwindcss");
const compiler = await compile(readFileSync(path.resolve(base, "src/styles.css"), "utf8"), {
  base,
  loadStylesheet,
});
const css = compiler.build([...classes]);

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>${css}</style>
<style>html,body{margin:0;height:100%;background:var(--background,#f4f1ea);}
.pagemock{padding:16px;color:var(--muted-foreground,#666);font-family:sans-serif;}</style>
</head><body>
<div class="pagemock">page content behind the drawer</div>
${markup}
</body></html>`;

writeFileSync(path.join(out, "drawer.html"), html);
console.log("wrote", path.join(out, "drawer.html"), "classes:", classes.size);
