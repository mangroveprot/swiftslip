import type { EmployeeProfile, ObEntry, ObForm } from "@/shared/types";

/**
 * A form the user hasn't actually filled in. Identity fields (id number, name,
 * department, position) and Date Filed are auto-prefilled from the profile / today
 * when the form is created, so they only count as content when they differ from
 * that auto-fill — otherwise a brand-new form would look "used" the moment it's
 * created and never get discarded on exit. Any real input (itinerary rows,
 * signature, approver, date of OB, or an edited identity field) marks the form as
 * worth keeping, even if the user later clears it again. Date Filed is excluded
 * here on purpose: edits to it are caught by the net-change check on leave.
 *
 * Used by the editor (to decide whether leaving discards the form) and by the
 * forms list (to clean up auto-fills that were created and then abandoned).
 */
export function isScaffoldForm(
  form: ObForm,
  rows: ObEntry[],
  profile: EmployeeProfile | null,
): boolean {
  if (
    rows.length > 0 ||
    form.employee_signature ||
    form.approved_by?.trim() ||
    form.date_of_ob?.trim() ||
    form.approved_via_viber
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
