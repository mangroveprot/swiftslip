/**
 * Response shapes of the API (`document` / `documents` in the wire envelope),
 * for the pieces that are not already plain domain types in `types.ts`.
 * The web client uses these to type its fetch wrappers.
 */
import type { FormEvent } from "./forms";
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
  updated_at: string;
  deletes_in_days?: number;
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

export type RecordDetail = Attached & {
  record: DtrHeader & { id: string };
  entries: DtrEntry[];
};
export type ObDetail = Attached & { form: ObForm & { id: string }; entries: ObEntry[] };
export type LoaDetail = Attached & { form: LoaForm & { id: string }; others: OtherFile[] };
export type CosDetail = Attached & { form: CosForm & { id: string }; schedules: CosSchedule[] };
export type OtDetail = Attached & {
  form: OtForm & { id: string };
  entries: OtEntry[];
  others: OtherFile[];
};

export type AttachmentLink = { url: string; name: string };
