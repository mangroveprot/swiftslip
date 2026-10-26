import type { DtrTemplate } from "./types";

/**
 * The DTR's form wording.
 *
 * This used to live in the `dtr_template` table (a single row, id = 1) and was
 * editable from Settings → DTR template. That screen and the table are gone, so
 * the values are fixed in code now — the DTR form, its live preview and its Word
 * export all read this one object.
 *
 * These are the defaults the table shipped with (see
 * drizzle/migrations/0002_create_dtr_schema.sql). To change any wording, edit
 * it here.
 */
export const DTR_TEMPLATE: DtrTemplate = {
  title: "DAILY TIME RECORD",
  org_name: "",
  employee_signature_label: "Employee's Signature Over Printed Name",
  certified_by_label: "Certified by:",
  certifier_signature_label: "Signature Over Printed Name / Position",
  default_schedule: "8:00 AM - 5:00 PM",
  default_period: "first_half",
  columns: { in: "IN", out: "OUT", schedule: "Working Schedule", remarks: "REMARKS" },
};
