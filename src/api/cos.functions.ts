import { createServerFn } from "@tanstack/react-start";

import { requireUser } from "@/server/auth/session.server";
import { logActivity } from "@/server/services/activity-log.server";
import * as attachments from "@/server/services/attachments.server";
import { chatCosAssistant as chatCosAssistantService } from "@/server/services/cos-assistant.server";
import { writeCosReason as writeCosReasonService } from "@/server/services/cos-reason.server";
import * as cos from "@/server/services/cos.server";
import * as profiles from "@/server/services/profiles.server";
import {
  attachmentUploadInput,
  cosChatInput,
  cosReasonInput,
  createCosFormInput,
  deleteRowInput,
  idInput,
  saveCosFormInput,
} from "@/shared/schemas";

export const listCosForms = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser();
  return await cos.listCosForms(user.id);
});

export const getCosForm = createServerFn({ method: "GET" })
  .validator(idInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    return await cos.getCosForm(data.id, user.id);
  });

export const createCosForm = createServerFn({ method: "POST" })
  .validator(createCosFormInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const profile = await profiles.getProfile(user.id);
    const created = await cos.createCosForm(user.id, {
      id_number: profile.emp_no,
      employee_name: profile.full_name,
      plant_location: profile.area,
      position: profile.designation,
      employee_signature: profile.signature,
      date_filed: data.date_filed ?? "",
    });
    await logActivity({
      action: "cos.created",
      actorId: user.id,
      actorName: user.label,
      actorNumber: user.idNumber,
      target: `${profile.full_name} (${profile.emp_no})`,
      detail: `Form ${created.id}`,
    });
    return created;
  });

export const saveCosForm = createServerFn({ method: "POST" })
  .validator(saveCosFormInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    await cos.saveCosForm(data.id, user.id, data.form, data.schedules);
    return { ok: true as const };
  });

export const deleteCosForm = createServerFn({ method: "POST" })
  .validator(deleteRowInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const removed = await cos.deleteCosForm(data.id, user.id);
    // `quiet` = the app sweeping an untouched scaffold away — housekeeping,
    // not a user removing a form, so it stays out of the activity log.
    if (!data.quiet) {
      await logActivity({
        action: "cos.deleted",
        actorId: user.id,
        actorName: user.label,
        actorNumber: user.idNumber,
        target: `${removed.employee_name || user.label} (${removed.id_number || user.idNumber})`,
        detail: `Form ${removed.id}`,
      });
    }
    return { ok: true as const };
  });

/** Store the approval-slip document for one of the signed-in user's forms. */
export const uploadCosAttachment = createServerFn({ method: "POST" })
  .validator(attachmentUploadInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const stored = await attachments.uploadAttachment("cos_forms", "Form", data, user.id);
    await logActivity({
      action: "attachment.uploaded",
      actorId: user.id,
      actorName: user.label,
      actorNumber: user.idNumber,
      target: `COS form ${data.id}`,
      detail: stored.name,
    });
    return stored;
  });

/** Short-lived signed link to the form's attachment (`null` when there is none). */
export const getCosAttachmentUrl = createServerFn({ method: "GET" })
  .validator(idInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    return await attachments.getAttachmentUrl("cos_forms", "Form", data.id, user.id);
  });

export const removeCosAttachment = createServerFn({ method: "POST" })
  .validator(idInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const removed = await attachments.removeAttachment("cos_forms", "Form", data.id, user.id);
    await logActivity({
      action: "attachment.removed",
      actorId: user.id,
      actorName: user.label,
      actorNumber: user.idNumber,
      target: `COS form ${data.id}`,
      detail: removed.name || null,
    });
    return removed;
  });

export const writeCosReason = createServerFn({ method: "POST" })
  .validator(cosReasonInput)
  .handler(async ({ data }) => {
    await requireUser();
    return await writeCosReasonService(data);
  });

export const chatCosAssistant = createServerFn({ method: "POST" })
  .validator(cosChatInput)
  .handler(async ({ data }) => {
    await requireUser();
    return await chatCosAssistantService(data);
  });
