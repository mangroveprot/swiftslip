import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { saveMyProfile } from "@/api/profile.functions";
import type { EmployeeProfile } from "@/shared/types";
import { profileQueryOptions } from "../queries";

const empty: EmployeeProfile = {
  emp_no: "",
  full_name: "",
  designation: "",
  area: "",
};

export function ProfileForm() {
  const qc = useQueryClient();
  const { data } = useQuery(profileQueryOptions());
  const [form, setForm] = useState<EmployeeProfile>(empty);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

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
    <main className="mx-auto max-w-xl px-6 py-10">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Account</p>
        <h1 className="mt-1 text-4xl">My profile</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          These details fill in automatically when you create a new time record.
        </p>
      </div>

      <section className="mt-8 space-y-3 rounded-xl border bg-card p-4 shadow-sm">
        <Field
          label="Emp No."
          value={form.emp_no}
          onChange={(emp_no) => setForm({ ...form, emp_no })}
        />
        <Field
          label="Full name"
          value={form.full_name}
          onChange={(full_name) => setForm({ ...form, full_name })}
        />
        <Field
          label="Designation"
          value={form.designation}
          onChange={(designation) => setForm({ ...form, designation })}
        />
        <Field label="Area" value={form.area} onChange={(area) => setForm({ ...form, area })} />

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button className="btn btn-primary" disabled={busy} onClick={onSave}>
            Save profile
          </button>
          {status ? <span className="text-sm text-muted-foreground">{status}</span> : null}
        </div>
      </section>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="lbl">{label}</span>
      <input className="inp" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
