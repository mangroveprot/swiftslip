import { DTR_TEMPLATE } from "@/shared/dtr-template";
import type { DtrHeader, EmployeeProfile } from "@/shared/types";

/**
 * The record a fresh draft starts from, built in the browser instead of by the
 * server.
 *
 * This mirrors exactly what `createRecord` writes when it runs for real, which
 * matters for two reasons: the form the user sees before anything is saved is
 * identical to the one they would have got from the old create-then-open flow,
 * and the resulting snapshot is the baseline the editor compares against to
 * decide whether the user has entered anything of their own.
 */
/** Stand-in while the profile is still loading, so a draft can be built for it. */
export const EMPTY_PROFILE: EmployeeProfile = {
  emp_no: "",
  full_name: "",
  designation: "",
  area: "",
  signature: "",
};

export function buildDraftRecordHeader(profile: EmployeeProfile): DtrHeader {
  const today = new Date();
  return {
    emp_no: profile.emp_no,
    name: profile.full_name,
    designation: profile.designation,
    area: profile.area,
    month: today.getMonth() + 1,
    year: today.getFullYear(),
    period: DTR_TEMPLATE.default_period,
    certified_by: "",
    employee_signature: profile.signature,
  };
}
