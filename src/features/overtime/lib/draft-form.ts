import { draftIdentity, EMPTY_PROFILE } from "@/lib/form-draft";
import type { OtForm } from "@/shared/types";

/**
 * The form a fresh draft starts from, built in the browser instead of by the
 * server. Mirrors `createOtForm` exactly, so the starting snapshot doubles as the
 * baseline the editor compares against to spot real user input.
 */
export function buildDraftOtForm(profile = EMPTY_PROFILE): OtForm {
  return {
    ...draftIdentity(profile),
    reasons: "",
    approved_by: "",
    received_by: "",
    processed_by: "",
    approved_via_viber: false,
    attachment_approved: false,
  };
}
