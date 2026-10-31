/**
 * Runtime validation for everything that crosses the client → server boundary.
 * Used by `src/api/*` as server-function input validators.
 */
import { z } from "zod";

import { isPeriod } from "./period";
import { GRANTABLE_APP_KEYS, RULE_SCOPES } from "./types";
import type {
  CosForm,
  CosSchedule,
  LoaForm,
  ObEntry,
  ObForm,
  OtEntry,
  OtForm,
  Period,
} from "./types";

/**
 * Largest base64 payload accepted over the wire: 10 MB of file bytes plus the
 * ~4/3 expansion of base64, with a little JSON headroom. The services still
 * enforce the real 10 MB limit after decoding; this bound stops an oversized
 * body from being buffered and decoded in the first place.
 */
export const MAX_UPLOAD_BASE64 = Math.ceil((10 * 1024 * 1024 * 4) / 3) + 64;

const period = z
  .string()
  .refine(isPeriod, "Invalid period")
  .transform((v) => v as Period);
const id = z.string().min(1);

export const roleSchema = z.enum(["admin", "user"]);

/**
 * Sign in with the unique ID number + password. The ID number identifies the
 * account (it must be unique across all accounts); the password proves it.
 */
export const signInInput = z.object({
  idNumber: z.string().trim().min(1, "Enter your ID number.").max(64),
  password: z.string().max(200),
});

export const idInput = z.object({ id });

/**
 * Deleting a row: `quiet` marks the app's own clean-up of untouched scaffold
 * forms, which stays out of the admin activity log.
 */
export const deleteRowInput = idInput.extend({ quiet: z.boolean().optional() });

/** `DELETE /<form>/:id?quiet=true` — the same flag, as a query string. */
export const deleteRowQuery = z.object({
  quiet: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((value) => value === "true" || value === "1"),
});

/** One page of the admin activity log (server-enforced page size). */
export const ACTIVITY_LOG_PAGE_SIZE = 25;

/** Which slice of the log a tab selects; the server expands it to actions. */
export const activityLogActionFilter = z.enum([
  "signin",
  "signin-failed",
  "access",
  "accounts",
  "records",
]);
export type ActivityLogActionFilter = z.infer<typeof activityLogActionFilter>;

/** Tab counts for a date range, independent of the current search/tab. */
export type ActivityLogCounts = Record<"all" | ActivityLogActionFilter, number>;

const activityTimestamp = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date");

export const activityLogRangeInput = z.object({
  from: activityTimestamp.optional(),
  to: activityTimestamp.optional(),
});

export const listActivityLogsInput = z.object({
  search: z.string().trim().max(100).default(""),
  action: activityLogActionFilter.optional(),
  from: activityTimestamp.optional(),
  to: activityTimestamp.optional(),
  page: z.number().int().min(1).default(1),
});

/** Dashboard side-panel feeds: security events or general activity, newest first. */
export const activityLogFeedInput = z.object({
  feed: z.enum(["security", "activity"]),
});
export type ActivityLogFeed = z.infer<typeof activityLogFeedInput>["feed"];

/** How many rows each dashboard feed shows. */
export const ACTIVITY_FEED_LIMIT = 20;

export const createRecordInput = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(1970).max(9999),
  period,
});

export const dtrEntrySchema = z.object({
  day: z.number().int().min(1).max(31),
  time_in: z.string(),
  time_out: z.string(),
  schedule: z.string(),
  remarks: z.string(),
});

export const dtrHeaderSchema = z.object({
  emp_no: z.string(),
  name: z.string(),
  designation: z.string(),
  area: z.string(),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(1970).max(9999),
  period,
  certified_by: z.string(),
  employee_signature: z.string().default(""),
});

export const saveRecordInput = z.object({
  id,
  header: dtrHeaderSchema,
  entries: z.array(dtrEntrySchema).max(31),
});

