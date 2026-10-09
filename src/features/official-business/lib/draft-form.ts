import { draftIdentity, EMPTY_PROFILE } from "@/lib/form-draft";
import type { ObForm } from "@/shared/types";

/**
 * The form a fresh draft starts from, built in the browser instead of by the
 * server. Mirrors `createObForm` exactly, so the starting snapshot doubles as the
 * baseline the editor compares against to spot real user input.
 */
export function buildDraftObForm(profile = EMPTY_PROFILE): ObForm {
  return {
    ...draftIdentity(profile),
    date_of_ob: "",
    approved_by: "",
    approved_via_viber: false,
    attachment_approved: false,
  };
}
