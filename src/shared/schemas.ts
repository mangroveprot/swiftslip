/**
 * Runtime validation for everything that crosses the client → server boundary.
 * Used by `src/api/*` as server-function input validators.
 */
import { z } from "zod";

import { isPeriod } from "./period";
import type { Period } from "./types";

const period = z
  .string()
  .refine(isPeriod, "Invalid period")
  .transform((v) => v as Period);
const id = z.string().min(1);

export const roleSchema = z.enum(["admin", "user"]);

export const signInInput = z.object({ password: z.string().max(200) });

export const idInput = z.object({ id });

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

export const upsertCodeInput = z.object({
  id: id.optional(),
  label: z.string(),
  role: roleSchema,
  // Optional when editing (blank = keep the current password). Required when
  // creating a new one — that and the length check happen in the service so
  // the user gets a friendly message either way.
  password: z.string().optional(),
});

export const changePasswordInput = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z.string().min(4, "New password must be at least 4 characters."),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "New passwords don't match.",
    path: ["confirmPassword"],
  });

export const importBiometricInput = z.object({
  filename: z.string(),
  mimeType: z.string(),
  base64: z.string().min(1),
});

// AI help for the OB itinerary "Purpose(s)" field.
export const obPurposeInput = z.object({
  mode: z.enum(["generate", "enhance"]),
  // For "generate": the user's rough context / instructions. For "enhance": ignored.
  context: z.string().max(2000).default(""),
  // The current Purpose text (the thing to enhance, or extra context to generate from).
  current: z.string().max(4000).default(""),
});

export const employeeProfileSchema = z.object({
  emp_no: z.string(),
  full_name: z.string(),
  designation: z.string(),
  area: z.string(),
});