export const dtrTemplateSchema = z.object({
  title: z.string(),
  org_name: z.string(),
  employee_signature_label: z.string(),
  certified_by_label: z.string(),
  certifier_signature_label: z.string(),
  default_schedule: z.string(),
  default_period: period,
  columns: z.object({
    in: z.string(),
    out: z.string(),
    schedule: z.string(),
    remarks: z.string(),
  }),
});

export const createObFormInput = z.object({
  // Client passes its local "today" (YYYY-MM-DD) so Date Filed defaults correctly
  // for the user's timezone rather than the server's.
  date_filed: z.string().optional(),
});

export const obFormSchema = z.object({
  id_number: z.string(),
  employee_name: z.string(),
  department: z.string(),
  position: z.string(),
  date_filed: z.string(),
  date_of_ob: z.string(),
  approved_by: z.string(),
  approved_via_viber: z.boolean().default(false),
  employee_signature: z.string().default(""),
  /** The uploaded approval slip has been approved (also ticks "via Viber"). */
  attachment_approved: z.boolean().default(false),
});

export const obEntrySchema = z.object({
  idx: z.number().int().min(0).max(50),
  from_place: z.string(),
  to_place: z.string(),
  purpose: z.string(),
  time_departure: z.string(),
  time_return: z.string(),
});

export const saveObFormInput = z.object({
  id,
  form: obFormSchema,
  entries: z.array(obEntrySchema).max(50),
});

export const createLoaFormInput = z.object({
  // Client passes its local "today" (YYYY-MM-DD) so Date Filed defaults correctly
  // for the user's timezone rather than the server's.
  date_filed: z.string().optional(),
});

export const loaFormSchema = z.object({
  id_number: z.string(),
  employee_name: z.string(),
  department: z.string(),
  position: z.string(),
  date_filed: z.string(),
  date_from: z.string(),
  date_to: z.string(),
  days_applied: z.string(),
  leave_type: z.string(),
  leave_type_other: z.string(),
  pay_status: z.string(),
  reasons: z.string(),
  report_back_date: z.string(),
  approved_by: z.string(),
  approved_via_viber: z.boolean().default(false),
  employee_signature: z.string().default(""),
  /** The uploaded medical certificate has been approved (also ticks "via Viber"). */
  attachment_approved: z.boolean().default(false),
});

export const saveLoaFormInput = z.object({
  id,
  form: loaFormSchema,
});

export const createCosFormInput = z.object({
  // Client passes its local "today" (YYYY-MM-DD) so Date Filed defaults correctly
  // for the user's timezone rather than the server's.
  date_filed: z.string().optional(),
});

export const cosFormSchema = z.object({
  id_number: z.string(),
  employee_name: z.string(),
  plant_location: z.string(),
  position: z.string(),
  date_filed: z.string(),
  /** "" | "shift" | "rest_day" — the Change of Work Schedule boxes. */
  change_type: z.string(),
  employee_signature: z.string().default(""),
  reasons: z.string(),
  approved_by: z.string(),
  received_by: z.string(),
  processed_by: z.string(),
  approved_via_viber: z.boolean().default(false),
  /** The uploaded approval slip has been approved (also ticks "via Viber"). */
  attachment_approved: z.boolean().default(false),
});

export const cosScheduleSchema = z.object({
  idx: z.number().int().min(0).max(50),
  effectivity_date: z.string(),
  from_date: z.string(),
  // "HH:MM" from the time inputs, or "" when the line has no hours set.
  from_start: z.string(),
  from_end: z.string(),
  to_date: z.string(),
  to_start: z.string(),
  to_end: z.string(),
});

export const saveCosFormInput = z.object({
  id,
  form: cosFormSchema,
  /** One entry per schedule line — the child rows behind the form. */
  schedules: z.array(cosScheduleSchema).max(50),
});

