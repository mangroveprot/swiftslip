import type { Employer } from "./org";

export type PresetPeriod = "first_half" | "second_half" | "full";
export type Period = PresetPeriod | `custom:${number}-${number}` | `span:${number}-${number}`;
export type Role = "admin" | "user";

export type SessionUser = { id: string; role: Role; label: string; idNumber: string };

/**
 * A person's profile photo by account id, what `GET /api/users/photos`
 * answers with. Only people who actually set one are returned, so a missing id
 * means "no photo, draw initials" rather than an error.
 */
export type AccountPhoto = { id: string; photo: string };

/**
 * The applications behind the "Where would you like to go?" chooser.
 *
 * `swiftslip`, `inventory`, `showroom-updates`, `ticketing` and `hr` are
 * GRANTABLE. `admin` is deliberately excluded: the Admin Panel is gated on
 * `role === "admin"` alone, and admins also bypass every access rule, so an
 * `admin` rule could never take effect. Keeping it out of `GRANTABLE_APP_KEYS`
 * means the admin UI can't offer it.
 */
export const APP_KEYS = [
  "admin",
  "swiftslip",
  "inventory",
  "showroom-updates",
  "ticketing",
  "hr",
] as const;
export type AppKey = (typeof APP_KEYS)[number];

export const GRANTABLE_APP_KEYS = [
  "swiftslip",
  "inventory",
  "showroom-updates",
  "ticketing",
  "hr",
] as const;
export type GrantableAppKey = (typeof GRANTABLE_APP_KEYS)[number];

/** Apps this app hosts itself, each with a route and a server guard. */
export type InternalAppKey = Exclude<AppKey, ExternalAppKey>;

/** Where each internal app opens. Used to skip the chooser when one is granted. */
export const APP_HOME = {
  admin: "/admin",
  swiftslip: "/records",
  inventory: "/rgc-asset-inventory",
  "showroom-updates": "/showroom-updates",
  hr: "/hr",
} as const satisfies Record<InternalAppKey, string>;

/**
 * An app that lives on another host. It has no route and no server guard here,
 * so its access rule can only decide whether the chooser offers the card.
 *
 * The URL and logo are absolute by necessity - the browser loads them, not this
 * app's router, and the card opens them in a new tab.
 */
export const EXTERNAL_APPS = {
  ticketing: {
    label: "Regasco Ticketing System",
    url: "https://ticketing.regasco.ph:2424/regasco-ticketing-system",
    logo: "https://ticketing.regasco.ph:2424/regasco-ticketing-system/assets/logo.png",
    description:
      "Raise and track IT support tickets. Opens in a new browser tab, so this page stays where it is.",
  },
} as const;

export type ExternalAppKey = keyof typeof EXTERNAL_APPS;

/** True for an app served by another host, so callers skip routing to it. */
export function isExternalApp(app: AppKey): app is ExternalAppKey {
  return app in EXTERNAL_APPS;
}

/** How a rule is targeted. Most specific is checked first. */
export const RULE_SCOPES = ["user", "department", "position"] as const;
export type RuleScope = (typeof RULE_SCOPES)[number];

/**
 * How a photo is framed inside its circle.
 *
 * A cropped still is baked into its 256 × 256 export, so it is always the
 * identity. An animated GIF is stored exactly as uploaded — cropping it would
 * keep one frame and freeze it — so its framing travels in these three numbers
 * and is applied with CSS wherever the face is drawn.
 *
 * `x` / `y` are the centre of the visible window as a fraction of the circle's
 * diameter, so the same crop reads identically at 96 px in the profile card,
 * 36 px in the sidebar and 20 px in an activity row.
 */
export type PhotoCrop = {
  /** 1 fills the circle; 3 is the cropper's limit. */
  zoom: number;
  /** Visible window centre, fraction of the diameter; 0 is the middle. */
  x: number;
  y: number;
};

export type EmployeeProfile = {
  emp_no: string;
  full_name: string;
  /** The job title (e.g. "IT Support"), stored on `profiles.designation`. */
  designation: string;
  /** The office / branch the employee works at, `profiles.area`. */
  area: string;
  /**
   * The department the position belongs to (e.g. "Information Technology"),
   * `profiles.department`. Auto-derived from the position when picked from the
   * fixed list, editable on its own so an off-list position can still name one.
   */
  department: string;
  /** The company the employee works for, `profiles.employer` (0 = Regasco, 1 = Mindbridge). */
  employer: Employer;
  /** Data URL (PNG) of the saved signature, auto-filled into new forms. */
  signature: string;
  /**
   * The profile photo, as a URL the browser can load, a short-lived signed
   * link into object storage (`ProfilePhoto/<id>.<ext>` in the private
   * `swiftslip` bucket), minted on every read because links expire. The column
   * itself stores the object path, never this string.
   *
   * Empty means "no photo": the UI falls back to initials. Rows written before
   * the move to storage still hold an inline data URL, which is passed through
   * unchanged so no one's face disappears.
   */
  photo: string;
  /**
   * How `photo` is framed inside its circle. The identity (1, 0, 0) for every
   * still and for every photo saved before GIFs; a GIF keeps its animation and
   * carries its framing here instead of inside the file.
   */
  photo_crop: PhotoCrop;
  /**
   * Supervisor / Department Head, auto-filled into a new form's approver field
   * (`certified_by` on a DTR record, `approved_by` on the OB / LOA / COS / OT
   * forms). Forms keep their own editable copy; this is only the auto-fill source.
   */
  supervisor: string;
};

