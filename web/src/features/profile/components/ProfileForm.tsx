import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { saveMyProfile, saveMyPhoto } from "@/api/profile.functions";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProfileAvatar } from "@/components/common/ProfileAvatar";
import { useSession } from "@/features/auth/use-session";
import { SignatureField } from "@/features/records/components/SignaturePad";
import { OrgSelect } from "@/components/common/OrgSelect";
import { PageTitle } from "@/components/common/PageTitle";
import {
  MAX_PHOTO_BYTES,
  MAX_PHOTO_MB,
  PHOTO_ACCEPT,
  readPhotoFile,
  type PhotoSource,
} from "@/lib/photo";
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
import { PhotoCropDialog } from "./PhotoCropDialog";

const empty: EmployeeProfile = {
  emp_no: "",
  full_name: "",
  designation: "",
  area: "",
  department: "",
  signature: "",
  photo: "",
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
  /** The picked file, decoded and waiting in the crop dialog. */
  const [cropSource, setCropSource] = useState<PhotoSource | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
    form.photo !== original.photo ||
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
      // The admin lists keep their own batch cache keyed by account id, so a
      // new photo would otherwise take up to its 5-minute staleTime to show up
      // beside your own name in the activity log.
      await qc.invalidateQueries({ queryKey: ["user-photos"] });
      toast.success("Profile saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onPickPhoto(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_PHOTO_BYTES) {
      toast.error(`That photo is over ${MAX_PHOTO_MB} MB — pick a smaller one.`);
      return;
    }
    const source = await readPhotoFile(file);
    if (!source) {
      toast.error("That file couldn't be read as an image.");
      return;
    }
    setCropSource(source);
    setCropOpen(true);
  }

  /**
   * The photo saves itself.
   *
   * "Use photo" and "Remove photo" both land here and hit the photo-only
   * endpoint, so the page never asks for a second Save just to keep a face —
   * and because only `photo` is written, a half-typed field elsewhere on the
   * form is not committed along with it. The form is updated optimistically so
   * the circle changes the instant the cropper closes, and rolled back if the
   * request fails.
   */
  async function applyPhoto(photo: string) {
    setCropOpen(false);
    setCropSource(null);

    const previous = form.photo;
    setForm((current) => ({ ...current, photo }));
    setBusy(true);
    try {
      const saved = await saveMyPhoto({ data: { photo } });
      setForm((current) => ({ ...current, photo: saved.photo }));
      // `original` follows, so the photo alone never leaves the form dirty.
      setOriginal((current) => ({ ...current, photo: saved.photo }));
      await qc.invalidateQueries({ queryKey: profileQueryOptions().queryKey });
      // The admin lists cache photos by account id — refresh them so the new
      // face appears beside this person's name straight away.
      await qc.invalidateQueries({ queryKey: ["user-photos"] });
      toast.success(photo ? "Photo updated" : "Photo removed");
    } catch (e) {
      setForm((current) => ({ ...current, photo: previous }));
      toast.error(e instanceof Error ? e.message : "That photo could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  const displayName = form.full_name.trim() || session?.label || "Your name";
  const roleLine = [form.designation, form.department].filter(Boolean).join(" · ");

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

      {/* ── Who this is, and the photo menu ───────────────────────────────── */}
      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-start gap-4">
          {/*
            The Edit pill hangs off the bottom edge of the circle, so the
            wrapper reserves that height itself — the card's padding alone
            would leave the pill floating inside the avatar instead of
            straddling its edge the way the reference shows.
          */}
          <div className="relative shrink-0 pb-3">
            <ProfileAvatar
              photo={form.photo}
              name={displayName}
              size={96}
              className="ring-1 ring-border"
            />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={busy}
                  className="absolute bottom-0 left-1/2 inline-flex -translate-x-1/2 cursor-pointer items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium shadow-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Pencil className="size-3" aria-hidden="true" />
                  Edit
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56 bg-card text-foreground">
                <DropdownMenuItem
                  className="focus:bg-muted focus:text-foreground"
                  onSelect={() => fileRef.current?.click()}
                >
                  <Upload className="size-4" aria-hidden="true" />
                  Upload a photo…
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                  disabled={!form.photo || busy}
                  onSelect={() => void applyPhoto("")}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  Remove photo
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <p className="px-2 py-1.5 text-xs leading-relaxed text-muted-foreground">
                  JPG, PNG or WebP, up to {MAX_PHOTO_MB} MB.
                </p>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Opened by the menu item above — a hidden input is the only way
                to reach the OS picker without a second visible control. */}
            <input
              ref={fileRef}
              type="file"
              accept={PHOTO_ACCEPT}
              className="hidden"
              onChange={(event) => {
                void onPickPhoto(event.target.files?.[0]);
                // Cleared so picking the same file twice fires `change` again.
                event.target.value = "";
              }}
            />
          </div>

          <div className="min-w-0 flex-1 pt-1">
            <p className="truncate text-xl font-bold tracking-tight">{displayName}</p>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {roleLine || "Add your position and department"}
            </p>
            <p className="truncate text-sm text-muted-foreground">
              {form.area || "Add the office you report to"}
            </p>
            {form.emp_no ? (
              <p className="mt-2">
                <span className="inline-flex rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
                  Emp No. {form.emp_no}
                </span>
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <h2 className="sr-only">Employee details</h2>
          <span className="ml-auto text-xs text-muted-foreground">{completeness}% complete</span>
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
          paperWidth="full"
          onChange={(v) => setForm({ ...form, signature: v })}
        />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className="btn btn-primary" disabled={busy || !isDirty} onClick={onSave}>
            {busy ? "Saving…" : "Save profile"}
          </button>
        </div>
      </section>

      <ChangePasswordForm />

      {/* Framing happens on the photo only. Confirming saves it straight away,
          so there is nothing to remember to press afterwards. */}
      <PhotoCropDialog
        open={cropOpen}
        source={cropSource}
        onCancel={() => {
          setCropOpen(false);
          setCropSource(null);
        }}
        onUse={(dataUrl) => void applyPhoto(dataUrl)}
      />
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
