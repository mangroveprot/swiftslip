export type PresetPeriod = "first_half" | "second_half" | "full";
export type Period = PresetPeriod | `custom:${number}-${number}`;
export type Role = "admin" | "user";

export type SessionUser = { id: string; role: Role; label: string; idNumber: string };

export type EmployeeProfile = {
  emp_no: string;
  full_name: string;
  designation: string;
  area: string;
  /** Data URL (PNG) of the saved signature — auto-filled into new forms. */
  signature: string;
};

export type DtrEntry = {
  day: number;
  time_in: string;
  time_out: string;
  schedule: string;
  remarks: string;
};

export type DtrHeader = {
  emp_no: string;
  name: string;
  designation: string;
  area: string;
  month: number;
  year: number;
  period: Period;
  certified_by: string;
  /** Data URL (PNG) of the employee signature drawing or upload. */
  employee_signature: string;
};

export type DtrTemplate = {
  title: string;
  org_name: string;
  employee_signature_label: string;
  certified_by_label: string;
  certifier_signature_label: string;
  default_schedule: string;
  default_period: Period;
  columns: { in: string; out: string; schedule: string; remarks: string };
};

/** Official Business form header (one leave-premises pass). */
export type ObForm = {
  id_number: string;
  employee_name: string;
  department: string;
  position: string;
  /** Free-text / date string as typed (e.g. "2026-09-26"). */
  date_filed: string;
  date_of_ob: string;
  /** Supervisor / Department Head / Manager who approves. */
  approved_by: string;
  /** When true, show the "Approved via Viber" note under the approver. */
  approved_via_viber: boolean;
  /** Data URL (PNG) of the employee signature drawing or upload. */
  employee_signature: string;
  /** The uploaded approval-slip attachment has been approved. */
  attachment_approved: boolean;
};

/** One itinerary line on an Official Business form. */
export type ObEntry = {
  /** Row order, 0-based. */
  idx: number;
  from_place: string;
  to_place: string;
  purpose: string;
  time_departure: string;
  time_return: string;
};

/** Leave of Absence (LOA) form — mirrors public/loa_form_template.docx. */
export type LoaForm = {
  id_number: string;
  employee_name: string;
  department: string;
  position: string;
  /** Free-text / date string as typed (e.g. "2026-09-26"). */
  date_filed: string;
  /** Inclusive dates, YYYY-MM-DD as typed ("" while unset). */
  date_from: string;
  date_to: string;
  /** Free text, prefilled by the From/To calculation — may hold "4 hours". */
  days_applied: string;
  /** One of the template's boxes, e.g. "Sick Leave"; "" while unset. */
  leave_type: string;
  /** The text on the "Others: ____" line when leave_type is "Others". */
  leave_type_other: string;
  /** "" | "with_pay" | "without_pay" — the ( ) w/ PAY boxes. */
  pay_status: string;
  /** The REASONS / REMARKS body. */
  reasons: string;
  /** "To report back for work on" date, YYYY-MM-DD. */
  report_back_date: string;
  /** Supervisor / Department Head / Manager who approves. */
  approved_by: string;
  /** When true, show the "Approved via Viber" note under the approver. */
  approved_via_viber: boolean;
  /** Data URL (PNG) of the employee signature drawing or upload. */
  employee_signature: string;
  /** The uploaded medical certificate has been approved. */
  attachment_approved: boolean;
};

/** One additional supporting file on an LOA form: its path in storage + name. */
export type LoaOtherFile = {
  path: string;
  name: string;
};

/** One parsed row from a biometric time log. */
export type ImportedLogEntry = {
  month: number;
  day: number;
  year: number;
  time_in: string;
  time_out: string;
};

export type ImportedLog = {
  emp_no: string;
  name: string;
  entries: ImportedLogEntry[];
};