/**
 * One person as the hover card in the admin lists shows them,
 * `GET /api/users/:id/card`.
 *
 * Deliberately smaller than `EmployeeProfile`: no signature, no full row, only
 * the five lines the card prints plus the face. The wording follows the profile
 * form: `designation` is the office / branch (`profiles.area`), while
 * `position` is the job title (`profiles.designation`).
 */
export type ProfileCard = {
  /** The account id, what the list already holds for its avatar. */
  id: string;
  /** The sign-in ID, also the employee number, `users.id_number`. */
  employee_id: string;
  role: Role;
  full_name: string;
  /** Job title, `profiles.designation` ("HR Associate"). */
  position: string;
  /** The department the position belongs to, `profiles.department`. */
  department: string;
  /** Office / branch, `profiles.area` (the card's "Designation" line). */
  designation: string;
  /** The company the person works for, `profiles.employer` (0 = Regasco, 1 = Mindbridge). */
  employer: Employer;
  /**
   * The photo as a signed URL; "" when the person has none. The card draws
   * initials in that case, exactly like every other avatar.
   */
  photo: string;
  /** Framing for a GIF; the identity fills the circle for a still. */
  photo_crop: PhotoCrop;
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
  /** The template's "Department / Location" box, department, then office. */
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

/** Leave of Absence (LOA) form, mirrors public/loa_form_template.docx. */
export type LoaForm = {
  id_number: string;
  employee_name: string;
  /** The template's "Department/Location" box, department, then office. */
  department: string;
  position: string;
  /** Free-text / date string as typed (e.g. "2026-09-26"). */
  date_filed: string;
  /** Inclusive dates, YYYY-MM-DD as typed ("" while unset). */
  date_from: string;
  date_to: string;
  /** Free text, prefilled by the From/To calculation, may hold "4 hours". */
  days_applied: string;
  /** One of the template's boxes, e.g. "Sick Leave"; "" while unset. */
  leave_type: string;
  /** The text on the "Others: ____" line when leave_type is "Others". */
  leave_type_other: string;
  /** "" | "with_pay" | "without_pay", the ( ) w/ PAY boxes. */
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

/** Statement of Liquidation (LIQ) header, mirrors the GN 238 sheet. */
export type LiqForm = {
  /** DEPARTMENT box. */
  department: string;
  /** SECTION/LOCATION box. */
  section_location: string;
  /** COST CENTER TO BE CHARGED box (static blank for now). */
  cost_center: string;
  /** DATE PREPARED box, as typed. */
  date_prepared: string;
  /** TRIP TO box. */
  trip_to: string;
  /** PURPOSE box. */
  purpose: string;
  /** "PESOS" | "DOLLARS", the two currency boxes. */
  currency: string;
  /** The name printed under PREPARED BY. */
  prepared_by: string;
  /** The name printed under APPROVED BY. */
  approved_by: string;
  /** Data URL (PNG) of the saved signature, printed above PREPARED BY. */
  employee_signature: string;
  /** The uploaded approval slip has been approved (the "Approved via Viber" note). */
  attachment_approved: boolean;
  /** When true, show the "Approved via Viber" note under the approver. */
  approved_via_viber: boolean;
};

/** One expense line on a Statement of Liquidation. Amounts are typed text. */
export type LiqExpense = {
  idx: number;
  expense_date: string;
  description: string;
  transpo: string;
  fuel_gas: string;
  meals: string;
  office_supplies: string;
  load_accommodation: string;
  entertainment_gifts: string;
  other_expenses: string;
};

/**
 * The two object stores a file can physically live on.
 *
 * It lives here rather than in `schemas.ts` because `OtherFile` needs it and
 * `schemas.ts` imports this file, a type must never depend on its importer.
 * `schemas.ts` re-exports it, so every existing `@swiftslip/shared/schemas`
 * import keeps working.
 */
export const STORAGE_BACKENDS = ["supabase", "b2"] as const;
export type StorageBackend = (typeof STORAGE_BACKENDS)[number];

/** One additional supporting file on an LOA form: its path in storage + name. */
/** One stored supporting document: its bucket path plus the original name. */
export type OtherFile = {
  path: string;
  name: string;
  /**
   * Which backend holds the file. Absent means 'supabase', every file stored
   * before migration 0031 lives in Supabase Storage.
   */
  backend?: StorageBackend;
};

/** Kept for the LOA card, which had this name first. Same shape. */
export type LoaOtherFile = OtherFile;

/** Change of Schedule (COS) form, mirrors public/cos_template.docx. */
export type CosForm = {
  id_number: string;
  employee_name: string;
  /** The template's "Plant/Location" box. */
  plant_location: string;
  position: string;
  /** Free-text / date string as typed (e.g. "2026-10-06"). */
  date_filed: string;
  /** "" | "shift" | "rest_day", the two boxes under "Change of Work Schedule". */
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

/** One OT line on an Overtime form, the template repeats its value row. */
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
  /** Typed by the employee, the sheet asks for it, it is not derived. */
  total_hours: string;
  /** The "For HR use only" column. */
  validation: string;
};

/** Overtime (OT) form, mirrors public/ot_template.docx. */
export type OtForm = {
  id_number: string;
  employee_name: string;
  /** The template's "Department/Location" box, department, then office. */
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
