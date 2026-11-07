/**
 * Response shapes of the API (`document` / `documents` in the wire envelope),
 * for the pieces that are not already plain domain types in `types.ts`.
 * The web client uses these to type its fetch wrappers.
 */
import type { FormEvent } from "./forms";
import type { ObHrFields, ObHrStatus, ObResubmitEvent } from "./hr";
import type {
  AppKey,
  CosForm,
  CosSchedule,
  DtrEntry,
  DtrHeader,
  GrantableAppKey,
  LoaForm,
  ObEntry,
  ObForm,
  OtEntry,
  OtForm,
  OtherFile,
  Role,
  RuleScope,
  SessionUser,
} from "./types";

export type SessionDocument = SessionUser & { apps: AppKey[] };

/** What one (row, app) pair actually resolves to. */
export type AccessOutcome = {
  /** An administrator holds every app and cannot be restricted. */
  admin: boolean;
  allowed: boolean;
  /** True when a rule decided it; false when it fell through to the default. */
  byRule: boolean;
  /** Which scope produced the answer, for the admin UI to explain itself. */
  byScope: RuleScope | null;
  /** The rule that produced this answer, so a caller can undo exactly it. */
  ruleId: string | null;
};

export type OverviewPerson = {
  id: string;
  idNumber: string;
  name: string;
  department: string;
  position: string;
  isAdmin: boolean;
  apps: AccessOutcome[];
};

export type OverviewRule = {
  id: string;
  app_key: GrantableAppKey;
  scope: RuleScope;
  scope_value: string;
  allow: boolean;
};

export type AccessOverview = {
  people: OverviewPerson[];
  rules: OverviewRule[];
  defaults: Record<GrantableAppKey, boolean>;
  departments: string[];
  positions: string[];
};

/** One row in user management: the account joined with its profile. */
export type AccountListItem = {
  id: string;
  id_number: string;
  role: Role;
  created_at: string;
  full_name: string;
  /** The office / branch — `profiles.area`. */
  designation: string;
  department: string;
  /** The job title — `profiles.designation`. */
  position: string;
};

export type OrgLists = {
  designations: string[];
  departments: string[];
  positions: { value: string; department: string }[];
};

export type SecuritySummary = {
  signinsToday: number;
  failedToday: number;
  ipCounts: { ip: string | null; count: number }[];
  newIpKeys: { actorNumber: string; ip: string }[];
  actors: string[];
  latest: {
    actor_name: string | null;
    actor_number: string | null;
    ip: string | null;
    created_at: string;
  } | null;
};

export type AdminStats = {
  accounts: number;
  administrators: number;
  records: number;
  forms: number;
  incompleteProfiles: number;
  formEvents: FormEvent[];
  security: SecuritySummary;
};

export type ActivityLogRow = {
  action: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_number: string | null;
  created_at: string;
  detail: string | null;
  id: string;
  ip: string | null;
  target: string | null;
};

export type ActivityLogCounts = {
  access: number;
  accounts: number;
  records: number;
  signin: number;
  "signin-failed": number;
  all: number;
};

// ── Form lists (own rows, newest first) ──────────────────────────────────────
//
// `deletes_in_days` is set only when a retention cleanup would take this form
// within the next week — or already would, on the next run (0 or less). It is
// absent when cleanup is off, this type is not ticked, or the form is kept:
// still a draft, or waiting for its approval slip. It is a warning, never a
// promise — nothing is deleted until an admin previews and runs a cleanup.

export type RecordSummary = {
  id: string;
  name: string;
  emp_no: string;
  designation: string;
  area: string;
  month: number;
  year: number;
  period: string;
  attachment_path: string | null;
  updated_at: string;
  deletes_in_days?: number;
};

export type ObSummary = {
  destinations: string[];
  id: string;
  employee_name: string;
  id_number: string;
  department: string;
  position: string;
  date_of_ob: string;
  attachment_approved: boolean;
  /** The HR approval state (shared `ObHrStatus`) — the status badge. */
  hr_status: ObHrStatus;
  updated_at: string;
  deletes_in_days?: number;
  /** How often the form has gone back to HR (0 = first time through). */
  resubmit_count?: number;
  /** The trips back to HR, oldest first — the queue caption reads the latest. */
  resubmit_history?: ObResubmitEvent[];
  /** The employee's profile picture, signed for this response; null when none. */
  employee_photo?: string | null;
};

/**
 * One row of the HR review queue — an `ObSummary` plus the supervisor signal
 * the queue card shows next to the status chip.
 */
