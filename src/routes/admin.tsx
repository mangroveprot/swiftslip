import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { AppShell, useMe } from "@/components/AppShell";
import { deleteCode, getTemplate, listCodes, saveTemplate, upsertCode } from "@/lib/dtr.functions";
import { PERIOD_LABELS, type DtrTemplate, type Period, type Role } from "@/lib/dtr-shared";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Settings — SwiftSlip" },
      { name: "description", content: "Edit the Daily Time Record template and manage access passwords." },
      { property: "og:title", content: "Settings — SwiftSlip" },
      { property: "og:description", content: "Edit the Daily Time Record template and manage access passwords." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <AdminPage />
    </AppShell>
  ),
});

function AdminPage() {
  const { data: who } = useMe();
  if (who?.role !== "admin") {
    return <main className="mx-auto max-w-3xl px-6 py-16 text-muted-foreground">Administrator access required.</main>;
  }
  return (
    <main className="mx-auto max-w-4xl space-y-10 px-6 py-10">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Administration</p>
        <h1 className="mt-1 text-4xl">Settings</h1>
      </div>
      <TemplateEditor />
      <PasswordManager />
    </main>
  );
}

function TemplateEditor() {
  const fetchTemplate = useServerFn(getTemplate);
  const save = useServerFn(saveTemplate);
  const { data } = useQuery({ queryKey: ["template"], queryFn: () => fetchTemplate() });
  const [form, setForm] = useState<DtrTemplate | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  if (!form) return <p className="text-sm text-muted-foreground">Loading template…</p>;

  const set = (patch: Partial<DtrTemplate>) => setForm({ ...form, ...patch });

  return (
    <section className="rounded-xl border bg-card p-6">
      <h2 className="text-2xl">DTR template</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        These labels and defaults are used on every record sheet, print-out and download.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Text label="Form title" value={form.title} onChange={(v) => set({ title: v })} />
        <Text label="Office / organisation" value={form.org_name} onChange={(v) => set({ org_name: v })} />
        <Text label="IN column label" value={form.columns.in} onChange={(v) => set({ columns: { ...form.columns, in: v } })} />
        <Text
          label="OUT column label"
          value={form.columns.out}
          onChange={(v) => set({ columns: { ...form.columns, out: v } })}
        />
        <Text
          label="Schedule column label"
          value={form.columns.schedule}
          onChange={(v) => set({ columns: { ...form.columns, schedule: v } })}
        />
        <Text
          label="Remarks column label"
          value={form.columns.remarks}
          onChange={(v) => set({ columns: { ...form.columns, remarks: v } })}
        />
        <Text
          label="Employee signature line"
          value={form.employee_signature_label}
          onChange={(v) => set({ employee_signature_label: v })}
        />
        <Text label="Certified by line" value={form.certified_by_label} onChange={(v) => set({ certified_by_label: v })} />
        <Text
          label="Certifier signature line"
          value={form.certifier_signature_label}
          onChange={(v) => set({ certifier_signature_label: v })}
        />
        <Text
          label="Default working schedule"
          value={form.default_schedule}
          onChange={(v) => set({ default_schedule: v })}
        />
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Default period</span>
          <select
            value={form.default_period}
            onChange={(e) => set({ default_period: e.target.value as Period })}
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            {Object.entries(PERIOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        className="btn btn-primary mt-6"
        onClick={async () => {
          await save({ data: form });
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        }}
      >
        {saved ? "Saved" : "Save template"}
      </button>
    </section>
  );
}

function PasswordManager() {
  const qc = useQueryClient();
  const fetchCodes = useServerFn(listCodes);
  const save = useServerFn(upsertCode);
  const remove = useServerFn(deleteCode);
  const { data: codes } = useQuery({ queryKey: ["codes"], queryFn: () => fetchCodes() });
  const [label, setLabel] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function add() {
    setError("");
    try {
      await save({ data: { label: label || "Access", role, password } });
      setLabel("");
      setPassword("");
      qc.invalidateQueries({ queryKey: ["codes"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that password.");
    }
  }

  return (
    <section className="rounded-xl border bg-card p-6">
      <h2 className="text-2xl">Access passwords</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Anyone with an administrator password can edit records, import files and change this list. Other passwords can only
        view, print and download.
      </p>

      <ul className="mt-6 divide-y rounded-lg border">
        {(codes ?? []).map((c) => (
          <li key={c.id} className="flex items-center gap-4 px-4 py-3 text-sm">
            <span className="font-medium">{c.label}</span>
            <span className="rounded-full border px-2 py-0.5 text-xs uppercase tracking-wider text-muted-foreground">
              {c.role === "admin" ? "Administrator" : "View only"}
            </span>
            <button
              className="ml-auto text-destructive"
              onClick={async () => {
                setError("");
                try {
                  await remove({ data: { id: c.id } });
                  qc.invalidateQueries({ queryKey: ["codes"] });
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Could not delete that password.");
                }
              }}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <Text label="Name" value={label} onChange={setLabel} />
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Access level</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="user">View only</option>
            <option value="admin">Administrator</option>
          </select>
        </label>
        <Text label="Password" value={password} onChange={setPassword} />
        <button className="btn btn-primary self-end" onClick={add}>
          Add password
        </button>
      </div>
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
    </section>
  );
}

function Text({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
      />
    </label>
  );
}
