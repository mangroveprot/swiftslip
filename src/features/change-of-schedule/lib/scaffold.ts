import type { CosForm, EmployeeProfile } from "@/shared/types";

/**
 * A form the user hasn't actually filled in. Identity fields (id number, name,
 * plant/location, position) and Date Filed are auto-prefilled from the profile /
 * today when the form is created, and the saved signature is attached alongside
 * them, so they only count as content when they differ from that auto-fill —
 * otherwise a brand-new form would look "used" the moment it's created and never
 * get discarded on exit. A signature matching the profile (or none anywhere) is
 * still the auto-fill; a per-form override marks the form as worth keeping, as
 * do any real inputs (change type, effectivity date, either schedule line, the
 * reason, a sign-off, or an approval-slip attachment). Date Filed is excluded
 * here on purpose: edits to it are caught by the net-change check on leave.
 *
 * @param hasAttachment whether the form already has a file attached — the file
 * itself lives in storage, so the caller is the only place that knows.
 */
export function isScaffoldForm(
  form: CosForm,
  profile: EmployeeProfile | null,
  hasAttachment = false,
  /** Whether the form already has any schedule line — a real input of its own. */
  hasSchedules = false,
): boolean {
  if (
    hasSchedules ||
    form.change_type?.trim() ||
    form.reasons?.trim() ||
    form.approved_by?.trim() ||
    form.received_by?.trim() ||
    form.processed_by?.trim() ||
    form.approved_via_viber ||
    form.attachment_approved ||
    hasAttachment
  ) {
    return false;
  }
  const norm = (v: string | null | undefined) => (v ?? "").trim();
  const p = profile ?? { emp_no: "", full_name: "", designation: "", area: "", signature: "" };
  const signature = norm(form.employee_signature);
  const signatureIsAutoFill = signature === "" || signature === norm(p.signature);
  return (
    signatureIsAutoFill &&
    norm(form.id_number) === norm(p.emp_no) &&
    norm(form.employee_name) === norm(p.full_name) &&
    norm(form.plant_location) === norm(p.area) &&
    norm(form.position) === norm(p.designation)
  );
}
