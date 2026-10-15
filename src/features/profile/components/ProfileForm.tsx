import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { saveMyProfile } from "@/api/profile.functions";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/features/auth/use-session";
import { SignatureField } from "@/features/records/components/SignaturePad";
import { OrgSelect } from "@/components/common/OrgSelect";
import { toast } from "@/lib/toast";
import {
  DEPARTMENTS,
  DESIGNATIONS,
  departmentForPosition,
  normalizeDesignation,
  normalizePosition,
  positionsForDepartment,
} from "@/shared/org";
import type { EmployeeProfile } from "@/shared/types";
import { profileQueryOptions } from "../queries";
import { ChangePasswordForm } from "./ChangePasswordForm";

const empty: EmployeeProfile = {
  emp_no: "",
  full_name: "",
  designation: "",
  area: "",
  department: "",
  signature: "",
  supervisor: "",
};

const FIELDS: Array<{ key: keyof EmployeeProfile; label: string; placeholder?: string }> = [
  { key: "emp_no", label: "Emp No.", placeholder: "e.g. 2024-0113" },
  { key: "full_name", label: "Full name", placeholder: "Juan Dela Cruz" },
  {
    key: "supervisor",
    label: "Supervisor",
    placeholder: "e.g. Maria Santos",
  },
];

export function ProfileForm() {
  const session = useSession();
  const qc = useQueryClient();
  const { data } = useQuery(profileQueryOptions());
  const [form, setForm] = useState<EmployeeProfile>(empty);
  const [busy, setBusy] = useState(false);
  // Reported by the pickers: "Others…" selected with nothing typed in it.
  const [deptInvalid, setDeptInvalid] = useState(false);
  const [departmentInvalid, setDepartmentInvalid] = useState(false);
  const [positionInvalid, setPositionInvalid] = useState(false);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  // Designation, Department and Position are pickers rather than FIELDS entries,
  // so they are counted separately — otherwise the bar could read 100% with the
  // Position sitting on an unanswered "Others…".
  const completeness = useMemo(() => {
    const filled = FIELDS.filter((f) => form[f.key].trim().length > 0).length;
    const orgFilled =
      Number(form.area.trim().length > 0) +
      Number(form.department.trim().length > 0) +
      Number(form.designation.trim().length > 0);
    return Math.round(((filled + orgFilled) / (FIELDS.length + 3)) * 100);
  }, [form]);

  async function onSave() {
    // Refuse rather than store an empty value: choosing "Others…" and hitting
    // Save with nothing typed would wipe the employee's org fields.
    if (deptInvalid) {
      toast.error("Please specify the designation, or pick one from the list.");
      return;
    }
    if (departmentInvalid) {
      toast.error("Please specify the department, or pick one from the list.");
      return;
    }
    if (positionInvalid) {
      toast.error("Please specify the position, or pick one from the list.");
      return;
    }

    setBusy(true);
    try {
      const saved = await saveMyProfile({ data: form });
      setForm(saved);
      await qc.invalidateQueries({ queryKey: profileQueryOptions().queryKey });
      toast.success("Profile saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
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
            These details and your signature fill in automatically whenever you create a new time
            record or form. Your supervisor pre-fills the approver field on each one.
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
          {/* Fixed-choice pickers. They sit inside the same grid as the free
              text fields above; `area` / `department` / `designation` are
              what the app stores as Designation / Department / Position, and
              the forms auto-fill from them. */}
          <OrgSelect
            id="profile-designation"
            label="Designation"
            list={DESIGNATIONS}
            value={form.area}
            placeholder="e.g. RGC Dipolog Satellite"
            allowOthers={session?.role === "admin"}
            onChange={(v) => setForm({ ...form, area: normalizeDesignation(v) })}
            onValidityChange={setDeptInvalid}
          />
          <OrgSelect
            id="profile-department"
            label="Department"
            list={DEPARTMENTS}
            value={form.department}
            placeholder="e.g. Information Technology"
            allowOthers={session?.role === "admin"}
            onChange={(v) => {
              setForm((prev) => {
                // The stored position lives under exactly one department —
                // switching department drops a position that no longer fits.
                const next = { ...prev, department: v };
                if (prev.designation && !positionsForDepartment(v).includes(prev.designation)) {
                  next.designation = "";
                }
                return next;
              });
            }}
            onValidityChange={setDepartmentInvalid}
          />
          <OrgSelect
            id="profile-position"
            label="Position"
            list={positionsForDepartment(form.department)}
            value={form.designation}
            placeholder={form.department ? "Pick a position in this department" : "e.g. IT Support"}
            allowOthers={session?.role === "admin"}
            onChange={(v) =>
              setForm((prev) => {
                const next: EmployeeProfile = {
                  ...prev,
                  designation: normalizePosition(v),
                };
                // A listed position implies its department, so the stored
                // pair stays the one the forms will print.
                const implied = departmentForPosition(v);
                if (implied && !prev.department.trim()) next.department = implied;
                return next;
              })
            }
            onValidityChange={setPositionInvalid}
          />
        </div>

        <SignatureField
          value={form.signature}
          disabled={busy}
          onChange={(v) => setForm({ ...form, signature: v })}
        />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className="btn btn-primary" disabled={busy} onClick={onSave}>
            {busy ? "Saving…" : "Save profile"}
          </button>
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