// AI help for the COS "Reason/s for Change of Schedule" field (the OB Purpose twin).
export const cosReasonInput = z.object({
  mode: z.enum(["generate", "enhance"]),
  // For "generate": the user's rough context / instructions. For "enhance": ignored.
  context: z.string().max(2000).default(""),
  // The current Reason text (the thing to enhance, or extra context to generate from).
  current: z.string().max(4000).default(""),
});

// Conversational agent that fills the Change of Schedule form for the user.
export const cosChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().max(4000),
});

export const cosChatInput = z.object({
  // Transcript so far (oldest first). The assistant answers the last user turn.
  messages: z.array(cosChatMessageSchema).min(1).max(40),
  // The form exactly as it stands — the assistant patches it, never resets it.
  form: cosFormSchema,
  schedules: z.array(cosScheduleSchema).max(50),
  // The user's local date (YYYY-MM-DD) so "today" / "tomorrow" resolve correctly.
  today: z.string().max(40).optional(),
  // Optional photo/scan, handed to Gemini the same way the biometric import is.
  image: z
    .object({
      mimeType: z.string().min(1).max(100),
      base64: z.string().min(1).max(MAX_UPLOAD_BASE64),
    })
    .optional(),
});

/** The model's answer, validated before it is allowed to reach the client. */
export const cosChatReplySchema = z.object({
  reply: z.string().max(4000).default(""),
  // Only the fields the assistant decided to change.
  form: cosFormSchema.partial().optional(),
  // Full replacement schedule, only present when it changed.
  schedules: z.array(cosScheduleSchema).max(50).optional(),
});

export type CosChatInput = z.infer<typeof cosChatInput>;

/**
 * What the COS assistant is allowed to send back: a short message plus, when
 * needed, the form fields it changed and the full replacement schedule.
 * Declared by hand (rather than inferred) so the patch is a plain
 * `Partial<CosForm>`.
 */
export type CosChatReply = {
  reply: string;
  form?: Partial<CosForm>;
  schedules?: CosSchedule[];
};

export const createOtFormInput = z.object({
  // Client passes its local "today" (YYYY-MM-DD) so Date Filed defaults correctly
  // for the user's timezone rather than the server's.
  date_filed: z.string().optional(),
});

export const otEntrySchema = z.object({
  idx: z.number().int().min(0).max(50),
  date_of_ot: z.string(),
  // "HH:MM" from the time inputs, or "" when that side is not set.
  regular_from: z.string(),
  regular_to: z.string(),
  actual_from: z.string(),
  actual_to: z.string(),
  total_hours: z.string(),
  /** The "For HR use only" column. */
  validation: z.string(),
});

export const otFormSchema = z.object({
  id_number: z.string(),
  employee_name: z.string(),
  department: z.string(),
  position: z.string(),
  date_filed: z.string(),
  employee_signature: z.string().default(""),
  reasons: z.string(),
  approved_by: z.string(),
  received_by: z.string(),
  processed_by: z.string(),
  approved_via_viber: z.boolean().default(false),
  attachment_approved: z.boolean().default(false),
});

export const saveOtFormInput = z.object({
  id,
  form: otFormSchema,
  /** One entry per OT line — the child rows behind the form. */
  entries: z.array(otEntrySchema).max(50),
});

// AI help for the OT "Reason for Overtime" field (the OB Purpose / COS Reason twin).
export const otReasonInput = z.object({
  mode: z.enum(["generate", "enhance"]),
  context: z.string().max(2000).default(""),
  current: z.string().max(4000).default(""),
});

// Conversational agent that fills the Overtime form for the user.
export const otChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().max(4000),
});

export const otChatInput = z.object({
  messages: z.array(otChatMessageSchema).min(1).max(40),
  form: otFormSchema,
  entries: z.array(otEntrySchema).max(50),
  today: z.string().max(40).optional(),
  image: z
    .object({
      mimeType: z.string().min(1).max(100),
      base64: z.string().min(1).max(MAX_UPLOAD_BASE64),
    })
    .optional(),
});

