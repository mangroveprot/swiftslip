export type PresetPeriod = "first_half" | "second_half" | "full";
export type Period = PresetPeriod | `custom:${number}-${number}` | `span:${number}-${number}`;
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
/** One stored supporting document: its bucket path plus the original name. */
export type OtherFile = {
  path: string;
  name: string;
};

/** Kept for the LOA card, which had this name first. Same shape. */
export type LoaOtherFile = OtherFile;

/** Change of Schedule (COS) form — mirrors public/cos_template.docx. */
export type CosForm = {
  id_number: string;
  employee_name: string;
  /** The template's "Plant/Location" box. */
  plant_location: string;
  position: string;
  /** Free-text / date string as typed (e.g. "2026-10-06"). */
  date_filed: string;
  /** "" | "shift" | "rest_day" — the two boxes under "Change of Work Schedule". */
  change_type: string;
  /** Data URL (PNG) of the employee signature drawing or upload. */
  employee_signature: string;
  /** The REASON/S FOR CHANGE OF SCHEDULE body. */
  reasons: string;
  approved_by: string;
  received_by: string;
  processed_by: string;
  /** When true, show the "Approved via Viber" note under the approver. */
  approved_via_viber: boolean;
  /** The uploaded approval slip has been approved. */
  attachment_approved: boolean;
};

/** One schedule line on a Change of Schedule form (its own row, like ObEntry). */
export type CosSchedule = {
  /** Row order, 0-based. */
  idx: number;
  /** Effectivity date, YYYY-MM-DD as typed. */
  effectivity_date: string;
  /** The SCHEDULE → FROM line: the date it changes from, and that shift's hours. */
  from_date: string;
  /** Shift start, "HH:MM" from a time input ("" when not set). */
  from_start: string;
  /** Shift end, "HH:MM" ("" when not set). */
  from_end: string;
  /** The SCHEDULE → TO line: the date it changes to, and that shift's hours. */
  to_date: string;
  to_start: string;
  to_end: string;
};

/** One OT line on an Overtime form — the template repeats its value row. */
export type OtEntry = {
  /** Row order, 0-based. */
  idx: number;
  /** The date the overtime was worked, YYYY-MM-DD. */
  date_of_ot: string;
  /** The regular shift that day, "HH:MM" from the time inputs. */
  regular_from: string;
  regular_to: string;
  /** The hours actually worked, "HH:MM". */
  actual_from: string;
  actual_to: string;
  /** Typed by the employee — the sheet asks for it, it is not derived. */
  total_hours: string;
  /** The "For HR use only" column. */
  validation: string;
};

/** Overtime (OT) form — mirrors public/ot_template.docx. */
export type OtForm = {
  id_number: string;
  employee_name: string;
  /** The template's "Department/Location" box. */
  department: string;
  position: string;
  /** Date & Time Filed, free text as typed. */
  date_filed: string;
  /** Data URL (PNG) of the employee signature drawing or upload. */
  employee_signature: string;
  /** The REASON FOR OVERTIME body. */
  reasons: string;
  approved_by: string;
  received_by: string;
  processed_by: string;
  /** When true, show the "Approved via Viber" note under the approver. */
  approved_via_viber: boolean;
  /** The uploaded approval slip has been approved. */
  attachment_approved: boolean;
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
