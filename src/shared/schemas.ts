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

export const employeeProfileSchema = z.object({
  emp_no: z.string(),
  full_name: z.string(),
  designation: z.string(),
  area: z.string(),
});
