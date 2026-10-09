import { draftIdentity, EMPTY_PROFILE } from "@/lib/form-draft";
import type { LoaForm } from "@/shared/types";

/**
 * The form a fresh draft starts from, built in the browser instead of by the
 * server. Mirrors `createLoaForm` exactly, so the starting snapshot doubles as the
 * baseline the editor compares against to spot real user input.
 *
 * `days_applied` starts empty on purpose: it is a computed prefill that only ever
 * appears together with the dates that produced it, and leaving it blank keeps the
 * baseline identical to what the server writes.
 */
export function buildDraftLoaForm(profile = EMPTY_PROFILE): LoaForm {
  return {
    ...draftIdentity(profile),
    date_from: "",
    date_to: "",
    days_applied: "",
    leave_type: "",
    leave_type_other: "",
    pay_status: "",
    reasons: "",
    report_back_date: "",
    approved_by: "",
    approved_via_viber: false,
    attachment_approved: false,
  };
}