export const otChatReplySchema = z.object({
  reply: z.string().max(4000).default(""),
  form: otFormSchema.partial().optional(),
  entries: z.array(otEntrySchema).max(50).optional(),
});

export type OtChatInput = z.infer<typeof otChatInput>;
export type OtChatReply = {
  reply: string;
  form?: Partial<OtForm>;
  entries?: OtEntry[];
};

/**
 * A supporting document uploaded for a record (the OB approval slip or a DTR
 * attachment). The file travels as raw base64 (same pattern as the biometric
 * import); the server enforces the 10 MB cap itself — the client check is only
 * for a friendlier, faster error.
 */
export const attachmentUploadInput = z.object({
  id,
  filename: z.string().min(1).max(200),
  contentType: z.string().min(1).max(150),
  base64: z.string().min(1).max(MAX_UPLOAD_BASE64),
});

/** `DELETE …/other-attachments?path=` — which additional file to drop. */
export const attachmentPathQuery = z.object({
  path: z.string().min(1).max(400),
});

/** One of the form's additional supporting files, identified by its stored path. */
export const attachmentPathInput = z.object({
  id,
  path: z.string().min(1).max(400),
});

/**
 * Upload into the optional B2 file store (`POST /files`). Same base64 wire
 * shape as an attachment; the server still checks the real bytes, the MIME
 * allow-list and the size cap before storing anything. `entityType` /
 * `entityId` are optional labels for the feature that keeps the returned key.
 */
export const fileUploadInput = z.object({
  filename: z.string().min(1).max(200),
  contentType: z.string().min(1).max(150),
  base64: z.string().min(1).max(MAX_UPLOAD_BASE64),
  entityType: z.string().min(1).max(50).optional(),
  entityId: z.string().min(1).max(100).optional(),
});

/** `GET /files/url?key=` / `DELETE /files?key=` — which stored object. */
export const fileKeyQuery = z.object({
  key: z.string().min(1).max(400),
});

export const upsertCodeInput = z.object({
  id: id.optional(),
  /** The account's unique sign-in ID — required, and unique across accounts. */
  idNumber: z.string().trim().min(1, "ID number is required.").max(64),
  role: roleSchema,
  // Optional when editing (blank = keep the current password). Required when
  // creating a new one — that and the length check happen in the service so
  // the user gets a friendly message either way. The length floor itself is
  // `PASSWORD_MIN_LENGTH`, deliberately short: an admin resetting a password
  // types a PIN, not a passphrase.
  password: z.string().optional(),
  // The employee's Designation (office/branch), Department and Position (job
  // title). Stored on the profile (columns `area` / `department` /
  // `designation` — see Task 1), NOT on the account row, because they are org
  // data the employee also edits under "My Account" and the forms already
  // auto-fill from there. Blank or omitted leaves the stored value untouched,
  // the same "blank = keep" rule the password uses.
  designation: z.string().trim().max(200).optional(),
  department: z.string().trim().max(200).optional(),
  position: z.string().trim().max(200).optional(),
});

/**
 * Shortest password the app accepts, in ONE place.
 *
 * The office wants short, easy-to-type passwords ("1234"), so the floor is a
 * PIN-style 4 characters and nothing in the app may be stricter than this:
 * the sign-in form, the admin's reset field and the schema validator all read
 * it from here. Before this constant the limit was written out as a bare `4`
 * in four different files, which is how a field ends up refusing a password
 * the server would have accepted.
 */
export const PASSWORD_MIN_LENGTH = 4;

export const changePasswordInput = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `New password must be at least ${PASSWORD_MIN_LENGTH} characters.`),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "New passwords don't match.",
    path: ["confirmPassword"],
  });

export const importBiometricInput = z.object({
  filename: z.string().max(200),
  mimeType: z.string().max(150),
  base64: z.string().min(1).max(MAX_UPLOAD_BASE64),
});

