export type PresetPeriod = "first_half" | "second_half" | "full";
export type Period = PresetPeriod | `custom:${number}-${number}`;
export type Role = "admin" | "user";

export type SessionUser = { role: Role; label: string };

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
