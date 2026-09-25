import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { saveMyProfile } from "@/api/profile.functions";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/features/auth/use-session";
import type { EmployeeProfile } from "@/shared/types";
import { profileQueryOptions } from "../queries";
import { ChangePasswordForm } from "./ChangePasswordForm";

const empty: EmployeeProfile = {
  emp_no: "",
  full_name: "",
  designation: "",
  area: "",
};

const FIELDS: Array<{ key: keyof EmployeeProfile; label: string; placeholder?: string }> = [
  { key: "emp_no", label: "Emp No.", placeholder: "e.g. 2024-0113" },
  { key: "full_name", label: "Full name", placeholder: "Juan Dela Cruz" },
  { key: "designation", label: "Designation", placeholder: "e.g. Records Officer" },
  { key: "area", label: "Area", placeholder: "e.g. Main Office" },
];

export function ProfileForm() {
  const session = useSession();
  const qc = useQueryClient();
  const { data } = useQuery(profileQueryOptions());
  const [form, setForm] = useState<EmployeeProfile>(empty);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const completeness = useMemo(() => {
    const filled = FIELDS.filter((f) => form[f.key].trim().length > 0).length;
    return Math.round((filled / FIELDS.length) * 100);
  }, [form]);

  async function onSave() {
    setBusy(true);
    setStatus("");
    try {
      const saved = await saveMyProfile({ data: form });
      setForm(saved);
      await qc.invalidateQueries({ queryKey: profileQueryOptions().queryKey });
      setStatus("Profile saved");
      setTimeout(() => setStatus(""), 2000);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl space-y-6 px-6 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Account</p>
          <h1 className="mt-1 text-4xl">My profile</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            These details fill in automatically when you create a new time record.
          </p>
        </div>
        {session ? (
          <Badge
            variant={session.role === "admin" ? "default" : "secondary"}
            className="mt-1 shrink-0"
          >
            {session.role === "admin" ? "Administrator" : "Staff"}
          </Badge>
        ) : null}
      </div>

      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-medium">Employee details</h2>
          <span className="text-xs text-muted-foreground">{completeness}% complete</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${completeness}%` }}
          />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <Field
              key={f.key}
              label={f.label}
              placeholder={f.placeholder}
              value={form[f.key]}
              onChange={(v) => setForm({ ...form, [f.key]: v })}
            />
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className="btn btn-primary" disabled={busy} onClick={onSave}>
            {busy ? "Saving…" : "Save profile"}
          </button>
          {status ? <span className="text-sm text-muted-foreground">{status}</span> : null}
        </div>
      </section>

      <ChangePasswordForm />
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string | undefined;
}) {
  return (
    <label className="block">
      <span className="lbl">{label}</span>
      <input
        className="inp"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
