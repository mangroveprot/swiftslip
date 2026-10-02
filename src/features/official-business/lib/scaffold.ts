import type { EmployeeProfile, ObEntry, ObForm } from "@/shared/types";

/**
 * A form the user hasn't actually filled in. Identity fields (id number, name,
 * department, position) and Date Filed are auto-prefilled from the profile / today
 * when the form is created, so they only count as content when they differ from
 * that auto-fill — otherwise a brand-new form would look "used" the moment it's
 * created and never get discarded on exit. Any real input (itinerary rows,
 * signature, approver, date of OB, an edited identity field, or an approval-slip
 * attachment) marks the form as worth keeping, even if the user later clears it
 * again. Date Filed is excluded here on purpose: edits to it are caught by the
 * net-change check on leave.
 *
 * @param hasAttachment whether the form already has a file attached — the file
 * itself lives in storage, so the caller is the only place that knows.
 */
export function isScaffoldForm(
  form: ObForm,
  rows: ObEntry[],
  profile: EmployeeProfile | null,
  hasAttachment = false,
): boolean {
  if (
    rows.length > 0 ||
    form.employee_signature ||
    form.approved_by?.trim() ||
    form.date_of_ob?.trim() ||
    form.approved_via_viber ||
    form.attachment_approved ||
    hasAttachment
  ) {
    return false;
  }
  const norm = (v: string | null | undefined) => (v ?? "").trim();
  const p = profile ?? { emp_no: "", full_name: "", designation: "", area: "" };
  return (
    norm(form.id_number) === norm(p.emp_no) &&
    norm(form.employee_name) === norm(p.full_name) &&
    norm(form.department) === norm(p.area) &&
    norm(form.position) === norm(p.designation)
  );
}
