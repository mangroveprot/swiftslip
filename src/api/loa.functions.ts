import { createServerFn } from "@tanstack/react-start";

import { requireUser } from "@/server/auth/session.server";
import { logActivity } from "@/server/services/activity-log.server";
import * as attachments from "@/server/services/attachments.server";
import { chatLoaAssistant as chatLoaAssistantService } from "@/server/services/loa-assistant.server";
import * as loa from "@/server/services/loa.server";
import { writeLoaReason as writeLoaReasonService } from "@/server/services/loa-reason.server";
import * as profiles from "@/server/services/profiles.server";
import {
  attachmentUploadInput,
  createLoaFormInput,
  deleteRowInput,
  idInput,
  loaChatInput,
  loaReasonInput,
  saveLoaFormInput,
} from "@/shared/schemas";

export const listLoaForms = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser();
  return await loa.listLoaForms(user.id);
});

export const getLoaForm = createServerFn({ method: "GET" })
  .validator(idInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    return await loa.getLoaForm(data.id, user.id);
  });

export const createLoaForm = createServerFn({ method: "POST" })
  .validator(createLoaFormInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const profile = await profiles.getProfile(user.id);
    const created = await loa.createLoaForm(user.id, {
      id_number: profile.emp_no,
      employee_name: profile.full_name,
      department: profile.area,
      position: profile.designation,
      employee_signature: profile.signature,
      date_filed: data.date_filed ?? "",
    });
    await logActivity({
      action: "loa.created",
      actorId: user.id,
      actorName: user.label,
      actorNumber: user.idNumber,
      target: `${profile.full_name} (${profile.emp_no})`,
      detail: `Form ${created.id}`,
    });
    return created;
  });

export const saveLoaForm = createServerFn({ method: "POST" })
  .validator(saveLoaFormInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    await loa.saveLoaForm(data.id, user.id, data.form);
    return { ok: true as const };
  });

export const deleteLoaForm = createServerFn({ method: "POST" })
  .validator(deleteRowInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const removed = await loa.deleteLoaForm(data.id, user.id);
    // `quiet` = the app sweeping an untouched scaffold away — housekeeping,
    // not a user removing a form, so it stays out of the activity log.
    if (!data.quiet) {
      await logActivity({
        action: "loa.deleted",
        actorId: user.id,
        actorName: user.label,
        actorNumber: user.idNumber,
        target: `${removed.employee_name || user.label} (${removed.id_number || user.idNumber})`,
        detail: `Form ${removed.id}`,
      });
    }
    return { ok: true as const };
  });

/** Store the medical certificate for one of the signed-in user's forms. */
export const uploadLoaAttachment = createServerFn({ method: "POST" })
  .validator(attachmentUploadInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const stored = await attachments.uploadAttachment("loa_forms", "LOA form", data, user.id);
    await logActivity({
      action: "attachment.uploaded",
      actorId: user.id,
      actorName: user.label,
      actorNumber: user.idNumber,
      target: `LOA form ${data.id}`,
      detail: stored.name,
    });
    return stored;
  });

/** Short-lived signed link to the form's attachment (`null` when there is none). */
export const getLoaAttachmentUrl = createServerFn({ method: "GET" })
  .validator(idInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    return await attachments.getAttachmentUrl("loa_forms", "LOA form", data.id, user.id);
  });

export const removeLoaAttachment = createServerFn({ method: "POST" })
  .validator(idInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const removed = await attachments.removeAttachment("loa_forms", "LOA form", data.id, user.id);
    await logActivity({
      action: "attachment.removed",
      actorId: user.id,
      actorName: user.label,
      actorNumber: user.idNumber,
      target: `LOA form ${data.id}`,
      detail: removed.name || null,
    });
    return removed;
  });

export const writeLoaReason = createServerFn({ method: "POST" })
  .validator(loaReasonInput)
  .handler(async ({ data }) => {
    await requireUser();
    return await writeLoaReasonService(data);
  });

export const chatLoaAssistant = createServerFn({ method: "POST" })
  .validator(loaChatInput)
  .handler(async ({ data }) => {
    await requireUser();
    return await chatLoaAssistantService(data);
  });
