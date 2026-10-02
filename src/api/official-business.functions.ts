import { createServerFn } from "@tanstack/react-start";

import { requireUser } from "@/server/auth/session.server";
import { logActivity } from "@/server/services/activity-log.server";
import * as attachments from "@/server/services/attachments.server";
import { chatObAssistant as chatObAssistantService } from "@/server/services/ob-assistant.server";
import * as ob from "@/server/services/official-business.server";
import { writeObPurpose as writeObPurposeService } from "@/server/services/ob-purpose.server";
import * as profiles from "@/server/services/profiles.server";
import {
  attachmentUploadInput,
  createObFormInput,
  deleteRowInput,
  idInput,
  obChatInput,
  obPurposeInput,
  saveObFormInput,
} from "@/shared/schemas";

export const listObForms = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser();
  return await ob.listObForms(user.id);
});

export const getObForm = createServerFn({ method: "GET" })
  .validator(idInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    return await ob.getObForm(data.id, user.id);
  });

export const createObForm = createServerFn({ method: "POST" })
  .validator(createObFormInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const profile = await profiles.getProfile(user.id);
    const created = await ob.createObForm(user.id, {
      id_number: profile.emp_no,
      employee_name: profile.full_name,
      department: profile.area,
      position: profile.designation,
      employee_signature: profile.signature,
      date_filed: data.date_filed ?? "",
    });
    await logActivity({
      action: "ob.created",
      actorId: user.id,
      actorName: user.label,
      actorNumber: user.idNumber,
      target: `${profile.full_name} (${profile.emp_no})`,
      detail: `Form ${created.id}`,
    });
    return created;
  });

export const saveObForm = createServerFn({ method: "POST" })
  .validator(saveObFormInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    await ob.saveObForm(data.id, user.id, data.form, data.entries);
    return { ok: true as const };
  });

export const deleteObForm = createServerFn({ method: "POST" })
  .validator(deleteRowInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const removed = await ob.deleteObForm(data.id, user.id);
    // `quiet` = the app sweeping an untouched scaffold away — housekeeping,
    // not a user removing a form, so it stays out of the activity log.
    if (!data.quiet) {
      await logActivity({
        action: "ob.deleted",
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
export const uploadObAttachment = createServerFn({ method: "POST" })
  .validator(attachmentUploadInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const stored = await attachments.uploadAttachment("ob_forms", "Form", data, user.id);
    await logActivity({
      action: "attachment.uploaded",
      actorId: user.id,
      actorName: user.label,
      actorNumber: user.idNumber,
      target: `Form ${data.id}`,
      detail: stored.name,
    });
    return stored;
  });

/** Short-lived signed link to the form's attachment (`null` when there is none). */
export const getObAttachmentUrl = createServerFn({ method: "GET" })
  .validator(idInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    return await attachments.getAttachmentUrl("ob_forms", "Form", data.id, user.id);
  });

export const removeObAttachment = createServerFn({ method: "POST" })
  .validator(idInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const removed = await attachments.removeAttachment("ob_forms", "Form", data.id, user.id);
    await logActivity({
      action: "attachment.removed",
      actorId: user.id,
      actorName: user.label,
      actorNumber: user.idNumber,
      target: `Form ${data.id}`,
      detail: removed.name || null,
    });
    return removed;
  });

export const writeObPurpose = createServerFn({ method: "POST" })
  .validator(obPurposeInput)
  .handler(async ({ data }) => {
    await requireUser();
    return await writeObPurposeService(data);
  });

export const chatObAssistant = createServerFn({ method: "POST" })
  .validator(obChatInput)
  .handler(async ({ data }) => {
    await requireUser();
    return await chatObAssistantService(data);
  });