export type HrObSummary = ObSummary & {
  /** `approved_by` as typed (empty while the supervisor has not signed). */
  approved_by: string;
};

/** One notification row as `GET /api/notifications` returns it. */
export type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  /** Relative link inside this app (`/hr/ob/<id>` or `/official-business/<id>`). */
  link: string;
  read_at: string | null;
  created_at: string;
  /** The actor's display name, or null for a system event. */
  actor_name: string | null;
  /** The actor's job title (`profiles.designation`), when their profile has one. */
  actor_position?: string | null;
  /** The actor's profile picture, signed for this response; null when none. */
  actor_photo?: string | null;
};

export type LoaSummary = {
  id: string;
  employee_name: string;
  id_number: string;
  department: string;
  position: string;
  date_from: string;
  date_to: string;
  attachment_approved: boolean;
  updated_at: string;
  deletes_in_days?: number;
};

export type CosSummary = {
  id: string;
  employee_name: string;
  id_number: string;
  plant_location: string;
  position: string;
  change_type: string;
  attachment_approved: boolean;
  updated_at: string;
  deletes_in_days?: number;
};

export type OtSummary = {
  id: string;
  employee_name: string;
  id_number: string;
  department: string;
  position: string;
  date_filed: string;
  attachment_approved: boolean;
  updated_at: string;
  deletes_in_days?: number;
};

// ── Form details ─────────────────────────────────────────────────────────────

type Attached = { attachment?: { name: string } };

/**
 * A person who signed an OB form, already resolved from the stored account id
 * so the printed sheet can show the same name + e-signature as the paper form.
 */
export type ObSigner = {
  name: string;
  /** Data URL of the saved signature; "" when none is on file. */
  signature: string;
  /**
   * The signer's designation from their profile (e.g. "HR ASSOCIATE") — the
   * line the paper form prints under the name in the "Verified by: HRD" box.
   * "" when the profile has none.
   */
  position: string;
  /** Profile picture as a signed URL; "" when the signer has none. */
  photo?: string;
};

/** Who signed each part of an OB form. A key is absent until that signature exists. */
export type ObSigners = {
  /** `hr_approved_by` — the "Verified by: HRD" box. */
  approved?: ObSigner;
  /** `hr_rejected_by` — the HR reviewer who bounced the form back. */
  rejected?: ObSigner;
  /** `departure_signed_by` — the exit-clearance departure row. */
  departure?: ObSigner;
  /** `arrival_signed_by` — the exit-clearance arrival row. */
  arrival?: ObSigner;
};

export type RecordDetail = Attached & {
  record: DtrHeader & { id: string };
  entries: DtrEntry[];
  others: OtherFile[];
};
export type ObDetail = Attached & {
  form: ObForm & ObHrFields & { id: string };
  entries: ObEntry[];
  /** Names + positions + saved signatures for the boxes HR fills (see `ObSigners`). */
  signers?: ObSigners;
};

/**
 * The employee behind an OB form, resolved from their profile when HR opens
 * the detail: the face, the org facts the sheet has no box for (office,
 * supervisor) and their latest forms — so a reviewer sees who they are
 * reviewing instead of four denormalised cells.
 */
export type ObEmployeeProfile = {
  /** Profile picture as a signed URL; "" when the person has none. */
  photo: string;
  full_name: string;
  emp_no: string;
  department: string;
  /** Job title — `profiles.designation`. */
  position: string;
  /** Office / branch — `profiles.area`. */
  area: string;
  supervisor: string;
  /** Their newest OB forms (max 5), newest first — the form's own history. */
  recent: {
    id: string;
    date_of_ob: string;
    hr_status: ObHrStatus;
    updated_at: string;
  }[];
};

/**
 * `GET /api/hr/ob/:id` — the same detail an HR reviewer opens from the queue.
 * `employee` is null when the form has no owner profile to resolve.
 */
export type HrObDetail = ObDetail & {
  employee?: ObEmployeeProfile | null;
};
export type LoaDetail = Attached & { form: LoaForm & { id: string }; others: OtherFile[] };
export type CosDetail = Attached & { form: CosForm & { id: string }; schedules: CosSchedule[] };
export type OtDetail = Attached & {
  form: OtForm & { id: string };
  entries: OtEntry[];
  others: OtherFile[];
};

export type AttachmentLink = { url: string; name: string };

// ── Optional B2 file store (`/files`) ────────────────────────────────────────

/** `POST /files` — the key to keep, plus the readable original name. */
export type StoredFile = { key: string; name: string };

/** `GET /files/url?key=` — a short-lived presigned download link. */
export type FileLink = { url: string; name: string; mimeType: string };
