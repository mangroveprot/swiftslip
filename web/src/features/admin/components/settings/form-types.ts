import type { RetentionFormType } from "@swiftslip/shared/schemas";

/** Display names for the five cleanup checkboxes, shared by the settings
 *  page and the confirm dialog so the two never disagree. Short on purpose:
 *  a by-type row carries a bar, a count and a status on the same line. */
export const FORM_TYPE_LABELS: Record<RetentionFormType, string> = {
  dtr: "Daily Time Record",
  ob: "Official Business",
  loa: "Leave of Absence",
  cos: "Change of Schedule",
  ot: "Overtime",
};
