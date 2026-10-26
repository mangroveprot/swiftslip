import { compile } from "tailwindcss";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const cache = new Map<string, string>();
const resolver = (id: string, base: string) => {
  if (cache.has(id)) return { path: id, base, content: cache.get(id)! };
  let file = id;
  if (id === "tailwindcss") file = resolve(root, "node_modules/tailwindcss/index.css");
  else if (id === "tw-animate-css")
    file = resolve(root, "node_modules/tw-animate-css/dist/tw-animate.css");
  else if (!id.startsWith(".") && !id.startsWith("/")) file = resolve(root, id);
  else file = resolve(base, id);
  const content = readFileSync(file, "utf8");
  cache.set(id, content);
  return { path: file, base: file, content };
};

const compiler = await compile(readFileSync(resolve(root, "src/styles.css"), "utf8"), {
  base: resolve(root, "src"),
  loadStylesheet: async (id: string, base: string) => resolver(id, base),
});

const cls = [
  "form-fill","flex","min-h-0","flex-col","rounded-xl","border","bg-card","p-3","shadow-sm",
  "lg:flex-1","lg:overflow-hidden","shrink-0","gap-3","lg:overflow-auto","space-y-3","rounded-2xl","p-4",
];

// Fixed 420px column. Siblings: form fields (shrink-0), entries table, card (shrink-0).
// BEFORE: entries table has no lg:flex-1/overflow -> it overflows and pushes.
// AFTER: entries table absorbs slack and scrolls.
const col = (tableCls: string, innerCls: string, label: string) => `
<div style="width:340px;height:330px;display:flex;flex-direction:column;overflow:hidden;background:#fff;border:1px solid #999">
  <div class="no-print flex min-h-0 flex-col gap-3 lg:overflow-auto" id="col-${label}" style="min-height:0">
    <section class="form-fill shrink-0 rounded-xl border bg-card p-3 shadow-sm">
      <p style="font:11px sans-serif;margin:0">FORM FIELDS + SIGNATURE</p>
      <div style="height:150px"></div>
    </section>
    <section class="${tableCls}">
      <p style="font:11px sans-serif;margin:0">OVERTIME (entries, long)</p>
      <div class="${innerCls}">
        <div style="height:400px;background:repeating-linear-gradient(#ffe, #ffe 20px, #ffd 20px, #ffd 40px)"></div>
      </div>
    </section>
    <section class="form-fill shrink-0 rounded-2xl border bg-card p-4 shadow-sm" id="card-${label}">
      <p style="font:11px sans-serif;margin:0">OTHER ATTACHMENTS CARD</p>
    </section>
  </div>
</div>`;

const tableBefore = "form-fill flex min-h-0 flex-col rounded-xl border bg-card p-3 shadow-sm";
const tableAfter = "form-fill flex min-h-0 flex-col rounded-xl border bg-card p-3 shadow-sm lg:flex-1 lg:overflow-hidden";

const page = `<!doctype html><html><head><meta charset="utf-8">
<style>${compiler.build(cls)}</style>
<style>body{margin:0;padding:12px;background:#e9e9ea;font:12px system-ui}
.wrap{display:flex;gap:24px}h3{font:600 12px system-ui;margin:0 0 6px}
pre{font:11px monospace;background:#fff;padding:8px;margin-top:12px}</style>
</head><body>
<div class="wrap">
  <div><h3>BEFORE</h3>${col(tableBefore, "min-h-0 space-y-3", "before")}</div>
  <div><h3>AFTER</h3>${col(tableAfter, "min-h-0 space-y-3 lg:flex-1 lg:overflow-auto", "after")}</div>
</div>
<pre id="out"></pre>
<script>
const res={};
for (const label of ["before","after"]) {
  const colEl=document.getElementById("col-"+label);
  const card=document.getElementById("card-"+label);
  const sections=[...colEl.children].map(el=>{const r=el.getBoundingClientRect();return {
    top:Math.round(r.top), bottom:Math.round(r.bottom), h:Math.round(r.height),
    scrollH:el.scrollHeight, clientH:el.clientHeight,
    text:(el.textContent||"").trim().slice(0,18)}});
  const colR=colEl.getBoundingClientRect();
  res[label]={colBottom:Math.round(colR.bottom), cardBottom:Math.round(card.getBoundingClientRect().bottom),
    colScrollH:colEl.scrollHeight, colClientH:colEl.clientHeight, sections};
}
document.getElementById("out").textContent=JSON.stringify(res,null,1);
</script></body></html>`;

writeFileSync(resolve(root, "scripts/_tmp_layout.html"), page, "utf8");
console.log("OK");
