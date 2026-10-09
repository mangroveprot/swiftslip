import { EMPTY_PROFILE, localToday } from "@/lib/form-draft";
import type { CosForm } from "@/shared/types";

/**
 * The form a fresh draft starts from, built in the browser instead of by the
 * server. Mirrors `createCosForm` exactly, so the starting snapshot doubles as the
 * baseline the editor compares against to spot real user input.
 *
 * Change of Schedule names its location field `plant_location` rather than
 * `department`, which is why it does not use the shared `draftIdentity` block.
 */
export function buildDraftCosForm(profile = EMPTY_PROFILE): CosForm {
  return {
    id_number: profile.emp_no,
    employee_name: profile.full_name,
    plant_location: profile.area,
    position: profile.designation,
    employee_signature: profile.signature,
    date_filed: localToday(),
    change_type: "",
    reasons: "",
    approved_by: "",
    received_by: "",
    processed_by: "",
    approved_via_viber: false,
    attachment_approved: false,
  };
}