// AI help for the OB itinerary "Purpose(s)" field.
export const obPurposeInput = z.object({
  mode: z.enum(["generate", "enhance"]),
  // For "generate": the user's rough context / instructions. For "enhance": ignored.
  context: z.string().max(2000).default(""),
  // The current Purpose text (the thing to enhance, or extra context to generate from).
  current: z.string().max(4000).default(""),
});

// Conversational agent that fills the Official Business form for the user.
export const obChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().max(4000),
});

export const obChatInput = z.object({
  // Transcript so far (oldest first). The assistant answers the last user turn.
  messages: z.array(obChatMessageSchema).min(1).max(40),
  // The form exactly as it stands — the assistant patches it, never resets it.
  form: obFormSchema,
  entries: z.array(obEntrySchema).max(50),
  // The user's local date (YYYY-MM-DD) so "today" / "tomorrow" resolve correctly.
  today: z.string().max(40).optional(),
  // Optional photo/scan, handed to Gemini the same way the biometric import is.
  image: z
    .object({
      mimeType: z.string().min(1).max(100),
      base64: z.string().min(1).max(MAX_UPLOAD_BASE64),
    })
    .optional(),
});

/** The model's answer, validated before it is allowed to reach the client. */
export const obChatReplySchema = z.object({
  reply: z.string().max(4000).default(""),
  // Only the fields the assistant decided to change.
  form: obFormSchema.partial().optional(),
  // Full replacement itinerary, only present when it changed.
  entries: z.array(obEntrySchema).max(50).optional(),
});

export type ObChatInput = z.infer<typeof obChatInput>;

/**
 * What the assistant is allowed to send back: a short message plus, when needed,
 * the form fields it changed and the full replacement itinerary. Declared by
 * hand (rather than inferred) so the patch is a plain `Partial<ObForm>`.
 */
export type ObChatReply = {
  reply: string;
  form?: Partial<ObForm>;
  entries?: ObEntry[];
};

// AI help for the LOA "Reasons / Remarks" field (the OB Purpose twin).
export const loaReasonInput = z.object({
  mode: z.enum(["generate", "enhance"]),
  // For "generate": the user's rough context / instructions. For "enhance": ignored.
  context: z.string().max(2000).default(""),
  // The current Reasons text (the thing to enhance, or extra context to generate from).
  current: z.string().max(4000).default(""),
});

// Conversational agent that fills the Leave of Absence form for the user.
export const loaChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().max(4000),
});

export const loaChatInput = z.object({
  // Transcript so far (oldest first). The assistant answers the last user turn.
  messages: z.array(loaChatMessageSchema).min(1).max(40),
  // The form exactly as it stands — the assistant patches it, never resets it.
  form: loaFormSchema,
  // The user's local date (YYYY-MM-DD) so "today" / "tomorrow" resolve correctly.
  today: z.string().max(40).optional(),
  // Optional photo/scan, handed to Gemini the same way the biometric import is.
  image: z
    .object({
      mimeType: z.string().min(1).max(100),
      base64: z.string().min(1).max(MAX_UPLOAD_BASE64),
    })
    .optional(),
});

/** The model's answer, validated before it is allowed to reach the client. */
export const loaChatReplySchema = z.object({
  reply: z.string().max(4000).default(""),
  // Only the fields the assistant decided to change.
  form: loaFormSchema.partial().optional(),
});

export type LoaChatInput = z.infer<typeof loaChatInput>;

/**
 * What the LOA assistant is allowed to send back: a short message plus, when
 * needed, the form fields it changed. Declared by hand (rather than inferred)
 * so the patch is a plain `Partial<LoaForm>`.
 */
export type LoaChatReply = {
  reply: string;
  form?: Partial<LoaForm>;
};

