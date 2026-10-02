import type { DtrEntry, DtrHeader, EmployeeProfile } from "@/shared/types";

/**
 * A record the user hasn't actually filled in. New records are created with the
 * profile auto-filled into the identity fields (name / emp_no / designation /
 * area), so those fields only count as content when they differ from the profile.
 *
 * Used by the editor (to decide whether leaving discards the record) and by the
 * records list (to clean up auto-fills that were created and then abandoned).
 *
 * @param hasAttachment whether the record already has a file attached — the file
 * itself lives in storage, so the caller is the only place that knows.
 */
export function isScaffoldRecord(
  header: DtrHeader,
  entries: DtrEntry[],
  profile: EmployeeProfile | null,
  hasAttachment = false,
): boolean {
  if (
    entries.length > 0 ||
    header.employee_signature ||
    header.certified_by?.trim() ||
    hasAttachment
  ) {
    return false;
  }
  const norm = (v: string | null | undefined) => (v ?? "").trim();
  const p = profile ?? { emp_no: "", full_name: "", designation: "", area: "" };
  return (
    norm(header.name) === norm(p.full_name) &&
    norm(header.emp_no) === norm(p.emp_no) &&
    norm(header.designation) === norm(p.designation) &&
    norm(header.area) === norm(p.area)
  );
}
