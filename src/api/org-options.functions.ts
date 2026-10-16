import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAdmin } from "@/server/auth/session.server";
import { logActivity } from "@/server/services/activity-log.server";
import * as orgOptions from "@/server/services/org-options.server";

/**
 * The admin-editable Department / Position lists behind the user-management
 * and My Account pickers. Admin-only — these lists feed the dropdowns
 * everyone picks from.
 */
export const listOrgOptions = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  return await orgOptions.listOrgOptions();
});

const orgKindInput = z.object({
  kind: z.enum(["designation", "department", "position"]),
  value: z.string().trim().min(1).max(200),
});

const renameOrgOptionInput = orgKindInput.extend({
  next: z.string().trim().min(1, "Enter the new name.").max(200),
});

/** Rename a department or position everywhere it is stored. */
export const renameOrgOption = createServerFn({ method: "POST" })
  .validator(renameOrgOptionInput)
  .handler(async ({ data }) => {
    const admin = await requireAdmin();
    await orgOptions.renameOrgOption(data);
    await logActivity({
      action: "org.updated",
      actorId: admin.id,
      actorName: admin.label,
      actorNumber: admin.idNumber,
      target: `${data.kind}: ${data.value}`,
      detail: `renamed to ${data.next.trim()}`,
    });
    return { ok: true as const };
  });

/** Delete a department or position from the pickers (cascades to rules). */
export const deleteOrgOption = createServerFn({ method: "POST" })
  .validator(orgKindInput)
  .handler(async ({ data }) => {
    const admin = await requireAdmin();
    await orgOptions.deleteOrgOption(data);
    await logActivity({
      action: "org.updated",
      actorId: admin.id,
      actorName: admin.label,
      actorNumber: admin.idNumber,
      target: `${data.kind}: ${data.value}`,
      detail: "deleted",
    });
    return { ok: true as const };
  });

/** Add a department or position to the pickers (deduplicated). */
export const addOrgOption = createServerFn({ method: "POST" })
  .validator(
    z.discriminatedUnion("kind", [
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
    ]),
  )
  .handler(async ({ data }) => {
    const admin = await requireAdmin();
    await orgOptions.addOrgOption(data);
    await logActivity({
      action: "org.updated",
      actorId: admin.id,
      actorName: admin.label,
      actorNumber: admin.idNumber,
      target: `${data.kind}: ${data.value.trim()}`,
      detail: "added",
    });
    return { ok: true as const };
  });