export const employeeProfileSchema = z.object({
  emp_no: z.string(),
  full_name: z.string(),
  designation: z.string(),
  area: z.string(),
  department: z.string().default(""),
  signature: z.string().default(""),
  /**
   * 256 × 256 data URL. The cap is a guard, not a target: the cropper exports
   * WebP at roughly 15 KB (≈ 20 000 base64 chars), so anything near this
   * ceiling came from something other than this form.
   */
  photo: z.string().max(600_000, "That photo is too large — try a smaller one.").default(""),
  supervisor: z.string().default(""),
});

/**
 * The photo on its own — `PUT /api/profile/me/photo`.
 *
 * The profile page saves this the moment the user picks "Use photo", so it
 * must not travel with the rest of the form: saving the whole profile there
 * would silently commit whatever else they were half-way through typing.
 */
export const profilePhotoInput = z.object({
  photo: z.string().max(600_000, "That photo is too large — try a smaller one.").default(""),
});

// ── Accounts (admin) ─────────────────────────────────────────────────────────

/** Create an account. Same fields as `upsertCodeInput`, minus the id. */
export const createUserInput = upsertCodeInput.omit({ id: true });
/** Edit an account (id comes from the URL). Blank password keeps the current one. */
export const updateUserInput = createUserInput;

/**
 * `GET /api/users/photos?ids=a,b,c` — the batch every admin list uses to draw a
 * face beside a name (activity logs, app access, dashboard feeds).
 *
 * One comma-separated string rather than repeated params: the lists build it
 * from the ids they are already rendering, and the service caps how many ids it
 * will answer for so a hand-crafted URL can't ask for the whole company's
 * photos in one go. Empty is legal and returns nothing — a feed made only of
 * deleted accounts still asks.
 */
export const userPhotosInput = z.object({
  ids: z.string().max(4000).default(""),
});

// ── App access rules (admin) ─────────────────────────────────────────────────

export const accessRuleInput = z.object({
  app_key: z.enum(GRANTABLE_APP_KEYS),
  scope: z.enum(RULE_SCOPES),
  scope_value: z.string().trim().min(1).max(200),
  allow: z.boolean(),
});

export const appDefaultInput = z.object({
  app_key: z.enum(GRANTABLE_APP_KEYS),
  allow: z.boolean(),
});

// ── Designation / Department / Position lists ───────────────────────────────

export const orgKindInput = z.object({
  kind: z.enum(["designation", "department", "position"]),
  value: z.string().trim().min(1).max(200),
});

export const renameOrgOptionInput = orgKindInput.extend({
  next: z.string().trim().min(1, "Enter the new name.").max(200),
});

export const addOrgOptionInput = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("designation"),
    value: z.string().trim().min(1, "Enter the designation name.").max(200),
  }),
  z.object({
    kind: z.literal("department"),
    value: z.string().trim().min(1, "Enter the department name.").max(200),
  }),
  z.object({
    kind: z.literal("position"),
    value: z.string().trim().min(1, "Enter the position name.").max(200),
    department: z.string().trim().max(200).default(""),
  }),
]);

// ── Activity log, as query-string input (HTTP query values are strings) ─────

export const listActivityLogsQuery = z.object({
  search: z.string().trim().max(100).default(""),
  action: activityLogActionFilter.optional(),
  from: activityTimestamp.optional(),
  to: activityTimestamp.optional(),
  page: z.coerce.number().int().min(1).default(1),
});

// ── Data retention (admin settings → auto-delete old forms) ──────────────────

/**
 * The form types the cleanup can be pointed at, one checkbox each in the
 * admin UI. `dtr` is the Daily Time Record; the rest are the form tables.
 */
export const RETENTION_FORM_TYPES = ["dtr", "ob", "loa", "cos", "ot"] as const;

export type RetentionFormType = (typeof RETENTION_FORM_TYPES)[number];

export const retentionFormTypeSchema = z.enum(RETENTION_FORM_TYPES);

