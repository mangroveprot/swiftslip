import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { saveTemplate } from "@/api/template.functions";
import { TextField } from "@/components/common/FormField";
import { Skeleton } from "@/components/ui/skeleton";
import { templateQueryOptions } from "@/features/template/queries";
import { toast } from "@/lib/toast";
import { PERIOD_LABELS } from "@/shared/period";
import type { DtrTemplate, Period } from "@/shared/types";

export function TemplateEditor() {
  const qc = useQueryClient();
  const { data } = useQuery(templateQueryOptions());
  const [form, setForm] = useState<DtrTemplate | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  if (!form) {
    return (
      <section className="rounded-xl border bg-card p-6">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="mt-2 h-4 w-80 max-w-full" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>
        <Skeleton className="mt-6 h-9 w-36" />
      </section>
    );
  }

  const set = (patch: Partial<DtrTemplate>) => setForm({ ...form, ...patch });
  const setColumn = (patch: Partial<DtrTemplate["columns"]>) =>
    set({ columns: { ...form.columns, ...patch } });

  return (
    <section className="rounded-xl border bg-card p-6">
      <h2 className="text-2xl">DTR template</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        These labels and defaults are used on every record sheet, print-out and download.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <TextField label="Form title" value={form.title} onChange={(v) => set({ title: v })} />
        <TextField
          label="Office / organisation"
          value={form.org_name}
          onChange={(v) => set({ org_name: v })}
        />
        <TextField
          label="IN column label"
          value={form.columns.in}
          onChange={(v) => setColumn({ in: v })}
        />
        <TextField
          label="OUT column label"
          value={form.columns.out}
          onChange={(v) => setColumn({ out: v })}
        />
        <TextField
          label="Schedule column label"
          value={form.columns.schedule}
          onChange={(v) => setColumn({ schedule: v })}
        />
        <TextField
          label="Remarks column label"
          value={form.columns.remarks}
          onChange={(v) => setColumn({ remarks: v })}
        />
        <TextField
          label="Employee signature line"
          value={form.employee_signature_label}
          onChange={(v) => set({ employee_signature_label: v })}
        />
        <TextField
          label="Certified by line"
          value={form.certified_by_label}
          onChange={(v) => set({ certified_by_label: v })}
        />
        <TextField
          label="Certifier signature line"
          value={form.certifier_signature_label}
          onChange={(v) => set({ certifier_signature_label: v })}
        />
        <TextField
          label="Default working schedule"
          value={form.default_schedule}
          onChange={(v) => set({ default_schedule: v })}
        />
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Default period
          </span>
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
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await saveTemplate({ data: form });
            // Every sheet reads this query, and caches now stay fresh for a while —
            // without an invalidation the old labels would keep being served.
            await qc.invalidateQueries({ queryKey: templateQueryOptions().queryKey });
            toast.success("Template saved");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not save the template.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Saving…" : "Save template"}
      </button>
    </section>
  );
}
