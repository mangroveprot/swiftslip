import type { EmployeeProfile } from "@/shared/types";

/**
 * Shared pieces for building a new form in the browser instead of on the server.
 *
 * The four form screens (Overtime, Official Business, Leave of Absence, Change of
 * Schedule) all auto-fill the same identity fields from the profile and default
 * Date Filed to the user's local today, so that one block is written once here.
 * Each feature's `lib/draft-form.ts` maps it onto its own form type.
 *
 * These values must match what the corresponding `create*Form` server call writes.
 * That is what makes a draft's starting snapshot a fair baseline: comparing
 * against it tells the editor whether the user has entered anything themselves,
 * as opposed to simply accepting what was filled in for them.
 */

/** Stand-in while the profile is still loading, so a draft can be built for it. */
export const EMPTY_PROFILE: EmployeeProfile = {
  emp_no: "",
  full_name: "",
  designation: "",
  area: "",
  signature: "",
};

/** `YYYY-MM-DD` for the user's local day. */
export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** The identity auto-fill, in the shape every form screen uses. */
export function draftIdentity(profile: EmployeeProfile): {
  id_number: string;
  employee_name: string;
  department: string;
  position: string;
  employee_signature: string;
  date_filed: string;
} {
  return {
    id_number: profile.emp_no,
    employee_name: profile.full_name,
    department: profile.area,
    position: profile.designation,
    employee_signature: profile.signature,
    date_filed: localToday(),
  };
}