/**
 * The floor is 1 day, not a policy number: the office decides its own period
 * (7 days, 90, a year — their call). Zero or less is refused because it would
 * mean "everything older than right now", which is never what anyone means.
 */
export const RETENTION_MIN_DAYS = 1;

/**
 * The one global setting, saved as a single row. `formTypes` may be empty
 * (nothing selected); running a cleanup with none selected is refused by the
 * service, not by the schema, so the setting itself can always be saved.
 */
export const retentionSettingsInput = z.object({
  enabled: z.boolean(),
  days: z
    .number()
    .int("Enter a whole number of days.")
    .min(
      RETENTION_MIN_DAYS,
      `Keep forms for at least ${RETENTION_MIN_DAYS} day — the period is yours to choose.`,
    )
    .max(3650, "That is more than 10 years — pick a smaller number."),
  formTypes: z.array(retentionFormTypeSchema).max(RETENTION_FORM_TYPES.length),
});

/**
 * `POST /admin/retention/preview` counts what the *draft* on screen would
 * delete. The settings are optional so a plain `{}` previews the saved ones.
 */
export const retentionPreviewInput = z.object({
  settings: retentionSettingsInput.optional(),
});

export type RetentionSettings = z.infer<typeof retentionSettingsInput>;

/** The saved setting as the API returns it. */
export type RetentionSettingsDoc = RetentionSettings & {
  updatedAt: string;
};

/** What one form type would lose, and what the whole preview adds up to. */
export type RetentionPreview = {
  days: number;
  /** ISO timestamp — everything created before this is in scope. */
  cutoff: string;
  /** The ticked types. Only these are counted into the two totals below. */
  chosen: RetentionFormType[];
  /**
   * Every type, ticked or not — the page shows each one's count so an admin
   * can see what a type holds before ticking it. Untick a type and its forms
   * simply drop out of the totals.
   */
  types: { type: RetentionFormType; forms: number; files: number }[];
  totalForms: number;
  totalFiles: number;
};

/**
 * One row of `cleanup_runs` — the permanent history of what a run deleted
 * (the activity log only keeps 30 days). Per-type counts are sparse: a type
 * with no deletions has no key.
 */
export type CleanupRunSummary = {
  id: string;
  ranAt: string;
  ranById: string | null;
  ranByName: string | null;
  ranByNumber: string | null;
  days: number;
  formTypes: RetentionFormType[];
  formsDeleted: Partial<Record<RetentionFormType, number>>;
  filesDeleted: Partial<Record<RetentionFormType, number>>;
  /** `completed`, or `completed_with_file_errors` when storage lagged behind. */
  status: string;
};

/** The three possible storage rules. */
export const STORAGE_RULES = ["supabase-first", "b2-only", "supabase-only"] as const;
export const storageRuleSchema = z.enum(STORAGE_RULES);

/** The two possible backends. */
export const STORAGE_BACKENDS = ["supabase", "b2"] as const;
export const storageBackendSchema = z.enum(STORAGE_BACKENDS);

/** Input for saving storage settings (rule + free‑space threshold). */
export const storageSettingsInput = z.object({
  rule: storageRuleSchema,
  minFreePercent: z.number().int().min(1).max(50),
});

/** Input for the orphan‑cleanup mutation. */
export const storageOrphansInput = z.object({ backend: storageBackendSchema });

/** The saved storage setting as the API returns it. */
export type StorageSettings = z.infer<typeof storageSettingsInput>;
/** The saved setting as the API returns it, with timestamps and actor. */
export type StorageSettingsDoc = StorageSettings & {
  updatedAt: string;
  updatedByName: string | null;
};

/** Which backend a stored file lives on. */
export type StorageBackend = z.infer<typeof storageBackendSchema>;

/** References from the database, split by backend and kind. */
export type StorageReference = {
  /** 'supabase' or 'b2'. */
  backend: StorageBackend;
  /** The key/path — without a `b2:` prefix for B2 files. */
  key: string;
};

