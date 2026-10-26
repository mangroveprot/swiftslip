import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { saveMyProfile } from "@/api/profile.functions";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/features/auth/use-session";
import { SignatureField } from "@/features/records/components/SignaturePad";
import { OrgSelect } from "@/components/common/OrgSelect";
import { PageTitle } from "@/components/common/PageTitle";
import { toast } from "@/lib/toast";
import {
  DEPARTMENTS,
  DESIGNATIONS,
  departmentForPosition,
  normalizeDesignation,
  normalizePosition,
  positionsUnder,
} from "@swiftslip/shared/org";
import type { EmployeeProfile } from "@swiftslip/shared/types";
import { orgOptionsQueryOptions } from "@/features/admin/queries";
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
  // Live org lists from `org_designations` / `org_departments` /
  // `org_positions` so the pickers reflect admin edits (add / rename /
  // delete). The hardcoded constants stay only as a fallback for the very
  // first render before the query resolves, and for the cases where the
  // server returns no rows.
  const { data: orgLists } = useQuery(orgOptionsQueryOptions());
  const designationOptions = orgLists?.designations ?? DESIGNATIONS;
  const baseDepartments = orgLists?.departments ?? DEPARTMENTS;
  const [form, setForm] = useState<EmployeeProfile>(empty);
  // The last-saved profile (or whatever the server returned). Compared with
  // `form` to decide whether Save profile can do anything — leaving the button
  // active on a no-op save re-submits the row and flashes a "Profile saved"
  // toast the user did nothing to earn.
  const [original, setOriginal] = useState<EmployeeProfile>(empty);
  const [busy, setBusy] = useState(false);
  // Reported by the pickers: "Others…" selected with nothing typed in it.
  const [deptInvalid, setDeptInvalid] = useState(false);
  const [departmentInvalid, setDepartmentInvalid] = useState(false);
  const [positionInvalid, setPositionInvalid] = useState(false);

  useEffect(() => {
    if (data) {
      setForm(data);
      setOriginal(data);
    }
  }, [data]);

  // The designation a department actually keeps: a position only sticks if it
  // fits the chosen department, otherwise it is treated as blank. Deriving it
  // (instead of destructively clearing `form.designation` when the department
  // changes) means a Department change that the user reverts leaves the profile
  // byte-identical to the original — so Save stays off, which it wouldn't if the
  // wipe had permanently dropped the position.
  const effectiveDesignation = (p: EmployeeProfile) => {
    const list = positionsUnder(p.department, orgLists);
    return p.designation && list.includes(p.designation) ? p.designation : "";
  };

  const isDirty =
    form.emp_no !== original.emp_no ||
    form.full_name !== original.full_name ||
    effectiveDesignation(form) !== effectiveDesignation(original) ||
    form.area !== original.area ||
    form.department !== original.department ||
    form.signature !== original.signature ||
    form.supervisor !== original.supervisor;

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

  // The department picker must be able to SHOW the department the picked
  // position implies, even when it isn't on the shared list yet (an older
  // position whose department was never added) — otherwise a perfectly
  // correct value would report as "Others" and open the text box over it.
  const impliedDepartment = departmentForPosition(form.designation, orgLists);
  const departmentOptions =
    impliedDepartment && !baseDepartments.includes(impliedDepartment)
      ? [...baseDepartments, impliedDepartment]
      : baseDepartments;

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
      setOriginal(saved);
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
          <PageTitle size="xl" className="mt-1">
            My profile
          </PageTitle>
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
            list={designationOptions}
            value={form.area}
            placeholder="e.g. RGC Dipolog Satellite"
            allowOthers={session?.role === "admin"}
            onChange={(v) => setForm({ ...form, area: normalizeDesignation(v) })}
            onValidityChange={setDeptInvalid}
          />
          <OrgSelect
            id="profile-department"
            label="Department"
            list={departmentOptions}
            value={form.department}
            placeholder="e.g. Information Technology"
            allowOthers={session?.role === "admin"}
            onChange={(v) => {
              // Only the department changes here. A position that no longer
              // fits the new department is handled by `effectiveDesignation`
              // (shown and saved as blank) rather than being destroyed, so a
              // revert restores it and Save stays off.
              setForm((prev) => ({ ...prev, department: v }));
            }}
            onValidityChange={setDepartmentInvalid}
          />
          <OrgSelect
            id="profile-position"
            label="Position"
            list={positionsUnder(form.department, orgLists)}
            value={effectiveDesignation(form)}
            placeholder={form.department ? "Pick a position in this department" : "e.g. IT Support"}
            allowOthers={session?.role === "admin"}
            onChange={(v) =>
              setForm((prev) => {
                const next: EmployeeProfile = {
                  ...prev,
                  designation: normalizePosition(v),
                };
                // The department follows the position only when the current
                // one can't hold it — a department the person just picked by
                // hand must stay picked. Otherwise choosing a position under
                // "IT DEP" silently rewrote the department back to
                // "Information Technology".
                const implied = departmentForPosition(v, orgLists);
                const current = prev.department.trim();
                if (implied && !positionsUnder(current, orgLists).includes(next.designation)) {
                  next.department = implied;
                }
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
          <button className="btn btn-primary" disabled={busy || !isDirty} onClick={onSave}>
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