export type StorageReferences = {
  /** Main attachment_path refs. */
  main: StorageReference[];
  /** Other‑attachments paths + files keys. */
  other: StorageReference[];
};

/** Overview of storage across both backends. */
export type StorageOverview = {
  /** The current rule + threshold. */
  settings: StorageSettingsDoc;
  /** Which backend new uploads will use right now. */
  nextBackend: StorageBackend;
  /** Totals across both storages. */
  totals: {
    usedBytes: number;
    files: number;
    orphanBytes: number;
    orphanFiles: number;
  };
  /** Per‑backend usage + categorisation. */
  supabase: StorageBackendUsage;
  b2: StorageBackendUsage;
};

/** What one backend's usage looks like. */
export type StorageBackendUsage = {
  /** The backend name. */
  backend: StorageBackend;
  /** The bucket name shown on the card. */
  bucket: string;
  /** Whether the backend answers (B2 can be switched off by unset credentials). */
  connected: boolean;
  /** The bucket / plan limit (bytes). */
  limitBytes: number;
  /** How many bytes are used right now. */
  usedBytes: number;
  /** How many free bytes remain. */
  freeBytes: number;
  /** How many objects / files are stored. */
  files: number;
  /** Bytes attributed to "approval slips" (main attachments). */
  approvalBytes: number;
  /** How many objects are approval slips. */
  approvalFiles: number;
  /** Bytes attributed to other/extra files. */
  otherBytes: number;
  /** How many objects are other/extra files. */
  otherFiles: number;
  /** Bytes that are orphaned (unreferenced). */
  orphanBytes: number;
  /** Count of orphaned files. */
  orphanFiles: number;
  /** Public dashboard URL (may be null when not configured). */
  dashboardUrl: string | null;
  /** Optional error string (e.g. listing failed). */
  error?: string;
};

/** Result of cleaning up orphans for one backend. */
export type StorageCleanupResult = {
  /** Which backend was cleaned. */
  backend: StorageBackend;
  /** How many files were removed. */
  files: number;
  /** How many bytes were removed. */
  bytes: number;
  /** How many deletions failed (still present). */
  failed: number;
};

/** Input for the orphan‑cleanup mutation (which backend). */
export const storageOverviewQuery = z.object({
  refresh: z.enum(["true", "false"]).optional(),
});

/** Input for previewing orphaned files (optional backend filter). */
export const storageOrphansPreviewQuery = z.object({
  backend: z.enum(["supabase", "b2", "everywhere"]).optional().default("everywhere"),
});

/** Input for deleting specific orphaned files. */
export const storageOrphansDeleteInput = z.object({
  files: z.array(
    z.object({
      key: z.string().min(1),
      backend: storageBackendSchema,
    }),
  ),
});

/** The delete input as typed code sees it. */
export type StorageOrphansDeleteInput = z.infer<typeof storageOrphansDeleteInput>;

/** One orphaned file in the preview list. */
export type OrphanedFile = {
  /** Object key in the bucket (without any `b2:` prefix). */
  key: string;
  /** Which backend it lives on. */
  backend: StorageBackend;
  /** Size in bytes. */
  sizeBytes: number;
  /** Last modified timestamp, if known. */
  lastModified: string | null;
  /** Plain‑English reason it is considered orphaned. */
  reason: string;
};

/** Preview of orphaned files for one or both backends. */
export type StorageOrphanPreview = {
  supabase: OrphanedFile[];
  b2: OrphanedFile[];
  totals: { files: number; bytes: number };
  /** How long a fresh upload is protected before it can count as an orphan. */
  graceSeconds: number;
};

/** Result of deleting specific orphaned files. */
export type StorageOrphanDeleteResult = {
  backend: StorageBackend;
  removed: number;
  failed: number;
  bytes: number;
};
